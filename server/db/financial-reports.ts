// financial-reports.ts — 财智财务模块 v5 数据库查询/写入层
//
// F-003: PG 模式读写分裂 — 读取走独立 sqlite, 写入走 drizzle→PG
// 修复前硬禁用 PG, 统一 DB_TYPE=sqlite 后财务模块方可使用
import { config } from "../config";
if (config.db?.type === "postgres") {
  throw new Error(
    "[financial-reports] DB_TYPE=postgres 暂不支持财务模块。请改用 sqlite 或等待统一读写层。"
  );
}
//
// 职责（和 financials.ts 的边界）：
//   financials.ts = 纯计算引擎（输入纯数据，输出报表），不碰数据库。
//   本文件        = 数据访问层（DB ↔ 引擎之间的桥）：
//     1) 把 DB 行 (accounts / journalEntries) 映射成引擎需要的 FinAccount / FinEntry
//     2) 预算 budgets 与期末结转 closings 的 CRUD
//     3) CSV 导入解析（科目表 + 记账凭证），把文本解析成可落库结构
//
// 租户隔离：所有查询都以 projectId 过滤，绝不跨项目读取。
//
// ⚠️ 关于「全局 LIMIT 守护」：server/db/connection.ts 给所有 .select().all()
// 自动加 50 行上限（防内存炸弹）。但财务报表必须读取「全部」科目与凭证，
// 因此本文件的【读取】操作直接用导出的底层 better-sqlite3 实例 `sqlite` 跑
// 原生 SQL，绕过 limit guard；【写入】操作仍走 drizzle `db`（insert/update/delete
// 不经过 select 代理，不受限）。这样既不破坏全局护栏，又能拿到完整数据。

import { db, sqlite, eq, and } from "./connection";
import { budgets, closings } from "../../drizzle/schema";
import type {
  AccountType,
  CashFlowCategory,
  FinAccount,
  FinEntry,
  BudgetInput,
} from "../services/financials";

// ───────────────────────── 读取：科目 & 凭证（映射为引擎纯类型） ─────────────────────────

export interface DbAccountRow {
  id: number;
  code: string;
  name: string;
  type: string;
  cashFlowCategory: string | null;
  parentId: number | null;
}

export interface DbEntryRow {
  id: number;
  date: string;
  description: string;
  debitAccountId: number;
  debitAmount: number;
  creditAccountId: number;
  creditAmount: number;
}

/** 读取项目全部科目（绕过 LIMIT 守护），映射成 FinAccount */
export function getFinAccounts(projectId: number): FinAccount[] {
  const rows = sqlite
    .prepare(
      `SELECT id, code, name, type, cashFlowCategory, parentId
       FROM accounts WHERE projectId = ? ORDER BY code ASC`
    )
    .all(projectId) as DbAccountRow[];
  return rows.map(r => ({
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.type as AccountType,
    cashFlowCategory: (r.cashFlowCategory as CashFlowCategory | null) ?? null,
    parentId: r.parentId ?? null,
  }));
}

/** 读取项目全部记账凭证（绕过 LIMIT 守护），映射成 FinEntry */
export function getFinEntries(projectId: number): FinEntry[] {
  const rows = sqlite
    .prepare(
      `SELECT id, date, description, debitAccountId, debitAmount, creditAccountId, creditAmount
       FROM journalEntries WHERE projectId = ? ORDER BY date ASC, id ASC`
    )
    .all(projectId) as DbEntryRow[];
  return rows.map(r => ({
    id: r.id,
    date: r.date,
    description: r.description,
    debitAccountId: r.debitAccountId,
    debitAmount: r.debitAmount,
    creditAccountId: r.creditAccountId,
    creditAmount: r.creditAmount,
  }));
}

// ───────────────────────── 预算 budgets CRUD ─────────────────────────

export interface UpsertBudgetInput {
  projectId: number;
  accountId: number;
  period: string; // YYYY 或 YYYY-MM
  amount: number;
}

export function getBudgetsByProject(projectId: number) {
  return sqlite
    .prepare(
      `SELECT * FROM budgets WHERE projectId = ? ORDER BY period ASC, accountId ASC`
    )
    .all(projectId);
}

