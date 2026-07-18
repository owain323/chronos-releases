/**
 * Phase 8 · AI 路由 (Planner + Executor)
 *
 * 红线:
 * · Planner 不访问 DB ✅
 * · Executor 不调用 LLM ✅
 * · createdVia: "AI" 标记
 */
import { z } from "zod";
import crypto from "crypto";
import { router, protectedProcedure } from "../_core/trpc";
import { plan } from "../services/ai/AgentService";
import { evaluate } from "../services/ai/PolicyEngine";
import * as db from "../db";
import { recordAudit } from "../lib/audit";
import { requireEntityAccess } from "../lib/project-guard";
import { updateTask, deleteTask } from "../services/TaskService";
import { recordAIExecutionLog } from "../db/ai_execution_logs";

export const aiRouter = router({
  /** Step 1 · 生成计划 */
  plan: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(1),
        workspaceId: z.number(),
        projectId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.workspaceId) throw new Error("未选择工作区");
      if (input.workspaceId !== ctx.workspaceId)
        throw new Error("工作区不一致");

      const idempotencyKey = crypto.randomUUID();
      let result: any;

      try {
        result = await plan({
          prompt: input.prompt,
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          userId: ctx.user!.id,
          workspaceRole: ctx.workspaceRole ?? "member",
        });
      } catch (e: unknown) {
        // LLM 调用失败 — 创建 run 记录 + 失败日志
        const r = await db.createAIRun(
          ctx.user!.id,
          ctx.workspaceId!,
          {
            intent: "CREATE_PROJECT",
            commands: [],
            reasoning_summary: `错误: ${e instanceof Error ? e.message : String(e)}`,
            schema_version: 1,
          },
          idempotencyKey,
          input.projectId
        );
        const runId = Number(r.lastInsertRowid);
        db.updateAIRunStatus(runId, "failed");
        recordAIExecutionLog({
          runId,
          model: "unknown",
          status: "error",
          error: (e as Error).message || String(e),
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          durationMs: 0,
        });
        throw e;
      }

      const r = await db.createAIRun(
        ctx.user!.id,
        ctx.workspaceId!,
        result.plan,
        idempotencyKey,
        input.projectId
      );
      const runId = Number(r.lastInsertRowid);
      db.updateAIRunStatus(runId, "pending");

      // 记录 LLM 调用日志
      recordAIExecutionLog({
        runId,
        model: result.cost.model,
        inputTokens: result.cost.inputTokens,
        outputTokens: result.cost.outputTokens,
        cost: result.cost.cost,
        status: "success",
        durationMs: result.cost.durationMs || 0,
      });

      return { runId, ...result, idempotencyKey };
    }),

  /** Step 2 · 确认执行 */
  confirm: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const run: any = db.getAIRun(input.runId);
      if (!run) throw new Error("AI Run 不存在");
      if (run.userId !== ctx.user!.id) throw new Error("无权操作");
      if (run.workspaceId !== ctx.workspaceId) throw new Error("工作区不一致");
      if (run.status !== "pending") throw new Error("当前状态不可执行");

      db.updateAIRunStatus(input.runId, "executing");
      const plan = JSON.parse(run.plan);
      const results: any[] = [];
      const errors: string[] = [];
      const pendingApproval: string[] = [];
      let successCount = 0;

      for (const cmd of plan.commands) {
        try {
          const decision = evaluate(cmd, ctx.workspaceRole ?? "member");
          if (decision === "DENY") {
            errors.push(`${cmd.action}: 权限不足`);
            continue;
          }
          if (decision === "REQUIRE_APPROVAL") {
            pendingApproval.push(cmd.action);
            results.push({
              action: cmd.action,
              ok: false,
              approvalRequired: true,
            });
            continue;
          }
          const res = await executeCommand(cmd, run.workspaceId, ctx.user!.id);
          successCount++;
          results.push({ action: cmd.action, ok: true, result: res });
        } catch (e: unknown) {
          errors.push(
            `${cmd.action}: ${e instanceof Error ? e.message : String(e)}`
          );
          results.push({
            action: cmd.action,
            ok: false,
            error: (e as Error).message || String(e),
          });
        }
      }

      const hasErrors = errors.length > 0;
      const hasApprovals = pendingApproval.length > 0;
      const finalStatus =
        hasErrors && successCount === 0 && !hasApprovals
          ? "failed"
          : hasApprovals && successCount === 0
            ? "pending_approval"
            : "completed";
      db.updateAIRunStatus(input.runId, finalStatus);

      recordAudit({
        userId: ctx.user!.id,
        workspaceId: ctx.workspaceId!,
        action: "execute",
        entity: "ai_run",
        entityId: input.runId,
        after: {
          status: finalStatus,
          success: successCount,
          errors: errors.length,
        },
      });
      return {
        status: finalStatus,
        results,
        errors,
        successCount,
        pendingApproval,
      };
    }),

  /** Step 2 · 取消 */
  cancel: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const run: any = db.getAIRun(input.runId);
      if (!run) throw new Error("AI Run 不存在");
      if (run.userId !== ctx.user!.id) throw new Error("无权操作");
      if (run.status !== "planning" && run.status !== "pending")
        throw new Error("当前状态不可取消");

      db.updateAIRunStatus(input.runId, "cancelled");
      recordAudit({
        userId: ctx.user!.id,
        workspaceId: ctx.workspaceId!,
        action: "cancel",
        entity: "ai_run",
        entityId: input.runId,
      });
      return { ok: true };
    }),

  /** 历史记录 */
  history: protectedProcedure.query(async ({ ctx }) => {
    return db.getRunsByUser(ctx.user!.id);
  }),

  /** 成本统计 */
  costStats: protectedProcedure.query(async ({ ctx }) => {
    return db.getAICostStats(ctx.user!.id);
  }),
});

