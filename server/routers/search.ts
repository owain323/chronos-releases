/**
 * 搜索路由 — %keyword% 全模糊搜索
 * v3.1: workspace 隔离已修复（HIGH-002/003）
 * v4.0 TODO(MEDIUM-004): PG tsvector + GIN 索引，SQLite FTS5
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { db } from "../db";
import { eq, like, and, gte, lte, or, inArray } from "drizzle-orm";
import {
  tasks,
  projects,
  fileSnapshots,
  vendors,
  customers,
  customerContacts,
  vendorContacts,
  costEntries,
  revenueEntries,
  expenseEntries,
} from "../../drizzle/schema";

/** tRPC v11 httpLink wraps input as {json: {...}} — 统一解包 */
function unwrapInput<T>(input: T): T {
  return ((input as any)?.json ?? input) as T;
}

export interface SearchResults {
  tasks: (typeof tasks.$inferSelect)[];
  projects: (typeof projects.$inferSelect)[];
  files: (typeof fileSnapshots.$inferSelect)[];
  vendors: (typeof vendors.$inferSelect)[];
  customers: (typeof customers.$inferSelect)[];
  contacts: {
    id: number;
    name: string | null;
    phone: string | null;
    email: string | null;
    notes: string | null;
    entityId: number;
    entityType: string;
    entityName: string | null;
  }[];
  costs: (typeof costEntries.$inferSelect)[];
  revenues: (typeof revenueEntries.$inferSelect)[];
  expenses: (typeof expenseEntries.$inferSelect)[];
}

