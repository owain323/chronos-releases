/**
 * financials.ts — 财智财务模块 v5 核心计算引擎
 *
 * v4.1 T4: 使用 money.ts 整数分工具防浮点累积误差
 *  - toCents() 转整数分做加减
 *  - toDisplay() 转回数值输出
 *    CHRONOS 用单借单贷 journalEntries，所有报表只关心「每个科目的借贷发生额汇总」，
 *    对每笔凭证拆成单借单贷后汇总结果与多行 lines 一致。
 *  - 余额方向：asset/expense 为借增类（余额=借-贷），liability/equity/income 为贷增类（余额=贷-借）。
 */

export type AccountType =
  "asset" | "liability" | "equity" | "income" | "expense";
export type CashFlowCategory = "operating" | "investing" | "financing";

import { toCents, toDisplay } from "../lib/money";

export interface FinAccount {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  /** 现金流量分类，空值由 classifyForCashFlow 按类型启发式推断（向后兼容） */
  cashFlowCategory?: CashFlowCategory | null;
  parentId?: number | null;
}

export interface FinEntry {
  id: number;
  date: string; // YYYY-MM-DD
  description: string;
  debitAccountId: number;
  debitAmount: number;
  creditAccountId: number;
  creditAmount: number;
}

export interface BudgetInput {
  accountId: number;
  period: string; // YYYY 或 YYYY-MM
  amount: number;
}

const DEBIT_INCREASE: AccountType[] = ["asset", "expense"];
function isDebitIncrease(t: AccountType): boolean {
  return DEBIT_INCREASE.includes(t);
}

/** 科目在某日期前的余额（含该日）。借增类=借-贷，贷增类=贷-借 */
export function accountBalance(
  acc: FinAccount,
  entries: FinEntry[],
  asOf: string
): number {
  // v4.1 T4: 整数分累加, 消除浮点累积误差
  let debitCents = 0;
  let creditCents = 0;
  for (const e of entries) {
    if (e.date > asOf) continue;
    if (e.debitAccountId === acc.id) debitCents += toCents(e.debitAmount);
    if (e.creditAccountId === acc.id) creditCents += toCents(e.creditAmount);
  }
  const balance = isDebitIncrease(acc.type)
    ? debitCents - creditCents
    : creditCents - debitCents;
  return toDisplay(balance);
}

/** 科目在 [start,end] 内的借贷发生额 */
export function periodActivity(
  acc: FinAccount,
  entries: FinEntry[],
  start: string,
  end: string
): { debit: number; credit: number } {
  // v4.1 T4: 整数分累加
  let debitCents = 0;
  let creditCents = 0;
  for (const e of entries) {
    if (e.date < start || e.date > end) continue;
    if (e.debitAccountId === acc.id) debitCents += toCents(e.debitAmount);
    if (e.creditAccountId === acc.id) creditCents += toCents(e.creditAmount);
  }
  return { debit: toDisplay(debitCents), credit: toDisplay(creditCents) };
}

/** 科目在 [start,end] 内的本期净发生额（收入为正、费用为正） */
export function periodNet(
  acc: FinAccount,
  entries: FinEntry[],
  start: string,
  end: string
): number {
  const { debit, credit } = periodActivity(acc, entries, start, end);
  return isDebitIncrease(acc.type) ? debit - credit : credit - debit;
}

/** 识别现金类科目（库存现金/银行存款），用于现金流量表 */
export function detectCashAccountIds(accounts: FinAccount[]): number[] {
  return accounts
    .filter(
      a =>
        a.type === "asset" &&
        (/^(1001|1002)/.test(a.code) || /现金|存款|银行/.test(a.name))
    )
    .map(a => a.id);
}

