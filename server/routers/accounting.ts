// accounting routes — C1 God File split
import { z } from "zod";
import { permissionProcedure, router } from "../_core/trpc";
import { requireProjectAccess } from "../lib/project-guard";
import * as db from "../db";

// v4.2: 幂等键去重 (5分钟TTL, 防重放)
const _idemCache = new Map<string, { result: any; ts: number }>();
const IDEM_TTL = 300_000;

export const accountingRouter = router({
  getAccounts: permissionProcedure("finance.view")
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      return db.getAccountsByProjectId(input.projectId);
    }),

  createAccount: permissionProcedure("finance.edit")
    .input(
      z.object({
        projectId: z.number(),
        code: z.string(),
        name: z.string(),
        type: z.enum(["asset", "liability", "equity", "income", "expense"]),
        parentId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      return db.createAccount(input);
    }),

  seedAccounts: permissionProcedure("finance.edit")
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      await db.seedDefaultAccounts(input.projectId);
      return { success: true };
    }),

  getEntries: permissionProcedure("finance.view")
    .input(
      z.object({
        projectId: z.number(),
        offset: z.number().optional(),
        limit: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      return db.getJournalEntriesByProjectId(input.projectId, {
        offset: input.offset,
        limit: input.limit,
      });
    }),

  createEntry: permissionProcedure("finance.edit")
    .input(
      z.object({
        projectId: z.number(),
        date: z.string(),
        description: z.string(),
        debitAccountId: z.number(),
        debitAmount: z.number(),
        creditAccountId: z.number(),
        creditAmount: z.number(),
        idempotencyKey: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // v4.2: 幂等键去重
      if (input.idempotencyKey) {
        const cached = _idemCache.get(input.idempotencyKey);
        if (cached && Date.now() - cached.ts < IDEM_TTL) return cached.result;
        _idemCache.set(input.idempotencyKey, {
          result: { pending: true, id: 0 },
          ts: Date.now(),
        });
      }
      await requireProjectAccess(ctx.user.id, input.projectId);
      const result = await db.createJournalEntry(input);
      if (input.idempotencyKey)
        _idemCache.set(input.idempotencyKey, { result, ts: Date.now() });
      return result;
    }),
});
