/**
 * verify-financial-reports.ts — 财智财务模块 v5 引擎验证脚本
 *
 * 用途：在不依赖数据库的前提下，用一份「自洽」的演示数据（13 个科目 + 10 笔凭证）
 * 跑通 financials.ts 的全部报表，并断言会计恒等式不变式。
 *
 * 运行：npm run verify:finance (npx tsx scripts/verify-financial-reports.ts)
 *
 * 验证的不变式（10 条）：
 *  1) 试算平衡：totalDebit === totalCredit（借贷平衡）
 *  2) 净利润 = 收入合计 − 费用合计
 *  3) 资产负债表：assets === liabilities + totalEquity（资产=负债+权益）
 *  4) 权益合计 = 权益账面 + 本期净利润
 *  5) 资产负债表净利润 === 利润表净利润
 *  6) netIncome() 与利润表一致
 *  7) 现金流净额 = 现金净变动
 *  8) 权益变动：期末 = 期初 + 净利 + 投入 − 分红
 *  9) 财务比率在合理区间
 * 10) 净利率 = 净利润 / 收入
 *
 * P0 修复: 核心逻辑抽出为 runFinancialVerification() 供 vitest 直接 import
 * (tests/finance/financial-reports.test.ts), CLI 入口行为保持不变。
 *
 * 退出码：全部通过返回 0；任一断言失败返回 1。
 */
import { pathToFileURL } from "url";
import {
  trialBalance,
  balanceSheet,
  incomeStatement,
  cashFlow,
  equityStatement,
  ratios,
  netIncome,
  type FinAccount,
  type FinEntry,
} from "../server/services/financials.ts";

const ASOF = "2025-12-31";
const START = "2025-01-01";

// ── 演示科目表（含 cashFlowCategory 以验证现金流量分类） ──
export const demoAccounts: FinAccount[] = [
  {
    id: 1,
    code: "1001",
    name: "库存现金",
    type: "asset",
    cashFlowCategory: "operating",
  },
  {
    id: 2,
    code: "1002",
    name: "银行存款",
    type: "asset",
    cashFlowCategory: "operating",
  },
  { id: 3, code: "1122", name: "应收账款", type: "asset" },
  { id: 4, code: "1405", name: "库存商品", type: "asset" },
  { id: 5, code: "1601", name: "固定资产", type: "asset" },
  { id: 6, code: "2202", name: "应付账款", type: "liability" },
  { id: 7, code: "3001", name: "实收资本", type: "equity" },
  { id: 8, code: "3103", name: "利润分配", type: "equity" },
  { id: 9, code: "6001", name: "主营业务收入", type: "income" },
  { id: 10, code: "6051", name: "其他业务收入", type: "income" },
  { id: 11, code: "6401", name: "主营业务成本", type: "expense" },
  { id: 12, code: "6601", name: "销售费用", type: "expense" },
  { id: 13, code: "6602", name: "管理费用", type: "expense" },
];

// ── 演示凭证（每笔单借单贷，借贷相等） ──
export const demoEntries: FinEntry[] = [
  {
    id: 1,
    date: "2025-01-05",
    description: "股东注资（现金）",
    debitAccountId: 1,
    debitAmount: 200000,
    creditAccountId: 7,
    creditAmount: 200000,
  },
  {
    id: 2,
    date: "2025-01-06",
    description: "股东注资（银行）",
    debitAccountId: 2,
    debitAmount: 300000,
    creditAccountId: 7,
    creditAmount: 300000,
  },
  {
    id: 3,
    date: "2025-02-10",
    description: "购入固定资产",
    debitAccountId: 5,
    debitAmount: 200000,
    creditAccountId: 2,
    creditAmount: 200000,
  },
  {
    id: 4,
    date: "2025-03-01",
    description: "赊购存货",
    debitAccountId: 4,
    debitAmount: 60000,
    creditAccountId: 6,
    creditAmount: 60000,
  },
  {
    id: 5,
    date: "2025-04-15",
    description: "赊销主营业务收入",
    debitAccountId: 3,
    debitAmount: 350000,
    creditAccountId: 9,
    creditAmount: 350000,
  },
  {
    id: 6,
    date: "2025-05-20",
    description: "现销其他业务收入",
    debitAccountId: 2,
    debitAmount: 50000,
    creditAccountId: 10,
    creditAmount: 50000,
  },
  {
    id: 7,
    date: "2025-06-10",
    description: "收回应收账款",
    debitAccountId: 2,
    debitAmount: 100000,
    creditAccountId: 3,
    creditAmount: 100000,
  },
  {
    id: 8,
    date: "2025-07-10",
    description: "支付主营业务成本",
    debitAccountId: 11,
    debitAmount: 70000,
    creditAccountId: 2,
    creditAmount: 70000,
  },
  {
    id: 9,
    date: "2025-08-10",
    description: "支付销售费用",
    debitAccountId: 12,
    debitAmount: 30000,
    creditAccountId: 2,
    creditAmount: 30000,
  },
  {
    id: 10,
    date: "2025-09-10",
    description: "支付管理费用",
    debitAccountId: 13,
    debitAmount: 22000,
    creditAccountId: 2,
    creditAmount: 22000,
  },
];