/** upsert：同 (projectId, accountId, period) 存在则更新金额，否则插入 */
export function upsertBudget(data: UpsertBudgetInput) {
  const existing = sqlite
    .prepare(
      `SELECT id FROM budgets WHERE projectId = ? AND accountId = ? AND period = ?`
    )
    .get(data.projectId, data.accountId, data.period) as
    { id: number } | undefined;
  if (existing) {
    return db
      .update(budgets)
      .set({ amount: data.amount })
      .where(eq(budgets.id, existing.id))
      .run();
  }
  return db
    .insert(budgets)
    .values({
      projectId: data.projectId,
      accountId: data.accountId,
      period: data.period,
      amount: data.amount,
      createdAt: new Date().toISOString(),
    })
    .run();
}

/** 删除预算（强制 projectId 过滤，防越权） */
export function deleteBudget(id: number, projectId: number) {
  return db
    .delete(budgets)
    .where(and(eq(budgets.id, id), eq(budgets.projectId, projectId)))
    .run();
}

// ───────────────────────── 期末结转 closings CRUD ─────────────────────────

export interface CreateClosingInput {
  projectId: number;
  period: string; // YYYY-MM
  closedBy: number;
  netIncome: number;
  entryCount: number;
  summary?: string;
}

export function getClosingsByProject(projectId: number) {
  return sqlite
    .prepare(
      `SELECT * FROM closings WHERE projectId = ? ORDER BY closedAt DESC`
    )
    .all(projectId);
}

export function isPeriodClosed(projectId: number, period: string): boolean {
  const row = sqlite
    .prepare(`SELECT id FROM closings WHERE projectId = ? AND period = ?`)
    .get(projectId, period) as { id: number } | undefined;
  return !!row;
}

export function getClosing(id: number) {
  return sqlite.prepare(`SELECT * FROM closings WHERE id = ?`).get(id);
}

/** 写入一条结转记录，返回新行 id */
export function createClosing(data: CreateClosingInput): number {
  const result = db
    .insert(closings)
    .values({
      projectId: data.projectId,
      period: data.period,
      closedBy: data.closedBy,
      netIncome: data.netIncome,
      entryCount: data.entryCount,
      summary: data.summary ?? null,
      closedAt: new Date().toISOString(),
    })
    .run() as unknown as { lastInsertRowid: number | bigint };
  return Number(result.lastInsertRowid);
}

// ───────────────────────── CSV 解析（纯函数） ─────────────────────────

/** 轻量 CSV 行解析，支持引号包裹与双引号转义（""） */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

/** 在表头里找列索引：优先精确匹配，其次包含匹配（aliases 越具体放越前） */
function findCol(header: string[], aliases: string[]): number {
  const lower = header.map(h => h.toLowerCase());
  for (const a of aliases) {
    const i = lower.indexOf(a.toLowerCase());
    if (i >= 0) return i;
  }
  for (const a of aliases) {
    const i = lower.findIndex(h => h.includes(a.toLowerCase()));
    if (i >= 0) return i;
  }
  return -1;
}

/** 把带货币/千分位的字符串解析成数字，失败返回 NaN */
function toNumber(v: string): number {
  if (v == null) return NaN;
  const cleaned = String(v).replace(/[¥$￥,\s]/g, "");
  if (cleaned === "") return NaN;
  return Number(cleaned);
}

const ACCOUNT_TYPE_MAP: Record<string, AccountType> = {
  asset: "asset",
  资产: "asset",
  资金: "asset",
  liability: "liability",
  负债: "liability",
  equity: "equity",
  权益: "equity",
  所有: "equity",
  income: "income",
  收入: "income",
  收益: "income",
  expense: "expense",
  费用: "expense",
  支出: "expense",
};

const CASHFLOW_MAP: Record<string, CashFlowCategory> = {
  operating: "operating",
  经营: "operating",
  营运: "operating",
  investing: "investing",
  投资: "investing",
  financing: "financing",
  筹资: "financing",
  融资: "financing",
};

export interface ParsedAccounts {
  accounts: Array<{
    code: string;
    name: string;
    type: AccountType;
    cashFlowCategory?: CashFlowCategory;
  }>;
  errors: string[];
}

/**
 * 解析科目表 CSV。期望表头含：code/科目编码、name/科目名称、type/类别，
 * 可选 cashFlowCategory/现金流量分类。中英文表头皆可。
 */
