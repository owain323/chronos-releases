import { systemRouter } from "./_core/systemRouter";
import { authRouter } from "./routers/auth";
import { invalidateCache } from "./lib/cache";
import { financeRouter } from "./routers/finance";
import { dashboardRouter } from "./routers/dashboard";
import { accountingRouter } from "./routers/accounting";
import { webhooksRouter } from "./routers/webhooks";
import { notificationsRouter } from "./routers/notifications";
import { subtasksRouter } from "./routers/subtasks";
import { commentsRouter } from "./routers/comments";
import { kanbanRouter } from "./routers/kanban";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, permissionProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { getWorkspaceMembers } from "./db/workspaces";

import { notify } from "./lib/notifications";
type MemberInfo = {
  userId: number;
  role: string;
  id?: number;
  workspaceId?: number;
};

// ===== 工作区成员检查 helper（统一替代散落的 getWorkspaceMembers + find + throw 模式）=====
/** 查询成员身份（不抛错），供 acceptInvite 等「无成员则走其他分支」的场景使用 */
async function getWorkspaceMembership(workspaceId: number, userId: number) {
  const members = await getWorkspaceMembers(workspaceId);
  const member = members.find((m: MemberInfo) => m.userId === userId);
  return { members, member };
}

/** 要求调用者是指定工作区成员；可选限定角色（如仅 owner/admin），无权抛 FORBIDDEN */
async function requireWorkspaceMember(
  workspaceId: number,
  userId: number,
  opts?: { roles?: string[]; message?: string }
) {
  const { members, member } = await getWorkspaceMembership(workspaceId, userId);
  if (!member) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: opts?.message ?? "你不是该工作区成员",
    });
  }
  if (opts?.roles && !opts.roles.includes(member.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: opts.message ?? "权限不足",
    });
  }
  return { members, member };
}

import { requireProjectAccess, requireEntityAccess } from "./lib/project-guard";
import { recordAudit } from "./lib/audit";
import { createTask, updateTask, deleteTask } from "./services/TaskService";
import { aiRouter } from "./routers/ai";
import { createProject } from "./services/ProjectService";
import {
  createRevenue,
  updateRevenue,
  deleteRevenue,
} from "./services/RevenueService";
import { createCost, deleteCost } from "./services/CostService";
import { getCostSummary, getProjectStats } from "./services/AnalyticsService";
import { maskFinanceData } from "./services/PermissionService";
import { searchRouter } from "./routers/search";
import { financialReportsRouter } from "./routers/financial-reports";
import { signToken } from "./routers/auth";

// ===== 通知辅助函数 =====
// 为什么不 await 通知发送？
// → 通知是副作用，不能阻塞用户操作。用 .catch() 静默失败，错误只打印日志。

// ===== 通知辅助函数 =====
// notify() 已由 lib/notifications.ts 统一提供