/** 现金流分类：优先用 cashFlowCategory 字段，否则按科目类型+名称启发式推断 */
export function classifyForCashFlow(acc: FinAccount): CashFlowCategory {
  if (
    acc.cashFlowCategory === "operating" ||
    acc.cashFlowCategory === "investing" ||
    acc.cashFlowCategory === "financing"
  ) {
    return acc.cashFlowCategory;
  }
  if (acc.type === "income" || acc.type === "expense") return "operating";
  if (acc.type === "liability" || acc.type === "equity") return "financing";
  // asset 类：存货采购算经营，其余（固定资产等长期资产）算投资
  if (/存货|原材料|库存|商品/.test(acc.name)) return "operating";
  return "investing";
}

/** 是否为流动科目（用于流动/速动比率）。常规：资产/负债 code 以 1/2 开头为流动 */
function isCurrent(acc: FinAccount): boolean {
  return (
    /^(1|2)/.test(acc.code) ||
    /流动|现金|存款|应收|存货|短期|应付|预收|税费/.test(acc.name)
  );
}

/** 净利润 = 收入科目余额和 − 费用科目余额和（截至 asOf） */
export function netIncome(
  accounts: FinAccount[],
  entries: FinEntry[],
  asOf: string
): number {
  let inc = 0;
  let exp = 0;
  for (const a of accounts) {
    if (a.type === "income") inc += accountBalance(a, entries, asOf);
    else if (a.type === "expense") exp += accountBalance(a, entries, asOf);
  }
  return inc - exp;
}

// ───────────────────────── 试算平衡表 ─────────────────────────
export interface TrialBalanceRow {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
  balance: number;
}
export interface TrialBalanceResult {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}
export function trialBalance(
  accounts: FinAccount[],
  entries: FinEntry[],
  asOf: string
): TrialBalanceResult {
  const rows: TrialBalanceRow[] = accounts.map(a => {
    const b = accountBalance(a, entries, asOf);
    let debit = 0;
    let credit = 0;
    if (isDebitIncrease(a.type)) {
      if (b >= 0) debit = b;
      else credit = -b;
    } else {
      if (b >= 0) credit = b;
      else debit = -b;
    }
    return {
      id: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      debit,
      credit,
      balance: b,
    };
  });
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  return {
    rows,
    totalDebit,
    totalCredit,
    balanced: Math.abs(totalDebit - totalCredit) < 0.01,
  };
}

// ───────────────────────── 资产负债表 ─────────────────────────
export interface BalanceSheetRow {
  id: number;
  code: string;
  name: string;
  balance: number;
}
export interface BalanceSheetResult {
  assetRows: BalanceSheetRow[];
  liabilityRows: BalanceSheetRow[];
  equityRows: BalanceSheetRow[];
  assets: number;
  liabilities: number;
  equity: number;
  netIncome: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  balanced: boolean;
}
export function balanceSheet(
  accounts: FinAccount[],
  entries: FinEntry[],
  asOf: string
): BalanceSheetResult {
  const assetRows: BalanceSheetRow[] = [];
  const liabilityRows: BalanceSheetRow[] = [];
  const equityRows: BalanceSheetRow[] = [];
  let assets = 0;
  let liabilities = 0;
  let equity = 0;
  for (const a of accounts) {
    const b = accountBalance(a, entries, asOf);
    if (a.type === "asset") {
      assets += b;
      assetRows.push({ id: a.id, code: a.code, name: a.name, balance: b });
    } else if (a.type === "liability") {
      liabilities += b;
      liabilityRows.push({ id: a.id, code: a.code, name: a.name, balance: b });
    } else if (a.type === "equity") {
      equity += b;
      equityRows.push({ id: a.id, code: a.code, name: a.name, balance: b });
    }
  }
  const ni = netIncome(accounts, entries, asOf);
  const totalEquity = equity + ni;
  const totalLiabilitiesAndEquity = liabilities + totalEquity;
  return {
    assetRows,
    liabilityRows,
    equityRows,
    assets,
    liabilities,
    equity,
    netIncome: ni,
    totalEquity,
    totalLiabilitiesAndEquity,
    balanced: Math.abs(assets - totalLiabilitiesAndEquity) < 0.01,
  };
}

