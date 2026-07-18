// financial-reports.ts — 财智财务模块 v5 tRPC 路由
//
// 暴露给前端的全部财务报表/预算/结转/导入/导出接口。
// 设计：
//  - 读取类用 permissionProcedure("finance.view")，写入类用 permissionProcedure("finance.edit")
//  - 每个 procedure 先 requireProjectAccess 做租户隔离，再查库、调用 financials 引擎
//  - 凭证写入统一走 db.createJournalEntry（复用借贷平衡校验 + 跨租户防护 + 余额同步）
//  - 关键动作（导入、结转）写审计日志 recordAudit
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, permissionProcedure } from "../_core/trpc";
import { requireProjectAccess } from "../lib/project-guard";
import { recordAudit } from "../lib/audit";
import { invalidateCache } from "../lib/cache";
import * as db from "../db";
import { getDb } from "../db/connection";
import {
  getFinAccounts,
  getFinEntries,
  getBudgetsByProject,
  upsertBudget,
  deleteBudget,
  getClosingsByProject,
  isPeriodClosed,
  getClosing,
  createClosing,
  parseAccountsCsv,
  parseEntriesCsv,
} from "../db/financial-reports";
import {
  trialBalance,
  balanceSheet,
  incomeStatement,
  cashFlow,
  equityStatement,
  ratios,
  budgetVsActual,
  dashboard,
  generateClosingEntries,
  type FinAccount,
  type FinEntry,
} from "../services/financials";

const ACCOUNT_TYPE = z.enum([
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
]);

/** 读取项目全部科目 + 凭证并映射为引擎输入 */
function loadDataset(projectId: number): {
  accounts: FinAccount[];
  entries: FinEntry[];
} {
  return {
    accounts: getFinAccounts(projectId) as FinAccount[],
    entries: getFinEntries(projectId) as FinEntry[],
  };
}