export const searchRouter = router({
  /**
   * 全局搜索 - 支持关键字和日期范围
   */
  global: protectedProcedure
    .input(
      z.object({
        keyword: z.string().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        projectId: z.number().optional(),
        limit: z.number().default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      // tRPC v11 httpLink wraps input: {json: {...}}
      const realInput = unwrapInput(input);
      const wsId = ctx.workspaceId;
      if (!wsId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "workspaceId required for search",
        });
      const results: SearchResults = {
        tasks: [],
        projects: [],
        files: [],
        vendors: [],
        customers: [],
        contacts: [],
        costs: [],
        revenues: [],
        expenses: [],
      };

      const contactKeyword = realInput.keyword
        ? `%${realInput.keyword}%`
        : null;

      try {
        // 搜索任务
        if (realInput.keyword || realInput.startDate || realInput.endDate) {
          const taskWhere: any[] = [];
          if (realInput.keyword) {
            taskWhere.push(like(tasks.title, `%${realInput.keyword}%`));
          }
          if (realInput.projectId) {
            taskWhere.push(eq(tasks.projectId, realInput.projectId));
          }
          if (realInput.startDate) {
            taskWhere.push(
              gte(tasks.dueDate, realInput.startDate.toISOString())
            );
          }
          if (realInput.endDate) {
            taskWhere.push(lte(tasks.dueDate, realInput.endDate.toISOString()));
          }

          // wsId 已在上方强制校验非空 — 恒定按 workspace 隔离
          const taskProjectIds = db
            .select({ id: projects.id })
            .from(projects)
            .where(eq(projects.workspaceId, wsId));
          taskWhere.push(inArray(tasks.projectId, taskProjectIds));
          let query = db.select().from(tasks) as any;
          if (taskWhere.length > 0) {
            query = query.where(and(...taskWhere));
          }
          results.tasks = query.limit(realInput.limit).all();
        }

        // 搜索项目
        if (realInput.keyword) {
          // NOTE: LIKE '%keyword%' in SQLite cannot use B-Tree index.
          // Workspace isolation above limits data scanned per query.
          results.projects = db
            .select()
            .from(projects)
            .where(
              and(
                like(projects.name, `%${realInput.keyword}%`),
                eq(projects.workspaceId, wsId)
              )
            )
            .limit(realInput.limit)
            .all();
        }

        // 搜索供应商 — workspace隔离 (通过projects join)
        if (realInput.keyword) {
          const projectIds = db
            .select({ id: projects.id })
            .from(projects)
            .where(eq(projects.workspaceId, wsId));
          const vendorKeyword = `%${realInput.keyword}%`;
          results.vendors = db
            .select()
            .from(vendors)
            .where(
              and(
                inArray(vendors.projectId, projectIds),
                or(
                  like(vendors.name, vendorKeyword),
                  like(vendors.description, vendorKeyword)
                )
              )
            )
            .limit(realInput.limit)
            .all() as any;
        }

        // 搜索客户 — workspace隔离
        if (realInput.keyword) {
          const projectIds = db
            .select({ id: projects.id })
            .from(projects)
            .where(eq(projects.workspaceId, wsId));
          const custKeyword = `%${realInput.keyword}%`;
          results.customers = db
            .select()
            .from(customers)
            .where(
              and(
                inArray(customers.projectId, projectIds),
                or(
                  like(customers.name, custKeyword),
                  like(customers.description, custKeyword)
                )
              )
            )
            .limit(realInput.limit)
            .all() as any;
        }

        // 搜索成本条目 — workspace隔离
        if (realInput.keyword) {
          const costKeyword = `%${realInput.keyword}%`;
          // 子查询: 当前 workspace 的 projectIds
          const projectIds = db
            .select({ id: projects.id })
            .from(projects)
            .where(eq(projects.workspaceId, wsId));
          results.costs = db
            .select()
            .from(costEntries)
            .where(
              and(
                inArray(costEntries.projectId, projectIds),
                or(
                  like(costEntries.name, costKeyword),
                  like(costEntries.category, costKeyword),
                  like(costEntries.notes, costKeyword)
                )
              )
            )
            .limit(realInput.limit)
            .all() as any;
        }

        // 搜索联系人（供应商 + 客户）
        if (contactKeyword) {
          const vendorContactsResult = db
            .select({
              id: vendorContacts.id,
              name: vendorContacts.name,
              phone: vendorContacts.phone,
              notes: vendorContacts.notes,
            })
            .from(vendorContacts)
            .innerJoin(vendors, eq(vendorContacts.vendorId, vendors.id))
            .innerJoin(projects, eq(vendors.projectId, projects.id))
            .where(
              and(
                eq(projects.workspaceId, wsId),
                or(
                  like(vendorContacts.name, `%${contactKeyword}%`),
                  like(vendorContacts.phone, `%${contactKeyword}%`),
                  like(vendorContacts.notes, `%${contactKeyword}%`)
                )
              )
            )
            .limit(realInput.limit)
            .all();

          const customerContactsResult = db
            .select({
              id: customerContacts.id,
              name: customerContacts.name,
              phone: customerContacts.phone,
              notes: customerContacts.notes,
            })
            .from(customerContacts)
            .innerJoin(customers, eq(customerContacts.customerId, customers.id))
            .innerJoin(projects, eq(customers.projectId, projects.id))
            .where(
              and(
                eq(projects.workspaceId, wsId),
                or(
                  like(customerContacts.name, `%${contactKeyword}%`),
                  like(customerContacts.phone, `%${contactKeyword}%`),
                  like(customerContacts.notes, `%${contactKeyword}%`)
                )
              )
            )
            .limit(realInput.limit)
            .all();

          results.contacts = (
            [...vendorContactsResult, ...customerContactsResult] as any[]
          ).slice(0, realInput.limit);
        }
      } catch (error) {
        console.error("Search error:", error);
      }

      return results;
    }),

  /**
   * 搜索任务
   */
  tasks: protectedProcedure
    .input(
      z.object({
        keyword: z.string().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        projectId: z.number().optional(),
        limit: z.number().default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      const realInput = unwrapInput(input);
      const workspaceId = ctx.workspaceId;
      if (!workspaceId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "workspaceId required for search",
        });
      const conditions: any[] = [];
      // Workspace isolation — filter by projects in current workspace
      conditions.push(
        inArray(
          tasks.projectId,
          db
            .select({ id: projects.id })
            .from(projects)
            .where(eq(projects.workspaceId, workspaceId))
        )
      );

      if (realInput.keyword) {
        conditions.push(like(tasks.title, `%${realInput.keyword}%`));
      }
      if (realInput.projectId) {
        conditions.push(eq(tasks.projectId, realInput.projectId));
      }
      if (realInput.startDate) {
        conditions.push(gte(tasks.dueDate, realInput.startDate.toISOString()));
      }
      if (realInput.endDate) {
        conditions.push(lte(tasks.dueDate, realInput.endDate.toISOString()));
      }

      let query = db.select().from(tasks) as any;
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }
      return query.limit(realInput.limit).all();
    }),

  /**
   * 搜索项目
   */
  projects: protectedProcedure
    .input(
      z.object({
        keyword: z.string(),
        limit: z.number().default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const realInput = unwrapInput(input);
      const workspaceId = ctx.workspaceId;
      if (!workspaceId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "workspaceId required for search",
        });
      return db
        .select()
        .from(projects)
        .where(
          and(
            like(projects.name, `%${realInput.keyword}%`),
            eq(projects.workspaceId, workspaceId)
          )
        )
        .limit(realInput.limit)
        .all();
    }),

  /**
   * 搜索供应商
   */
  vendors: protectedProcedure
    .input(
      z.object({
        keyword: z.string(),
        limit: z.number().default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const realInput = unwrapInput(input);
      const workspaceId = ctx.workspaceId;
      if (!workspaceId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "workspaceId required for search",
        });
      return db
        .select()
        .from(vendors)
        .where(
          and(
            like(vendors.name, `%${realInput.keyword}%`),
            // 按 vendor.projectId 匹配当前 workspace 项目集合（此前误用 vendors.id 匹配项目主键）
            inArray(
              vendors.projectId,
              db
                .select({ id: projects.id })
                .from(projects)
                .where(eq(projects.workspaceId, workspaceId))
            )
          )
        )
        .limit(realInput.limit)
        .all();
    }),
});
