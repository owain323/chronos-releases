import { systemRouter } from "./_core/systemRouter";
import { authRouter } from "./routers/auth";
import { invalidateCache } from "./lib/cache";
import { financeRouter } from "./routers/finance";
import { dashboardRouter } from "./routers/dashboard";
import { accountingRouter } from "./routers/accounting";
import { webhooksRouter } from "./routers/webhooks";
import { notificationsRouter } from "./routers/notifications";
import { projectsRouter } from "./routers/projects";
import {
  costRouter,
  revenueRouter,
  expenseRouter,
} from "./routers/finance-entries";
import { subtasksRouter } from "./routers/subtasks";
import { commentsRouter } from "./routers/comments";
import { kanbanRouter } from "./routers/kanban";
import { workspacesRouter } from "./routers/workspaces";
import {
  requireWorkspaceMember,
  getWorkspaceMembership,
} from "./lib/workspace-guard";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, permissionProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";

import { notify } from "./lib/notifications";
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

  workspaces: workspacesRouter,

  projects: projectsRouter,

  // ===== Kanban routes =====
  kanban: kanbanRouter,

  // ===== Task routes =====
  tasks: router({
    getByColumn: protectedProcedure
      .input(z.object({ columnId: z.number() }))
      .query(async ({ input, ctx }) => {
        // v4.3 WO-SEC-2: columnId→projectId→requireProjectAccess (原仅验登录, BOLA)
        const { kanbanColumns } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const col = db.db
          ?.select({ projectId: kanbanColumns.projectId })
          .from(kanbanColumns)
          .where(eq(kanbanColumns.id, input.columnId))
          .get();
        if (!col) return [];
        await requireProjectAccess(ctx.user.id, col.projectId);
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

  costs: costRouter,
  revenues: revenueRouter,
  expenses: expenseRouter,

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