// ───────────────────────── CSV 序列化（导出用） ─────────────────────────
function csvCell(v: string | number): string {
  let s = String(v);
  // F-002: CWE-1236 — 文本列防 Excel 公式注入 (=/+/@/- 开头的字符串前缀加 ')
  if (typeof v === "string" && /^[-=+@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function rowsToCsv(
  header: string[],
  rows: Array<Array<string | number>>
): string {
  return [
    header.map(csvCell).join(","),
    ...rows.map(r => r.map(csvCell).join(",")),
  ].join("\r\n");
}

export const financialReportsRouter = router({
  // ───────── 试算平衡表 ─────────
  trialBalance: permissionProcedure("finance.view")
    .input(z.object({ projectId: z.number(), asOf: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      const { accounts, entries } = loadDataset(input.projectId);
      return trialBalance(accounts, entries, input.asOf);
    }),

  // ───────── 资产负债表 ─────────
  balanceSheet: permissionProcedure("finance.view")
    .input(z.object({ projectId: z.number(), asOf: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      const { accounts, entries } = loadDataset(input.projectId);
      return balanceSheet(accounts, entries, input.asOf);
    }),

  // ───────── 利润表 ─────────
  incomeStatement: permissionProcedure("finance.view")
    .input(
      z.object({ projectId: z.number(), start: z.string(), end: z.string() })
    )
    .query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      const { accounts, entries } = loadDataset(input.projectId);
      return incomeStatement(accounts, entries, input.start, input.end);
    }),

  // ───────── 现金流量表 ─────────
  cashFlow: permissionProcedure("finance.view")
    .input(
      z.object({ projectId: z.number(), start: z.string(), end: z.string() })
    )
    .query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      const { accounts, entries } = loadDataset(input.projectId);
      return cashFlow(accounts, entries, input.start, input.end);
    }),

  // ───────── 所有者权益变动表 ─────────
  equityStatement: permissionProcedure("finance.view")
    .input(
      z.object({ projectId: z.number(), start: z.string(), end: z.string() })
    )
    .query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      const { accounts, entries } = loadDataset(input.projectId);
      return equityStatement(accounts, entries, input.start, input.end);
    }),

  // ───────── 财务比率 ─────────
  ratios: permissionProcedure("finance.view")
    .input(z.object({ projectId: z.number(), asOf: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      const { accounts, entries } = loadDataset(input.projectId);
      return ratios(accounts, entries, input.asOf);
    }),

  // ───────── 仪表盘汇总（图表用） ─────────
  dashboard: permissionProcedure("finance.view")
    .input(
      z.object({
        projectId: z.number(),
        start: z.string(),
        end: z.string(),
        asOf: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      const { accounts, entries } = loadDataset(input.projectId);
      return dashboard(accounts, entries, input.start, input.end, input.asOf);
    }),

  // ───────── 预算 vs 实际 ─────────
  budgetVsActual: permissionProcedure("finance.view")
    .input(z.object({ projectId: z.number(), asOf: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      const { accounts, entries } = loadDataset(input.projectId);
      const budgetRows = getBudgetsByProject(input.projectId) as Array<{
        accountId: number;
        period: string;
        amount: number;
      }>;
      // 预算按科目聚合（同一科目可能有多期间），实际数由引擎按余额给出
      const budgetsAgg = new Map<number, number>();
      for (const b of budgetRows) {
        budgetsAgg.set(
          b.accountId,
          (budgetsAgg.get(b.accountId) ?? 0) + b.amount
        );
      }
      const budgetsInput = Array.from(budgetsAgg.entries()).map(
        ([accountId, amount]) => ({
          accountId,
          period: "agg",
          amount,
        })
      );
      return budgetVsActual(accounts, entries, budgetsInput, input.asOf);
    }),

  // ───────── 预算 CRUD ─────────
  listBudgets: permissionProcedure("finance.view")
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      return getBudgetsByProject(input.projectId);
    }),

  upsertBudget: permissionProcedure("finance.edit")
    .input(
      z.object({
        projectId: z.number(),
        accountId: z.number(),
        period: z.string(),
        amount: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      const result = upsertBudget(input);
      recordAudit({
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId ?? 0,
        action: "update",
        entity: "finance.budget",
        entityId: input.accountId,
        projectId: input.projectId,
        after: { period: input.period, amount: input.amount },
      });
      return result;
    }),

  deleteBudget: permissionProcedure("finance.edit")
    .input(z.object({ id: z.number(), projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      // F-004b: 删预算前写审计
      recordAudit({
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId ?? 0,
        action: "delete",
        entity: "finance.budget",
        entityId: input.id,
        projectId: input.projectId,
      });
      return deleteBudget(input.id, input.projectId);
    }),

  // ───────── 期末结转记录列表 ─────────
  listClosings: permissionProcedure("finance.view")
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      return getClosingsByProject(input.projectId);
    }),

  // ───────── 期末结转执行 ─────────
  closePeriod: permissionProcedure("finance.edit")
    .input(
      z.object({ projectId: z.number(), period: z.string(), asOf: z.string() })
    )
    .mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      // F-001: 事务原子包裹 (better-sqlite3 同一连接保证回调内写操作原子)
      // UNIQUE(projectId,period) 兜底防并发双结
      // 注意: 回调内使用 db.createJournalEntry (命名空间) 而非 tx 客户端;
      // SQLite 下二者共享同一连接故原子性成立; PG 需改用 tx 保证可移植性
      return getDb().transaction(async () => {
        if (isPeriodClosed(input.projectId, input.period)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `期间 ${input.period} 已结转，不能重复结转`,
          });
        }
        const { accounts, entries } = loadDataset(input.projectId);
        let plan;
        try {
          plan = generateClosingEntries(accounts, entries, input.asOf);
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              err instanceof Error ? err.message : "结转失败：缺少留存收益科目",
          });
        }
        let entryCount = 0;
        for (const ce of plan.closingEntries) {
          await db.createJournalEntry({
            projectId: input.projectId,
            date: ce.date,
            description: ce.description,
            debitAccountId: ce.debitAccountId,
            debitAmount: ce.debitAmount,
            creditAccountId: ce.creditAccountId,
            creditAmount: ce.creditAmount,
          });
          entryCount++;
        }
        const closingId = createClosing({
          projectId: input.projectId,
          period: input.period,
          closedBy: ctx.user.id,
          netIncome: plan.netIncome,
          entryCount,
          summary: `结转 ${entryCount} 笔凭证，净利润 ${plan.netIncome}`,
        });
        recordAudit({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId ?? 0,
          action: "create",
          entity: "finance.closing",
          entityId: closingId,
          projectId: input.projectId,
          after: {
            period: input.period,
            netIncome: plan.netIncome,
            entryCount,
          },
        });
        invalidateCache(`stats:${input.projectId}`);
        return { closingId, netIncome: plan.netIncome, entryCount };
      });
    }),

  /** 复核关账 — 第二人审批 (四眼原则) */
  approveClosing: permissionProcedure("finance.edit")
    .input(z.object({ closingId: z.number(), projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      const closing: any = getClosing(input.closingId);
      if (!closing)
        throw new TRPCError({ code: "NOT_FOUND", message: "关账记录不存在" });
      if (closing.approvedBy)
        throw new TRPCError({ code: "BAD_REQUEST", message: "已复核" });
      if (closing.closedBy === ctx.user.id)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "关账人与复核人不能为同一人",
        });
      const { sqlite } = await import("../db/connection");
      sqlite
        .prepare(
          "UPDATE closings SET approvedBy = ?, approvedAt = ? WHERE id = ?"
        )
        .run(ctx.user.id, new Date().toISOString(), input.closingId);
      recordAudit({
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId ?? 0,
        action: "approve",
        entity: "finance.closing",
        entityId: input.closingId,
        projectId: input.projectId,
      });
      invalidateCache(`stats:${input.projectId}`);
      return { success: true };
    }),

  // ───────── CSV 导入：科目表 ─────────
  importAccounts: permissionProcedure("finance.edit")
    .input(z.object({ projectId: z.number(), csv: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      const { accounts: parsed, errors } = parseAccountsCsv(input.csv);
      if (parsed.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `未解析到任何科目：${errors.join("；")}`,
        });
      }
      let imported = 0;
      for (const a of parsed) {
        await db.createAccount({
          projectId: input.projectId,
          code: a.code,
          name: a.name,
          type: a.type,
          cashFlowCategory: a.cashFlowCategory ?? null,
        });
        imported++;
      }
      recordAudit({
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId ?? 0,
        action: "create",
        entity: "finance.account",
        entityId: input.projectId,
        projectId: input.projectId,
        after: { count: imported },
      });
      return { imported, errors };
    }),

  // ───────── CSV 导入：记账凭证 ─────────
  importEntries: permissionProcedure("finance.edit")
    .input(z.object({ projectId: z.number(), csv: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      const accounts = getFinAccounts(input.projectId) as FinAccount[];
      const codeToId = new Map<string, number>(
        accounts.map(a => [a.code, a.id])
      );
      const { entries: parsed, errors } = parseEntriesCsv(input.csv, codeToId);
      if (parsed.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `未解析到任何凭证：${errors.join("；")}`,
        });
      }
      let imported = 0;
      for (const e of parsed) {
        await db.createJournalEntry({
          projectId: input.projectId,
          date: e.date,
          description: e.description,
          debitAccountId: e.debitAccountId,
          debitAmount: e.debitAmount,
          creditAccountId: e.creditAccountId,
          creditAmount: e.creditAmount,
        });
        imported++;
      }
      recordAudit({
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId ?? 0,
        action: "create",
        entity: "finance.journalEntry",
        entityId: input.projectId,
        projectId: input.projectId,
        after: { count: imported },
      });
      return { imported, errors };
    }),

  // ───────── 报表导出为 CSV ─────────
  exportCsv: permissionProcedure("finance.view")
    .input(
      z.object({
        projectId: z.number(),
        type: z.enum([
          "trialBalance",
          "balanceSheet",
          "incomeStatement",
          "cashFlow",
          "equityStatement",
          "ratios",
        ]),
        asOf: z.string(),
        start: z.string().optional(),
        end: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      const { accounts, entries } = loadDataset(input.projectId);
      const start = input.start ?? input.asOf;
      const end = input.end ?? input.asOf;
      let filename = "";
      let csv = "";
      switch (input.type) {
        case "trialBalance": {
          const r = trialBalance(accounts, entries, input.asOf);
          filename = `试算平衡表_${input.asOf}.csv`;
          csv = rowsToCsv(
            ["科目编码", "科目名称", "类型", "借方", "贷方", "余额"],
            r.rows.map(row => [
              row.code,
              row.name,
              row.type,
              row.debit,
              row.credit,
              row.balance,
            ])
          );
          break;
        }
        case "balanceSheet": {
          const r = balanceSheet(accounts, entries, input.asOf);
          filename = `资产负债表_${input.asOf}.csv`;
          const all = [
            ...r.assetRows.map(x => ["资产", x.code, x.name, x.balance]),
            ...r.liabilityRows.map(x => ["负债", x.code, x.name, x.balance]),
            ...r.equityRows.map(x => ["权益", x.code, x.name, x.balance]),
          ];
          csv = rowsToCsv(["类别", "科目编码", "科目名称", "余额"], all);
          break;
        }
        case "incomeStatement": {
          const r = incomeStatement(accounts, entries, start, end);
          filename = `利润表_${start}_${end}.csv`;
          const all = [
            ...r.incomeRows.map(x => ["收入", x.code, x.name, x.amount]),
            ...r.expenseRows.map(x => ["费用", x.code, x.name, x.amount]),
          ];
          csv = rowsToCsv(["类别", "科目编码", "科目名称", "金额"], all);
          break;
        }
        case "cashFlow": {
          const r = cashFlow(accounts, entries, start, end);
          filename = `现金流量表_${start}_${end}.csv`;
          csv = rowsToCsv(
            ["类别", "对方科目", "金额", "方向"],
            r.rows.map(x => [x.category, x.accountName, x.amount, x.direction])
          );
          break;
        }
        case "equityStatement": {
          const r = equityStatement(accounts, entries, start, end);
          filename = `权益变动表_${start}_${end}.csv`;
          csv = rowsToCsv(
            ["科目编码", "科目名称", "期初", "本期变动", "期末"],
            r.rows.map(x => [x.code, x.name, x.beginning, x.change, x.ending])
          );
          break;
        }
        case "ratios": {
          const r = ratios(accounts, entries, input.asOf);
          filename = `财务比率_${input.asOf}.csv`;
          csv = rowsToCsv(
            ["指标", "数值"],
            [
              ["流动比率", r.currentRatio],
              ["速动比率", r.quickRatio],
              ["资产负债率", r.debtRatio],
              ["毛利率", r.grossMargin],
              ["净利率", r.netMargin],
              ["净资产收益率", r.roe],
              ["总资产收益率", r.roa],
              ["利息保障倍数", r.interestCoverage ?? "N/A"],
            ]
          );
          break;
        }
      }
      // F-004a: 导出后写审计
      recordAudit({
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId ?? 0,
        action: "export",
        entity: "finance.report",
        entityId: input.projectId,
        projectId: input.projectId,
        after: { type: input.type, filename },
      });
      return { filename, csv };
    }),
});
