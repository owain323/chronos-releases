import { db, eq, desc, sql, inArray } from "./connection";
import { accounts, journalEntries } from "../../drizzle/schema";

export async function getAccountsByProjectId(projectId: number) {
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.projectId, projectId))
    .all();
}
export async function createAccount(data: {
  projectId: number;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense";
  cashFlowCategory?: "operating" | "investing" | "financing" | null;
  parentId?: number;
}) {
  return db
    .insert(accounts)
    .values({
      projectId: data.projectId,
      code: data.code,
      name: data.name,
      type: data.type,
      cashFlowCategory: data.cashFlowCategory ?? null,
      parentId: data.parentId ?? null,
      balance: 0,
      createdAt: new Date().toISOString(),
    })
    .run();
}
export async function getJournalEntriesByProjectId(
  projectId: number,
  opts?: { offset?: number; limit?: number }
) {
  const base = db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.projectId, projectId))
    .orderBy(desc(journalEntries.date));
  const withOffset = opts?.offset ? base.offset(opts.offset) : base;
  const result = opts?.limit ? withOffset.limit(opts.limit) : withOffset;
  return result.all();
}
export async function createJournalEntry(data: {
  projectId: number;
  date: string;
  description: string;
  debitAccountId: number;
  debitAmount: number;
  creditAccountId: number;
  creditAmount: number;
}) {
  // v4.1: 服务端强制借贷平衡（复式记账不变式）
  if (Math.abs(data.debitAmount - data.creditAmount) > 0.01) {
    throw new Error("借贷金额不平衡");
  }
  // v4.2: 校验借贷科目归属同一项目（跨租户防护）
  const accountsResult = db
    .select({ projectId: accounts.projectId })
    .from(accounts)
    .where(inArray(accounts.id, [data.debitAccountId, data.creditAccountId]))
    .all();
  const sameProject = accountsResult.every(
    (a: any) => a.projectId === data.projectId
  );
  if (accountsResult.length < 2 || !sameProject) {
    throw new Error("科目不属于当前项目");
  }
  // better-sqlite3 事务回调必须同步（禁止返回 Promise，否则必抛
  // "Transaction function cannot return a promise" 并回滚）。
  // 事务内读必须用 tx（而非外层 db），保证读写处于同一事务快照。
  return db.transaction(tx => {
    const result = tx
      .insert(journalEntries)
      .values({ ...data, createdAt: new Date().toISOString() })
      .run();

    // 根据科目类型确定增减方向
    // debit 增加: asset, expense
    // credit 增加: liability, equity, income
    const debitAccount = tx
      .select()
      .from(accounts)
      .where(eq(accounts.id, data.debitAccountId))
      .get() as any;
    const creditAccount = tx
      .select()
      .from(accounts)
      .where(eq(accounts.id, data.creditAccountId))
      .get() as any;

    const increaseTypes = ["asset", "expense"];
    const decreaseTypes = ["liability", "equity", "income"];

    if (debitAccount) {
      const delta = increaseTypes.includes(debitAccount.type)
        ? data.debitAmount
        : -data.debitAmount;
      tx.run(
        sql`UPDATE accounts SET balance = balance + ${delta} WHERE id = ${data.debitAccountId}`
      );
    }
    if (creditAccount) {
      const delta = decreaseTypes.includes(creditAccount.type)
        ? data.creditAmount
        : -data.creditAmount;
      tx.run(
        sql`UPDATE accounts SET balance = balance + ${delta} WHERE id = ${data.creditAccountId}`
      );
    }
    return result;
  });
}
export async function seedDefaultAccounts(projectId: number) {
  const existing = db
    .select()
    .from(accounts)
    .where(eq(accounts.projectId, projectId))
    .all();
  if (existing.length > 0) return;
  const now = new Date().toISOString();
  const defaults = [
    { code: "1001", name: "库存现金", type: "asset" as const },
    { code: "1002", name: "银行存款", type: "asset" as const },
    { code: "1122", name: "应收账款", type: "asset" as const },
    { code: "1403", name: "原材料", type: "asset" as const },
    { code: "1601", name: "固定资产", type: "asset" as const },
    { code: "2001", name: "短期借款", type: "liability" as const },
    { code: "2202", name: "应付账款", type: "liability" as const },
    { code: "4001", name: "实收资本", type: "equity" as const },
    { code: "5001", name: "主营业务收入", type: "income" as const },
    { code: "5401", name: "主营业务成本", type: "expense" as const },
    { code: "5601", name: "销售费用", type: "expense" as const },
    { code: "5602", name: "管理费用", type: "expense" as const },
  ];
  for (const acct of defaults) {
    db.insert(accounts)
      .values({
        projectId,
        code: acct.code,
        name: acct.name,
        type: acct.type,
        balance: 0,
        createdAt: now,
      })
      .run();
  }
}