function approx(a: number, b: number, eps = 0.01) {
  return Math.abs(a - b) < eps;
}

export interface FinanceCheck {
  name: string;
  pass: boolean;
}

/** 跑全部报表并返回 10 条恒等式断言结果（不打印、不退出，供 vitest/CLI 复用） */
export function runFinancialVerification() {
  const accounts = demoAccounts;
  const entries = demoEntries;

  const tb = trialBalance(accounts, entries, ASOF);
  const is = incomeStatement(accounts, entries, START, ASOF);
  const bs = balanceSheet(accounts, entries, ASOF);
  const cf = cashFlow(accounts, entries, START, ASOF);
  const eq = equityStatement(accounts, entries, START, ASOF);
  const r = ratios(accounts, entries, ASOF);

  const checks: FinanceCheck[] = [
    { name: "试算平衡：借方合计 === 贷方合计", pass: tb.balanced },
    {
      name: "净利润 = 收入合计 − 费用合计",
      pass: approx(is.netIncome, is.totalIncome - is.totalExpense),
    },
    { name: "资产负债表：资产 === 负债 + 权益(含净利润)", pass: bs.balanced },
    {
      name: "权益合计 = 权益账面 + 本期净利润",
      pass: approx(bs.totalEquity, bs.equity + bs.netIncome),
    },
    {
      name: "资产负债表净利润 === 利润表净利润",
      pass: approx(bs.netIncome, is.netIncome),
    },
    {
      name: "netIncome() 与利润表一致",
      pass: approx(netIncome(accounts, entries, ASOF), is.netIncome),
    },
    {
      name: "现金流量净额 = 现金净变动(328,000)",
      pass: approx(cf.net, 328000),
    },
    {
      name: "权益变动：期末 = 期初 + 净利 + 投入 − 分红",
      pass: approx(
        eq.ending,
        eq.beginning + eq.netIncome + eq.ownerInvestment - eq.dividends
      ),
    },
    {
      name: "比率在合理区间（流动>0, 负债率∈[0,1]）",
      pass: r.currentRatio > 0 && r.debtRatio >= 0 && r.debtRatio <= 1,
    },
    {
      name: "净利率 = 净利润 / 收入",
      pass: approx(r.netMargin, is.netIncome / is.totalIncome),
    },
  ];

  return { checks, tb, is, bs, cf, eq, ratios: r };
}

// ── CLI 入口（npm run verify:finance 行为保持不变） ──
const isMain =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const { checks, tb, is, bs, cf, eq, ratios: r } = runFinancialVerification();
  let failed = 0;
  const report = (c: FinanceCheck) => {
    if (c.pass) {
      console.log(`  ✅ ${c.name}`);
    } else {
      console.error(`  ❌ ${c.name}`);
      failed++;
    }
  };

  console.log("\n=== 财智财务引擎验证 ===\n");

  console.log(
    `[试算平衡] 借方合计=${tb.totalDebit} 贷方合计=${tb.totalCredit}`
  );
  report(checks[0]);

  console.log(
    `[利润表] 收入=${is.totalIncome} 费用=${is.totalExpense} 净利润=${is.netIncome}`
  );
  report(checks[1]);

  console.log(
    `[资产负债表] 资产=${bs.assets} 负债=${bs.liabilities} 权益=${bs.equity} 含净利权益=${bs.totalEquity}`
  );
  report(checks[2]);
  report(checks[3]);
  report(checks[4]);
  report(checks[5]);

  console.log(
    `[现金流量表] 经营=${cf.operating} 投资=${cf.investing} 筹资=${cf.financing} 净额=${cf.net}`
  );
  report(checks[6]);

  console.log(
    `[权益变动表] 期初=${eq.beginning} 净利=${eq.netIncome} 期末=${eq.ending}`
  );
  report(checks[7]);

  console.log(
    `[财务比率] 流动=${r.currentRatio.toFixed(2)} 速动=${r.quickRatio.toFixed(2)} 负债率=${(
      r.debtRatio * 100
    ).toFixed(
      1
    )}% 净利率=${(r.netMargin * 100).toFixed(1)}% ROE=${(r.roe * 100).toFixed(1)}%`
  );
  report(checks[8]);
  report(checks[9]);

  console.log(
    `\n=== 结果：${failed === 0 ? "全部通过 ✅" : `${failed} 项失败 ❌`} ===\n`
  );
  process.exit(failed === 0 ? 0 : 1);
}
