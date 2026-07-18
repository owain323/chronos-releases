// server/routers/finance-entries.ts — Cost/Revenue/Expense routes (从 routers.ts 抽出 T9 v4.0)
import { protectedProcedure, permissionProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import {
  requireProjectAccess,
  requireEntityAccess,
} from "../lib/project-guard";
import { recordAudit } from "../lib/audit";
import { maskFinanceData } from "../services/PermissionService";
import { createCost, deleteCost } from "../services/CostService";
import {
  createRevenue,
  updateRevenue,
  deleteRevenue,
} from "../services/RevenueService";

export const costRouter = router({
  getByProject: permissionProcedure("finance.view")
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      const entries = await db.getCostEntriesByProjectId(input.projectId);
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
});

export const revenueRouter = router({
  getByProject: permissionProcedure("finance.view")
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      const entries = await db.getRevenueEntriesByProjectId(input.projectId);
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
});

export const expenseRouter = router({
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
});

export const financeEntriesRouter = router({
  costs: costRouter,
  revenues: revenueRouter,
  expenses: expenseRouter,
});