/** Executor 引擎 */
async function executeCommand(
  cmd: { action: string; params: any },
  workspaceId: number,
  userId: number
): Promise<any> {
  // 安全: 写操作需权限检查
  const writeActions = [
    "create_project",
    "create_cost_entry",
    "create_revenue_entry",
    "update_task",
    "delete_task",
    "delete_project",
  ];
  if (writeActions.includes(cmd.action)) {
    const { requireProjectAccess } = await import("../lib/project-guard");
    if (cmd.params.projectId) {
      await requireProjectAccess(userId, cmd.params.projectId);
    }
  }
  switch (cmd.action) {
    case "create_project": {
      const p = await db.createProject({
        name: cmd.params.name || "未命名项目",
        description: cmd.params.description,
        workspaceId,
        ownerId: userId,
      });
      const pid = Number(p.lastInsertRowid);
      await db.addProjectMember({ projectId: pid, userId, role: "owner" });
      return { projectId: pid, name: cmd.params.name };
    }
    case "create_task": {
      const allProjects = await db.getProjectsByUserId(userId, workspaceId);
      const project = allProjects.find(
        (p: any) => p.name === cmd.params.projectName
      );
      if (!project) throw new Error(`项目"${cmd.params.projectName}"不存在`);
      const t = await db.createTask({
        title: cmd.params.title || "未命名任务",
        description: cmd.params.description,
        projectId: project.id,
        columnId: 1,
        creatorId: userId,
        priority: cmd.params.priority || "medium",
        order: 0,
      });
      return { taskId: Number(t.lastInsertRowid), title: cmd.params.title };
    }
    case "create_cost_entry": {
      const e = await db.createCostEntry({
        projectId: cmd.params.projectId,
        name: cmd.params.name || "未命名",
        amount: String(cmd.params.amount || 0),
        category: cmd.params.category || "other",
        notes: cmd.params.notes || "",
        createdBy: userId,
      });
      return { costId: Number(e.lastInsertRowid), name: cmd.params.name };
    }
    case "create_revenue_entry": {
      const e = await db.createRevenueEntry({
        projectId: cmd.params.projectId,
        name: cmd.params.name || "未命名",
        amount: String(cmd.params.amount || 0),
        category: cmd.params.category || "other",
        notes: cmd.params.notes || "",
        createdBy: userId,
      });
      return { revenueId: Number(e.lastInsertRowid), name: cmd.params.name };
    }
    case "update_task": {
      // v4.2: 防止AI跨项目改删任务
      const t = await db.getTaskById(cmd.params.id as number);
      if (!t) throw new Error("任务不存在");
      await requireEntityAccess("task", t.id, userId);
      await updateTask(cmd.params.id as number, {
        title: cmd.params.title as string,
        description: cmd.params.description as string,
        columnId: cmd.params.columnId as number,
        priority: cmd.params.priority as string,
        dueDate: cmd.params.dueDate as string,
      });
      return { taskId: cmd.params.id, updated: true };
    }
    case "delete_task": {
      const dt = await db.getTaskById(cmd.params.id as number);
      if (!dt) throw new Error("任务不存在");
      await requireEntityAccess("task", dt.id, userId);
      await deleteTask(cmd.params.id as number);
      return { taskId: cmd.params.id, deleted: true };
    }
    default:
      throw new Error(`未知 action: ${cmd.action}`);
  }
}