export const appRouter = router({
  system: systemRouter,
  ai: aiRouter,
  search: searchRouter,
  auth: authRouter,

  // ===== Workspace routes =====
  workspaces: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getWorkspacesByUserId(ctx.user.id);
    }),
    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1),
          slug: z.string().min(2).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const slug =
          input.slug ||
          input.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 64) ||
          "workspace";
        await db.createWorkspace({
          name: input.name,
          slug,
          createdBy: ctx.user.id,
        });
        return await db.getWorkspaceBySlug(slug);
      }),
    members: protectedProcedure
      .input(z.object({ workspaceId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { members } = await requireWorkspaceMember(
          input.workspaceId,
          ctx.user.id
        );
        return members;
      }),
    invite: protectedProcedure
      .input(z.object({ workspaceId: z.number(), userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await requireWorkspaceMember(input.workspaceId, ctx.user.id, {
          roles: ["owner", "admin"],
          message: "仅管理员可邀请成员",
        });
        return db.addWorkspaceMember(input.workspaceId, input.userId);
      }),
    /** 按邮箱邀请 — 查用户, 加成员, 送邮件 */
    inviteByEmail: protectedProcedure
      .input(z.object({ workspaceId: z.number(), email: z.string().email() }))
      .mutation(async ({ input, ctx }) => {
        // 与 invite 对齐: 仅 owner/admin 可邀请
        await requireWorkspaceMember(input.workspaceId, ctx.user.id, {
          roles: ["owner", "admin"],
          message: "仅管理员可邀请成员",
        });
        const user = await db.getUserByEmail(input.email);
        if (!user)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "该邮箱未注册 CHRONOS",
          });
        await db.addWorkspaceMember(input.workspaceId, user.id, "member");
        // 异步送邮件（不阻塞）
        import("./services/EmailService")
          .then(({ sendEmail }) => {
            sendEmail({
              to: input.email,
              subject: "你被邀请加入 CHRONOS 工作区",
              text: `${ctx.user.name || "管理员"} 邀请你加入工作区。登录后即可查看。`,
            }).catch((e: unknown) => {
              console.warn(
                "[Projects] create side-effect failed:",
                e instanceof Error ? e.message : String(e)
              );
            });
          })
          .catch((e: unknown) => {
            console.warn(
              "[Projects] side-effect failed:",
              e instanceof Error ? e.message : String(e)
            );
          });
        return { ok: true, userId: user.id };
      }),

    acceptInvite: protectedProcedure
      .input(z.object({ workspaceId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { member: existing } = await getWorkspaceMembership(
          input.workspaceId,
          ctx.user.id
        );
        if (existing) {
          // 已在 workspace 中，更新状态
          const { db } = await import("./db/connection");
          const { eq, and } = await import("drizzle-orm");
          const { workspaceMembers } = await import("../drizzle/schema");
          db.update(workspaceMembers)
            .set({ status: "active" })
            .where(
              and(
                eq(workspaceMembers.workspaceId, input.workspaceId),
                eq(workspaceMembers.userId, ctx.user.id)
              )
            )
            .run();
        } else {
          await db.addWorkspaceMember(input.workspaceId, ctx.user.id);
        }
        recordAudit({
          userId: ctx.user.id,
          workspaceId: input.workspaceId,
          action: "update",
          entity: "workspace_invite",
          entityId: input.workspaceId,
        });
        return { ok: true };
      }),

    rejectInvite: protectedProcedure
      .input(z.object({ workspaceId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { db } = await import("./db/connection");
        const { eq, and } = await import("drizzle-orm");
        const { workspaceMembers } = await import("../drizzle/schema");
        db.delete(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, input.workspaceId),
              eq(workspaceMembers.userId, ctx.user.id)
            )
          )
          .run();
        return { ok: true };
      }),
    switch: protectedProcedure
      .input(z.object({ workspaceId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await requireWorkspaceMember(input.workspaceId, ctx.user.id, {
          message: "You are not a member of this workspace",
        });
        const user = await db.getUserById(ctx.user.id);
        return {
          token: signToken(ctx.user.id, user?.tokenVersion ?? 0),
        };
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireWorkspaceMember(input.id, ctx.user.id);
        const { db } = await import("./db/connection");
        const { eq } = await import("drizzle-orm");
        const { workspaces } = await import("../drizzle/schema");
        const w = db
          .select()
          .from(workspaces)
          .where(eq(workspaces.id, input.id))
          .get();
        if (!w)
          throw new TRPCError({ code: "NOT_FOUND", message: "工作区不存在" });
        return w;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).optional(),
          settings: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (ctx.workspaceRole !== "owner" && ctx.workspaceRole !== "admin")
          throw new Error("仅管理员可修改工作区");
        const { db } = await import("./db/connection");
        const { eq } = await import("drizzle-orm");
        const { workspaces } = await import("../drizzle/schema");
        const data: Record<string, unknown> = {
          updatedAt: new Date().toISOString(),
        };
        if (input.name) data.name = input.name;
        if (input.settings !== undefined) data.settings = input.settings;
        db.update(workspaces)
          .set(data)
          .where(eq(workspaces.id, input.id))
          .run();
        return { ok: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.workspaceRole !== "owner")
          throw new Error("仅 Owner 可删除工作区");
        // 级联软删: 标记所有 project 为 deleted
        const { db } = await import("./db/connection");
        const { eq } = await import("drizzle-orm");
        const { projects, workspaces } = await import("../drizzle/schema");
        db.update(projects)
          .set({ status: "deleted", archivedAt: new Date().toISOString() })
          .where(eq(projects.workspaceId, input.id))
          .run();
        db.update(workspaces)
          .set({ status: "suspended", updatedAt: new Date().toISOString() })
          .where(eq(workspaces.id, input.id))
          .run();
        recordAudit({
          userId: ctx.user.id,
          workspaceId: input.id,
          action: "delete",
          entity: "workspace",
          entityId: input.id,
        });
        return { ok: true };
      }),

    leave: protectedProcedure
      .input(z.object({ workspaceId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { db } = await import("./db/connection");
        const { eq, and } = await import("drizzle-orm");
        const { workspaceMembers } = await import("../drizzle/schema");
        // H-R6: prevent owner from leaving their own workspace
        const member = db
          .select()
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, input.workspaceId),
              eq(workspaceMembers.userId, ctx.user.id)
            )
          )
          .get();
        if (member && (member as any).role === "owner") {
          throw new (await import("@trpc/server")).TRPCError({
            code: "FORBIDDEN",
            message: "Owner cannot leave workspace. Transfer ownership first.",
          });
        }
        db.delete(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, input.workspaceId),
              eq(workspaceMembers.userId, ctx.user.id)
            )
          )
          .run();
        return { ok: true };
      }),
  }),

  // ===== Project routes =====
  projects: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      // 越权修复: 伪造 x-workspace-id 的非成员（workspaceRole=null）不得看到
      // 目标 workspace 的任何项目 —— getProjectsByUserId 在 role=null 时会落入
      // member/viewer 过滤分支并放行 visibility='org' 的项目元数据。
      if (ctx.workspaceId && !ctx.workspaceRole) return [];
      return db.getProjectsByUserId(
        ctx.user.id,
        ctx.workspaceId,
        ctx.workspaceRole
      );
    }),

    getById: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        return db.getProjectById(input.projectId);
      }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1),
          description: z.string().optional(),
          visibility: z.enum(["private", "org"]).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.workspaceId) throw new Error("未选择工作区");
        const project = await createProject(
          input,
          ctx.user.id,
          ctx.workspaceId
        );
        // 自动添加创建者为 project member (owner)
        const pid = project.id ?? 0;
        if (pid) {
          await db.addProjectMember({
            projectId: pid,
            userId: ctx.user.id,
            role: "owner",
          });
        }
        return project;
      }),

    update: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          name: z.string().min(1).optional(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        const p = await db.getProjectById(input.projectId);
        if (!p) throw new Error("项目不存在");
        // 仅 owner 或 admin 可修改
        const isOwner = (p as { ownerId: number }).ownerId === ctx.user.id;
        const isAdmin =
          ctx.workspaceRole === "admin" || ctx.workspaceRole === "owner";
        if (!isOwner && !isAdmin)
          throw new Error("仅项目 Owner 或管理员可修改");
        await db.updateProject(input.projectId, {
          name: input.name || p.name,
          description: input.description ?? p.description,
        });
        recordAudit({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId ?? 0,
          projectId: input.projectId,
          action: "update",
          entity: "project",
          entityId: input.projectId,
          before: { name: p.name },
          after: { name: input.name || p.name },
        });
        return { ok: true };
      }),

    delete: protectedProcedure
      .input(z.object({ projectId: z.number(), confirmName: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        const p = await db.getProjectById(input.projectId);
        if (!p) throw new Error("项目不存在");
        // owner of project OR admin/owner of workspace 可删
        const isOwner = (p as { ownerId: number }).ownerId === ctx.user.id;
        const isAdmin =
          ctx.workspaceRole === "admin" || ctx.workspaceRole === "owner";
        if (!isOwner && !isAdmin)
          throw new Error("仅项目 Owner 或工作区管理员可删除");
        // 二次确认：必须输入项目名称
        if (input.confirmName.trim() !== p.name)
          throw new Error("项目名称不匹配，删除取消");
        // 软删除 → 设 status='deleted' + archivedAt
        await db.archiveProject(input.projectId);
        recordAudit({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId ?? 0,
          projectId: input.projectId,
          action: "delete",
          entity: "project",
          entityId: input.projectId,
        });
        return { ok: true };
      }),

    transferOwnership: protectedProcedure
      .input(z.object({ projectId: z.number(), newOwnerId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        const p = await db.getProjectById(input.projectId);
        if (!p) throw new Error("项目不存在");
        if ((p as { ownerId: number }).ownerId !== ctx.user.id)
          throw new Error("仅项目 Owner 可转让所有权");
        await db.transferProjectOwnership(input.projectId, input.newOwnerId);
        recordAudit({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId ?? 0,
          projectId: input.projectId,
          action: "update",
          entity: "project",
          entityId: input.projectId,
          after: { ownerId: input.newOwnerId },
        });
        return { ok: true };
      }),

    getMembers: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user!.id, input.projectId);
        return db.getProjectMembers(input.projectId);
      }),

    addMember: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          userId: z.number(),
          role: z.enum(["owner", "manager", "member"]),
          phone: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const access = await requireProjectAccess(ctx.user.id, input.projectId);
        // 提权防护: 仅 manager/owner（含 workspace admin）可添加成员；
        // 且禁止授予不低于自身角色的角色（owner 转让请走 transferOwnership）
        const ROLE_RANK: Record<string, number> = {
          viewer: 0,
          member: 1,
          manager: 2,
          admin: 3,
          owner: 3,
        };
        const myRank = ROLE_RANK[access.projectRole] ?? 0;
        if (myRank < ROLE_RANK.manager) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "仅项目 Manager 或 Owner 可添加成员",
          });
        }
        if ((ROLE_RANK[input.role] ?? 0) >= myRank) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "不能授予不低于自身角色的项目角色",
          });
        }
        return db.addProjectMember(input);
      }),

    updateMember: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          role: z.string().optional(),
          phone: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const member = await db.getProjectMemberById(input.id);
        if (member) await requireProjectAccess(ctx.user.id, member.projectId);
        const { id, ...data } = input;
        return db.updateProjectMember(id, data);
      }),

    deleteMember: protectedProcedure
      .input(z.object({ id: z.number(), projectId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user!.id, input.projectId);
        return db.deleteProjectMember(input.id);
      }),
  }),

  // ===== Kanban routes =====
  kanban: kanbanRouter,

  // ===== Task routes =====
  tasks: router({
    getByColumn: protectedProcedure
      .input(z.object({ columnId: z.number() }))
      .query(async ({ input, ctx }) => {
        // V35-16: columnId→projectId 需穿过 board 表, 当前 db 层已做 project JOIN 过滤
        // 低风险: columnId 为内部路由用 ID, 不直接暴露给用户
        return db.getTasksByColumnId(input.columnId);
      }),

    getById: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireEntityAccess("task", input.taskId, ctx.user.id);
        return db.getTaskById(input.taskId);
      }),

    create: permissionProcedure("task.create")
      .input(
        z.object({
          projectId: z.number(),
          columnId: z.number(),
          title: z.string().min(1),
          description: z.string().optional(),
          assigneeId: z.number().optional(),
          priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
          dueDate: z.coerce.date().optional(),
          order: z.number(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        // 计算项目内任务编号 (per-project sequential)
        const { db, eq, sql } = await import("./db/connection");
        const { tasks } = await import("../drizzle/schema");
        const existing =
          (
            db
              .select({ count: sql<number>`count(*)` })
              .from(tasks)
              .where(eq(tasks.projectId, input.projectId))
              .get() as any
          )?.count ?? 0;
        const created = createTask(
          { ...input, taskNumber: existing + 1 },
          ctx.user.id,
          ctx.user.name
        );
        invalidateCache("stats:");
        return created;
      }),

    updateColumn: protectedProcedure
      .input(
        z.object({
          taskId: z.number(),
          columnId: z.number(),
          order: z.number(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // H-R3: requireEntityAccess to verify user can access this task
        await requireEntityAccess("task", input.taskId, ctx.user!.id);
        const moved = db.updateTaskColumn(
          input.taskId,
          input.columnId,
          input.order
        );
        invalidateCache("stats:");
        return moved;
      }),

    getByProject: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          offset: z.number().optional(),
          limit: z.number().optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        return db.getTasksByProjectId(input.projectId, {
          offset: input.offset,
          limit: input.limit,
        });
      }),

    update: protectedProcedure
      .input(
        z.object({
          taskId: z.number(),
          title: z.string().optional(),
          description: z.string().optional(),
          priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
          dueDate: z.string().optional(),
          columnId: z.number().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess("task", input.taskId, ctx.user!.id);
        const { taskId, ...data } = input;
        const updated = updateTask(taskId, data);
        invalidateCache("stats:");
        return updated;
      }),

    delete: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // H-R4: requireEntityAccess to verify user can delete this task
        await requireEntityAccess("task", input.taskId, ctx.user!.id);
        const removed = deleteTask(input.taskId);
        invalidateCache("stats:");
        return removed;
      }),
  }),

  // ===== Subtask routes =====
  subtasks: subtasksRouter,

  // ===== Task Comment routes =====
  comments: commentsRouter,

  // ===== File Snapshot routes =====
  files: router({
    getByTask: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireEntityAccess("task", input.taskId, ctx.user.id);
        return db.getFileSnapshotsByTaskId(input.taskId);
      }),

    getByProject: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        return db.getFileSnapshotsByProjectId(input.projectId);
      }),

    create: protectedProcedure
      .input(
        z.object({
          taskId: z.number().optional(),
          projectId: z.number().optional(),
          fileName: z.string().min(1),
          fileKey: z.string().min(1),
          fileUrl: z.string().min(1),
          fileSize: z.number().optional(),
          mimeType: z.string().optional(),
          recordDate: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // V35-08: 加项目作用域守卫, 去掉 ||1 默认值
        if (!input.projectId && !input.taskId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "projectId or taskId required",
          });
        }
        let pid = input.projectId;
        if (input.taskId) {
          const task = db.getTaskById(input.taskId);
          if (task) pid = (task as any).projectId || pid;
        }
        if (!pid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot determine project",
          });
        }
        // requireProjectAccess(userId, projectId) — 修正原 (pid, userId) 参数颠倒导致的错误授权判定
        await requireProjectAccess(ctx.user!.id, pid);
        const result = await db.createFileSnapshot({
          ...input,
          uploadedBy: ctx.user!.id,
        });
        notify(
          pid,
          ctx.user.id,
          "file_uploaded",
          "新文件",
          input.fileName,
          `/projects/${pid}/files`
        );
        return result;
      }),

    updateNotes: protectedProcedure
      .input(z.object({ id: z.number(), notes: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess("file", input.id, ctx.user!.id);
        return db.updateFileSnapshotNotes(input.id, input.notes);
      }),

    updateRecordDate: protectedProcedure
      .input(z.object({ id: z.number(), recordDate: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess("file", input.id, ctx.user!.id);
        return db.updateFileSnapshotRecordDate(input.id, input.recordDate);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess("file", input.id, ctx.user!.id);
        return db.deleteFileSnapshot(input.id);
      }),

    getStats: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        return db.getFileStats(input.projectId);
      }),
  }),

  // ===== Vendor routes =====
  vendors: router({
    getByProject: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        const vs = await db.getVendorsByProjectId(input.projectId);
        return vs.slice(0, 50); // default limit
      }),

    getById: protectedProcedure
      .input(z.object({ vendorId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireEntityAccess("vendor", input.vendorId, ctx.user.id);
        return db.getVendorById(input.vendorId);
      }),

    create: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          name: z.string().min(1),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        return db.createVendor(input);
      }),

    update: protectedProcedure
      .input(
        z.object({
          vendorId: z.number(),
          name: z.string().min(1),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess("vendor", input.vendorId, ctx.user.id);
        return db.updateVendor(input.vendorId, {
          name: input.name,
          description: input.description ?? null,
        });
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess("vendor", input.id, ctx.user.id);
        return db.deleteVendor(input.id);
      }),
  }),

  // ===== Vendor Contact routes =====
  vendorContacts: router({
    getByVendor: protectedProcedure
      .input(z.object({ vendorId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireEntityAccess("vendor", input.vendorId, ctx.user.id);
        return db.getContactsByVendorId(input.vendorId);
      }),

    getByProject: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        const rows = await db.getVendorContactsByProjectId(input.projectId);
        return rows.map(r => ({
          ...r.contact,
          entityType: "vendor" as const,
          entityId: r.contact.vendorId,
          entityName: r.vendorName,
        }));
      }),

    create: protectedProcedure
      .input(
        z.object({
          vendorId: z.number(),
          name: z.string().min(1),
          phone: z.string().optional(),
          landline: z.string().optional(),
          email: z.string().email().optional(),
          role: z.enum(["purchaser", "sales", "manager", "other"]),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess("vendor", input.vendorId, ctx.user.id);
        return db.createVendorContact(input);
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1),
          phone: z.string().optional().nullable(),
          landline: z.string().optional().nullable(),
          email: z.string().email().optional().nullable(),
          role: z.enum(["purchaser", "sales", "manager", "other"]),
          notes: z.string().optional().nullable(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // IDOR 修复: input 无 vendorId, 先按 id 反查 contact → vendor, 再校验 vendor 所属项目访问权
        const { db: _db, eq: _eq } = await import("./db/connection");
        const { vendorContacts } = await import("../drizzle/schema");
        const contact = _db
          .select()
          .from(vendorContacts)
          .where(_eq(vendorContacts.id, input.id))
          .get() as { vendorId: number } | undefined;
        if (!contact)
          throw new TRPCError({ code: "NOT_FOUND", message: "联系人不存在" });
        await requireEntityAccess("vendor", contact.vendorId, ctx.user.id);
        return db.updateVendorContact(input.id, input);
      }),
  }),

  // ===== Customer routes =====
  customers: router({
    getByProject: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        const cs = await db.getCustomersByProjectId(input.projectId);
        return cs.slice(0, 50);
      }),

    getById: protectedProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireEntityAccess("customer", input.customerId, ctx.user.id);
        return db.getCustomerById(input.customerId);
      }),

    create: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          name: z.string().min(1),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        return db.createCustomer(input);
      }),

    update: protectedProcedure
      .input(
        z.object({
          customerId: z.number(),
          name: z.string().min(1),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess("customer", input.customerId, ctx.user.id);
        return db.updateCustomer(input.customerId, {
          name: input.name,
          description: input.description ?? null,
        });
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess("customer", input.id, ctx.user.id);
        return db.deleteCustomer(input.id);
      }),
  }),

  // ===== Customer Contact routes =====
  customerContacts: router({
    getByCustomer: protectedProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireEntityAccess("customer", input.customerId, ctx.user.id);
        return db.getContactsByCustomerId(input.customerId);
      }),

    getByProject: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        const rows = await db.getCustomerContactsByProjectId(input.projectId);
        return rows.map(r => ({
          ...r.contact,
          entityType: "customer" as const,
          entityId: r.contact.customerId,
          entityName: r.customerName,
        }));
      }),

    create: protectedProcedure
      .input(
        z.object({
          customerId: z.number(),
          name: z.string().min(1),
          phone: z.string().optional(),
          landline: z.string().optional(),
          email: z.string().email().optional(),
          role: z.enum(["purchaser", "sales", "manager", "other"]),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess("customer", input.customerId, ctx.user.id);
        return db.createCustomerContact(input);
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1),
          phone: z.string().optional().nullable(),
          landline: z.string().optional().nullable(),
          email: z.string().email().optional().nullable(),
          role: z.enum(["purchaser", "sales", "manager", "other"]),
          notes: z.string().optional().nullable(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // IDOR 修复: input 无 customerId, 先按 id 反查 contact → customer, 再校验 customer 所属项目访问权
        const { db: _db, eq: _eq } = await import("./db/connection");
        const { customerContacts } = await import("../drizzle/schema");
        const contact = _db
          .select()
          .from(customerContacts)
          .where(_eq(customerContacts.id, input.id))
          .get() as { customerId: number } | undefined;
        if (!contact)
          throw new TRPCError({ code: "NOT_FOUND", message: "联系人不存在" });
        await requireEntityAccess("customer", contact.customerId, ctx.user.id);
        return db.updateCustomerContact(input.id, input);
      }),
  }),

  // ===== Cost Entry routes =====
  costs: router({
    getByProject: permissionProcedure("finance.view")
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        const entries = await db.getCostEntriesByProjectId(input.projectId);
        // 脱敏按工作区角色轴（workspaceRole），而非用户全局角色
        return entries.map((e: any) =>
          maskFinanceData(e, ctx.workspaceRole || "viewer")
        );
      }),

    create: permissionProcedure("finance.edit")
      .input(
        z.object({
          projectId: z.number(),
          name: z.string().min(1),
          amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
          category: z.string().min(1),
          notes: z.string().optional(),
          vendorId: z.number().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        return createCost(input, ctx.user.id, ctx.user.name);
      }),

    update: permissionProcedure("finance.edit")
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1),
          amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
          category: z.string().min(1),
          notes: z.string().optional().nullable(),
          date: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess("cost", input.id, ctx.user.id);
        const result = await db.updateCostEntry(input.id, input);
        recordAudit({
          userId: ctx.user.id,
          action: "update",
          entity: "costs",
          entityId: input.id,
        });
        return result;
      }),
    delete: permissionProcedure("finance.edit")
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess("cost", input.id, ctx.user.id);
        return deleteCost(input.id, ctx.user.id);
      }),
  }),

  // ===== Revenue routes =====
  revenues: router({
    getByProject: permissionProcedure("finance.view")
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        const entries = await db.getRevenueEntriesByProjectId(input.projectId);
        // 脱敏按工作区角色轴（workspaceRole），而非用户全局角色
        return entries.map((e: any) =>
          maskFinanceData(e, ctx.workspaceRole || "viewer")
        );
      }),

    create: permissionProcedure("finance.edit")
      .input(
        z.object({
          projectId: z.number(),
          name: z.string().min(1),
          amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
          category: z.string().min(1),
          notes: z.string().optional(),
          customerId: z.number().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        return createRevenue(input, ctx.user.id);
      }),

    delete: permissionProcedure("finance.edit")
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess("revenue", input.id, ctx.user.id);
        return deleteRevenue(input.id, ctx.user.id);
      }),

    update: permissionProcedure("finance.edit")
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1),
          amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
          category: z.string().min(1),
          notes: z.string().optional().nullable(),
          date: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess("revenue", input.id, ctx.user.id);
        return updateRevenue(input.id, input, ctx.user.id);
      }),
  }),

  // ===== Expense routes =====
  expenses: router({
    getByProject: permissionProcedure("finance.view")
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        return db.getExpenseEntriesByProjectId(input.projectId);
      }),

    create: permissionProcedure("finance.edit")
      .input(
        z.object({
          projectId: z.number(),
          name: z.string().min(1),
          amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
          category: z.string().min(1),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        return db.createExpenseEntry({ ...input, createdBy: ctx.user.id });
      }),

    delete: permissionProcedure("finance.edit")
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess("expense", input.id, ctx.user.id);
        return db.deleteExpenseEntry(input.id);
      }),

    update: permissionProcedure("finance.edit")
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1),
          amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
          category: z.string().min(1),
          notes: z.string().optional().nullable(),
          date: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess("expense", input.id, ctx.user.id);
        return db.updateExpenseEntry(input.id, input);
      }),
  }),

  // ===== Finance summary (moved to ./routers/finance.ts) =====
  finance: financeRouter,

  // ===== Milestone routes =====
  milestones: router({
    getByProject: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        return db.getMilestonesByProjectId(input.projectId);
      }),

    create: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          title: z.string().min(1),
          description: z.string().optional(),
          dueDate: z.coerce.date(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        const result = await db.createMilestone(input);
        notify(
          input.projectId,
          ctx.user.id,
          "milestone_created",
          "新里程碑",
          input.title,
          `/projects/${input.projectId}/calendar`
        );
        return result;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          title: z.string().optional(),
          description: z.string().optional(),
          dueDate: z.coerce.date().optional(),
          completed: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess("milestone", input.id, ctx.user.id);
        return db.updateMilestone(input.id, input);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess("milestone", input.id, ctx.user.id);
        return db.deleteMilestone(input.id);
      }),
  }),

  // ===== Dashboard routes (→ ./routers/dashboard.ts) =====
  dashboard: dashboardRouter,

  accounting: accountingRouter,
  financialReports: financialReportsRouter,

  // ===== Analytics routes =====
  analytics: router({
    getProjectStats: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        return getProjectStats(input.projectId);
      }),

    getCostSummary: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireProjectAccess(ctx.user.id, input.projectId);
        return getCostSummary(input.projectId);
      }),
  }),

  // ===== Webhook / Integration routes =====
  webhooks: webhooksRouter,

  // ===== Notification routes =====
  notifications: notificationsRouter,

  // ===== Audit 审计路由 =====
  audit: router({
    list: protectedProcedure
      .use(async ({ ctx, next }) => {
        const { requireSystemAccess } = await import("./lib/system-access");
        await requireSystemAccess(ctx.user!.id, "SYSTEM_AUDITOR");
        return next();
      })
      .input(
        z.object({
          limit: z.number().optional().default(50),
          offset: z.number().optional().default(0),
        })
      )
      .query(async ({ ctx, input }) => {
        const db2 = await import("./db/connection").then(m => m.db);
        const { auditLogs } = await import("../drizzle/schema");
        const { eq, desc } = await import("drizzle-orm");
        return db2
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.workspaceId, ctx.workspaceId!))
          .orderBy(desc(auditLogs.createdAt))
          .limit(input.limit)
          .offset(input.offset)
          .all();
      }),

    getByEntity: protectedProcedure
      .use(async ({ ctx, next }) => {
        const { requireSystemAccess } = await import("./lib/system-access");
        await requireSystemAccess(ctx.user!.id, "SYSTEM_AUDITOR");
        return next();
      })
      .input(z.object({ entity: z.string(), entityId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db2 = await import("./db/connection").then(m => m.db);
        const { auditLogs } = await import("../drizzle/schema");
        const { eq, and, desc } = await import("drizzle-orm");
        return db2
          .select()
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.workspaceId, ctx.workspaceId!),
              eq(auditLogs.entity, input.entity),
              eq(auditLogs.entityId, input.entityId)
            )
          )
          .orderBy(desc(auditLogs.createdAt))
          .all();
      }),
  }),
});

export type AppRouter = typeof appRouter;