export function parseAccountsCsv(text: string): ParsedAccounts {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const errors: string[] = [];
  if (lines.length < 2) {
    return { accounts: [], errors: ["CSV 至少需要表头 + 一行数据"] };
  }
  const header = parseCsvLine(lines[0]);
  const codeI = findCol(header, ["code", "科目编码", "编码"]);
  const nameI = findCol(header, ["name", "科目名称", "名称"]);
  const typeI = findCol(header, ["type", "类别", "类型"]);
  const cfI = findCol(header, [
    "cashflowcategory",
    "cashflow",
    "现金流",
    "现金流量",
  ]);
  if (codeI < 0 || nameI < 0 || typeI < 0) {
    errors.push("表头缺少必要列（code/name/type）");
    return { accounts: [], errors };
  }
  const accounts: ParsedAccounts["accounts"] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const code = cols[codeI] ?? "";
    const name = cols[nameI] ?? "";
    const rawType = (cols[typeI] ?? "").toLowerCase();
    const type = ACCOUNT_TYPE_MAP[rawType];
    if (!code || !name) {
      errors.push(`第 ${i + 1} 行：缺少编码或名称`);
      continue;
    }
    if (!type) {
      errors.push(`第 ${i + 1} 行：科目类型无法识别 「${cols[typeI]}」`);
      continue;
    }
    const cfRaw = cfI >= 0 ? (cols[cfI] ?? "").toLowerCase() : "";
    const cashFlowCategory = cfRaw ? CASHFLOW_MAP[cfRaw] : undefined;
    accounts.push(
      cashFlowCategory
        ? { code, name, type, cashFlowCategory }
        : { code, name, type }
    );
  }
  return { accounts, errors };
}

export interface ParsedEntries {
  entries: Array<{
    date: string;
    description: string;
    debitAccountId: number;
    debitAmount: number;
    creditAccountId: number;
    creditAmount: number;
  }>;
  errors: string[];
}

/**
 * 解析记账凭证 CSV。期望表头含：date/日期、description/摘要、
 * debitCode/借方编码、debitAmount/借方金额、creditCode/贷方编码、creditAmount/贷方金额。
 * accountCodeToId 用于把「科目编码」翻译成「科目 id」（必须先读取本项目科目表）。
 */
export function parseEntriesCsv(
  text: string,
  accountCodeToId: Map<string, number>
): ParsedEntries {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const errors: string[] = [];
  if (lines.length < 2) {
    return { entries: [], errors: ["CSV 至少需要表头 + 一行数据"] };
  }
  const header = parseCsvLine(lines[0]);
  const dateI = findCol(header, ["date", "日期"]);
  const descI = findCol(header, ["description", "摘要", "desc"]);
  const debitCodeI = findCol(header, ["debitcode", "借方编码", "借方科目编码"]);
  const debitAmtI = findCol(header, ["debitamount", "借方金额"]);
  const creditCodeI = findCol(header, [
    "creditcode",
    "贷方编码",
    "贷方科目编码",
  ]);
  const creditAmtI = findCol(header, ["creditamount", "贷方金额"]);
  if (
    [dateI, descI, debitCodeI, debitAmtI, creditCodeI, creditAmtI].some(
      i => i < 0
    )
  ) {
    errors.push(
      "表头缺少必要列（date/description/debitCode/debitAmount/creditCode/creditAmount）"
    );
    return { entries: [], errors };
  }
  const entries: ParsedEntries["entries"] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const date = cols[dateI] ?? "";
    const description = cols[descI] ?? "";
    const debitCode = cols[debitCodeI] ?? "";
    const creditCode = cols[creditCodeI] ?? "";
    const debitAmount = toNumber(cols[debitAmtI] ?? "");
    const creditAmount = toNumber(cols[creditAmtI] ?? "");
    if (!date || !description) {
      errors.push(`第 ${i + 1} 行：缺少日期或摘要`);
      continue;
    }
    const debitAccountId = accountCodeToId.get(debitCode);
    const creditAccountId = accountCodeToId.get(creditCode);
    if (debitAccountId == null) {
      errors.push(`第 ${i + 1} 行：借方科目编码不存在「${debitCode}」`);
      continue;
    }
    if (creditAccountId == null) {
      errors.push(`第 ${i + 1} 行：贷方科目编码不存在「${creditCode}」`);
      continue;
    }
    if (
      !Number.isFinite(debitAmount) ||
      !Number.isFinite(creditAmount) ||
      debitAmount < 0 ||
      creditAmount < 0
    ) {
      errors.push(`第 ${i + 1} 行：金额非法`);
      continue;
    }
    if (Math.abs(debitAmount - creditAmount) > 0.01) {
      errors.push(
        `第 ${i + 1} 行：借贷不平衡（借 ${debitAmount} ≠ 贷 ${creditAmount}）`
      );
      continue;
    }
    entries.push({
      date,
      description,
      debitAccountId,
      debitAmount,
      creditAccountId,
      creditAmount,
    });
  }
  return { entries, errors };
}