// ───────────────────────── 利润表 ─────────────────────────
export interface IncomeStatementRow {
  id: number;
  code: string;
  name: string;
  amount: number;
}
export interface IncomeStatementResult {
  incomeRows: IncomeStatementRow[];
  expenseRows: IncomeStatementRow[];
  totalIncome: number;
  totalExpense: number;
  netIncome: number;
}
export function incomeStatement(
  accounts: FinAccount[],
  entries: FinEntry[],
  start: string,
  end: string
): IncomeStatementResult {
  const incomeRows: IncomeStatementRow[] = [];
  const expenseRows: IncomeStatementRow[] = [];
  let totalIncome = 0;
  let totalExpense = 0;
  for (const a of accounts) {
    if (a.type === "income") {
      const amt = periodNet(a, entries, start, end);
      totalIncome += amt;
      incomeRows.push({ id: a.id, code: a.code, name: a.name, amount: amt });
    } else if (a.type === "expense") {
      const amt = periodNet(a, entries, start, end);
      totalExpense += amt;
      expenseRows.push({ id: a.id, code: a.code, name: a.name, amount: amt });
    }
  }
  return {
    incomeRows,
    expenseRows,
    totalIncome,
    totalExpense,
    netIncome: totalIncome - totalExpense,
  };
}

// ───────────────────────── 现金流量表 ─────────────────────────
export interface CashFlowResult {
  operating: number;
  investing: number;
  financing: number;
  net: number;
  rows: Array<{
    category: CashFlowCategory;
    accountName: string;
    amount: number;
    direction: "in" | "out";
  }>;
}
export function cashFlow(
  accounts: FinAccount[],
  entries: FinEntry[],
  start: string,
  end: string
): CashFlowResult {
  const cashIds = new Set(detectCashAccountIds(accounts));
  if (cashIds.size === 0) {
    return { operating: 0, investing: 0, financing: 0, net: 0, rows: [] };
  }
  const byId = new Map(accounts.map(a => [a.id, a]));
  let operating = 0;
  let investing = 0;
  let financing = 0;
  const rows: CashFlowResult["rows"] = [];
  for (const e of entries) {
    if (e.date < start || e.date > end) continue;
    const involvesCash =
      cashIds.has(e.debitAccountId) || cashIds.has(e.creditAccountId);
    if (!involvesCash) continue;
    // 现金在借方=流入；现金在贷方=流出。对方科目是另一侧
    let counterpartyId: number;
    let amount: number;
    let isInflow: boolean;
    if (cashIds.has(e.debitAccountId)) {
      counterpartyId = e.creditAccountId;
      amount = e.debitAmount;
      isInflow = true;
    } else {
      counterpartyId = e.debitAccountId;
      amount = e.creditAmount;
      isInflow = false;
    }
    const acc = byId.get(counterpartyId);
    if (!acc) continue;
    const cat = classifyForCashFlow(acc);
    const signed = isInflow ? amount : -amount;
    if (cat === "operating") operating += signed;
    else if (cat === "investing") investing += signed;
    else financing += signed;
    rows.push({
      category: cat,
      accountName: acc.name,
      amount,
      direction: isInflow ? "in" : "out",
    });
  }
  return {
    operating,
    investing,
    financing,
    net: operating + investing + financing,
    rows,
  };
}

// ───────────────────────── 所有者权益变动表 ─────────────────────────
export interface EquityStatementRow {
  id: number;
  code: string;
  name: string;
  beginning: number;
  change: number;
  ending: number;
}
export interface EquityStatementResult {
  rows: EquityStatementRow[];
  beginning: number;
  netIncome: number;
  ownerInvestment: number;
  dividends: number;
  ending: number;
}
export function equityStatement(
  accounts: FinAccount[],
  entries: FinEntry[],
  start: string,
  end: string
): EquityStatementResult {
  const eqAccounts = accounts.filter(a => a.type === "equity");
  const rows: EquityStatementRow[] = eqAccounts.map(a => ({
    id: a.id,
    code: a.code,
    name: a.name,
    beginning: accountBalance(a, entries, start),
    change: periodNet(a, entries, start, end),
    ending: accountBalance(a, entries, end),
  }));
  const beginning = rows.reduce((s, r) => s + r.beginning, 0);
  const ni =
    netIncome(accounts, entries, end) - netIncome(accounts, entries, start);
  const ownerInvestment = eqAccounts
    .filter(a => /资本|投资/.test(a.name))
    .reduce((s, a) => s + periodNet(a, entries, start, end), 0);
  const dividends = eqAccounts
    .filter(a => /利润|盈余|分配|股利|分红/.test(a.name))
    .reduce((s, a) => s + periodNet(a, entries, start, end), 0);
  return {
    rows,
    beginning,
    netIncome: ni,
    ownerInvestment,
    dividends,
    ending: beginning + ni + ownerInvestment - dividends,
  };
}

// ───────────────────────── 财务比率 ─────────────────────────
export interface RatiosResult {
  currentRatio: number;
  quickRatio: number;
  debtRatio: number;
  grossMargin: number;
  netMargin: number;
  roe: number;
  roa: number;
  interestCoverage: number | null;
}
export function ratios(
  accounts: FinAccount[],
  entries: FinEntry[],
  asOf: string
): RatiosResult {
  const bal = (a: FinAccount) => accountBalance(a, entries, asOf);
  const byType = (t: AccountType) => accounts.filter(a => a.type === t);

  const totalAssets = byType("asset").reduce((s, a) => s + bal(a), 0);
  const ca = byType("asset")
    .filter(isCurrent)
    .reduce((s, a) => s + bal(a), 0);
  const inv = byType("asset")
    .filter(a => /存货|原材料|库存|商品/.test(a.name))
    .reduce((s, a) => s + bal(a), 0);
  const totalLiab = byType("liability").reduce((s, a) => s + bal(a), 0);
  const cl = byType("liability")
    .filter(isCurrent)
    .reduce((s, a) => s + bal(a), 0);

  const ni = netIncome(accounts, entries, asOf);
  const totalEquity = byType("equity").reduce((s, a) => s + bal(a), 0) + ni;

  const rev = byType("income").reduce((s, a) => s + bal(a), 0);
  const cogs = byType("expense")
    .filter(a => /成本|COGS|营业成本/.test(a.name))
    .reduce((s, a) => s + bal(a), 0);
  const intr = byType("expense")
    .filter(a => /利息/.test(a.name))
    .reduce((s, a) => s + bal(a), 0);

  return {
    currentRatio: cl ? ca / cl : 0,
    quickRatio: cl ? (ca - inv) / cl : 0,
    debtRatio: totalAssets ? totalLiab / totalAssets : 0,
    // 无单独成本科目时，毛利率回退为 (收入−全部费用)/收入
    grossMargin: rev ? (rev - cogs) / rev : 0,
    netMargin: rev ? ni / rev : 0,
    roe: totalEquity ? ni / totalEquity : 0,
    roa: totalAssets ? ni / totalAssets : 0,
    interestCoverage: intr ? (ni + Math.abs(intr)) / Math.abs(intr) : null,
  };
}

// ───────────────────────── 预算 vs 实际 ─────────────────────────
export interface BudgetRow {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  budget: number;
  actual: number;
  variance: number;
  pct: number;
}
export interface BudgetVsActualResult {
  rows: BudgetRow[];
  totalBudget: number;
  totalActual: number;
}
export function budgetVsActual(
  accounts: FinAccount[],
  entries: FinEntry[],
  budgets: BudgetInput[],
  asOf: string
): BudgetVsActualResult {
  const budMap = new Map<number, number>();
  for (const b of budgets) budMap.set(b.accountId, b.amount);
  const rows: BudgetRow[] = accounts
    .filter(a => a.type === "income" || a.type === "expense")
    .map(a => {
      const actual = accountBalance(a, entries, asOf);
      const budget = budMap.get(a.id) || 0;
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        budget,
        actual,
        variance: actual - budget,
        pct: budget ? (actual - budget) / budget : 0,
      };
    });
  return {
    rows,
    totalBudget: rows.reduce((s, r) => s + r.budget, 0),
    totalActual: rows.reduce((s, r) => s + r.actual, 0),
  };
}

// ───────────────────────── 仪表盘汇总（图表用） ─────────────────────────
export interface DashboardResult {
  kpis: Array<{ label: string; value: number; positive?: boolean }>;
  incomeVsExpense: { revenue: number; expense: number };
  cash: number;
  netIncome: number;
  ratios: RatiosResult;
}
export function dashboard(
  accounts: FinAccount[],
  entries: FinEntry[],
  start: string,
  end: string,
  asOf: string
): DashboardResult {
  const ni = netIncome(accounts, entries, asOf);
  const rev = accounts
    .filter(a => a.type === "income")
    .reduce((s, a) => s + accountBalance(a, entries, asOf), 0);
  const exp = accounts
    .filter(a => a.type === "expense")
    .reduce((s, a) => s + accountBalance(a, entries, asOf), 0);
  const cash =
    accounts
      .filter(a => detectCashAccountIds(accounts).includes(a.id))
      .reduce((s, a) => s + accountBalance(a, entries, asOf), 0) || 0;
  const bs = balanceSheet(accounts, entries, asOf);
  const cf = cashFlow(accounts, entries, start, end);
  return {
    kpis: [
      { label: "营业收入", value: rev },
      { label: "净利润", value: ni, positive: ni >= 0 },
      { label: "资产总额", value: bs.assets },
      { label: "负债总额", value: bs.liabilities },
      { label: "所有者权益", value: bs.totalEquity },
      { label: "货币资金", value: cash },
      { label: "现金净流量", value: cf.net, positive: cf.net >= 0 },
    ],
    incomeVsExpense: { revenue: rev, expense: exp },
    cash,
    netIncome: ni,
    ratios: ratios(accounts, entries, asOf),
  };
}

// ───────────────────────── 期末结转凭证生成 ─────────────────────────
/**
 * 生成期末结转凭证（不直接落库，由 router 负责写入 + 记录 closings + 审计）。
 * 规则：把所有 income/expense 科目余额清零，差额转入「留存收益/利润分配」科目。
 * 返回 { closingEntries, retainedEarningsAccountId, netIncome }。
 */
export interface ClosingPlan {
  closingEntries: Omit<FinEntry, "id">[];
  retainedEarningsAccountId: number;
  netIncome: number;
}
export function generateClosingEntries(
  accounts: FinAccount[],
  entries: FinEntry[],
  asOf: string
): ClosingPlan {
  const ni = netIncome(accounts, entries, asOf);
  const retained =
    accounts.find(
      a => a.type === "equity" && /利润|盈余|留存|未分配/.test(a.name)
    ) || accounts.find(a => a.type === "equity");
  if (!retained) throw new Error("缺少留存收益/利润分配科目，无法结转");

  const closingEntries: Omit<FinEntry, "id">[] = [];
  for (const a of accounts) {
    if (a.type !== "income" && a.type !== "expense") continue;
    const b = accountBalance(a, entries, asOf);
    if (Math.abs(b) < 0.01) continue;
    const amt = Math.abs(b);
    if (isDebitIncrease(a.type)) {
      // 费用类（借增）：贷费用 amt，借留存收益 amt → 清零费用，留存增加
      closingEntries.push({
        date: asOf,
        description: `期末结转-${a.name}`,
        debitAccountId: retained.id,
        debitAmount: amt,
        creditAccountId: a.id,
        creditAmount: amt,
      });
    } else {
      // 收入类（贷增）：借收入 amt，贷留存收益 amt → 清零收入，留存增加
      closingEntries.push({
        date: asOf,
        description: `期末结转-${a.name}`,
        debitAccountId: a.id,
        debitAmount: amt,
        creditAccountId: retained.id,
        creditAmount: amt,
      });
    }
  }
  return {
    closingEntries,
    retainedEarningsAccountId: retained.id,
    netIncome: ni,
  };
}
