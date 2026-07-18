/**
 * P0 修复: 复式记账核心不变式 — 真实 DB 断言 (原 describe.skip 全量恢复)
 * 科目种子: 测试内用生产函数 seedDefaultAccounts 自建 fixture (专用 projectId,
 * 不依赖任何预置数据, 每 worker 独立测试库互不干扰)。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "./connection";
import { accounts, journalEntries } from "../../drizzle/schema";
import { createJournalEntry, seedDefaultAccounts } from "./accounting";

// 专用测试项目号段, 避免与同 worker 其他测试文件数据冲突
const PROJECT_A = 91001;
const PROJECT_B = 91002;

function getAccount(projectId: number, code: string) {
  return db
    .select()
    .from(accounts)
    .where(and(eq(accounts.projectId, projectId), eq(accounts.code, code)))
    .get() as any;
}

beforeAll(async () => {
  // 每个项目 12 个默认科目 (1001 库存现金 / 2001 短期借款 / ...)
  await seedDefaultAccounts(PROJECT_A);
  await seedDefaultAccounts(PROJECT_B);
});

describe("P0: 复式记账核心不变式", { timeout: 15000 }, () => {
  it("fixture: 默认科目种子落库 (每项目 12 个)", () => {
    const rowsA = db
      .select()
      .from(accounts)
      .where(eq(accounts.projectId, PROJECT_A))
      .all();
    expect(rowsA.length).toBe(12);
    expect(getAccount(PROJECT_A, "1001")?.name).toBe("库存现金");
    expect(getAccount(PROJECT_A, "2001")?.type).toBe("liability");
  });

  it("第一不变式: 借贷不平衡 → 服务端强制拒绝", async () => {
    const cash = getAccount(PROJECT_A, "1001");
    const loan = getAccount(PROJECT_A, "2001");
    await expect(
      createJournalEntry({
        projectId: PROJECT_A,
        date: new Date().toISOString(),
        description: "不平衡凭证",
        debitAccountId: cash.id,
        debitAmount: 5000,
        creditAccountId: loan.id,
        creditAmount: 4999, // 借贷差 1
      })
    ).rejects.toThrow("借贷金额不平衡");

    // 被拒后不得有任何残留
    const entries = db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.projectId, PROJECT_A))
      .all();
    expect(entries.length).toBe(0);
  });

  it("跨项目防护: 借贷科目不属于同一项目 → 拒绝", async () => {
    const cashA = getAccount(PROJECT_A, "1001");
    const loanB = getAccount(PROJECT_B, "2001"); // 项目 B 的科目
    await expect(
      createJournalEntry({
        projectId: PROJECT_A,
        date: new Date().toISOString(),
        description: "跨项目凭证",
        debitAccountId: cashA.id,
        debitAmount: 1000,
        creditAccountId: loanB.id,
        creditAmount: 1000,
      })
    ).rejects.toThrow("科目不属于当前项目");
  });

  // 源码缺陷已修复: createJournalEntry 事务回调已改为同步（better-sqlite3
  // 要求）, 事务内读改用 tx。以下恢复为正式断言。
  it("余额方向: 借 asset → 余额+, 贷 liability → 余额+, 凭证落库", async () => {
    const cash = getAccount(PROJECT_A, "1001");
    const loan = getAccount(PROJECT_A, "2001");

    await createJournalEntry({
      projectId: PROJECT_A,
      date: new Date().toISOString(),
      description: "会计方向测试",
      debitAccountId: cash.id,
      debitAmount: 5000,
      creditAccountId: loan.id,
      creditAmount: 5000,
    });

    const cashAfter = getAccount(PROJECT_A, "1001");
    const loanAfter = getAccount(PROJECT_A, "2001");
    // asset 借方增加
    expect(cashAfter.balance).toBe((cash.balance || 0) + 5000);
    // liability 贷方增加 (不是减少)
    expect(loanAfter.balance).toBe((loan.balance || 0) + 5000);

    const rows = db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.projectId, PROJECT_A))
      .all();
    expect(rows.length).toBe(1);
    expect((rows[0] as any).description).toBe("会计方向测试");
  });

  it("反向: 借 liability → 余额-, 贷 asset → 余额-", async () => {
    const cashBefore = getAccount(PROJECT_A, "1001");
    const loanBefore = getAccount(PROJECT_A, "2001");

    await createJournalEntry({
      projectId: PROJECT_A,
      date: new Date().toISOString(),
      description: "偿还借款",
      debitAccountId: loanBefore.id, // liability 借方 → 减少
      debitAmount: 1000,
      creditAccountId: cashBefore.id, // asset 贷方 → 减少
      creditAmount: 1000,
    });

    expect(getAccount(PROJECT_A, "2001").balance).toBe(
      (loanBefore.balance || 0) - 1000
    );
    expect(getAccount(PROJECT_A, "1001").balance).toBe(
      (cashBefore.balance || 0) - 1000
    );
  });

  it("事务性: 多笔记账后借贷合计恒等 (试算平衡)", async () => {
    // PROJECT_B 全新账本: 注资 → 采购 → 费用
    const b = (code: string) => getAccount(PROJECT_B, code);
    const post = (
      debit: string,
      credit: string,
      amount: number,
      desc: string
    ) =>
      createJournalEntry({
        projectId: PROJECT_B,
        date: new Date().toISOString(),
        description: desc,
        debitAccountId: b(debit).id,
        debitAmount: amount,
        creditAccountId: b(credit).id,
        creditAmount: amount,
      });

    await post("1001", "4001", 100000, "股东注资"); // 现金+/实收资本+
    await post("1403", "2202", 30000, "赊购原材料"); // 原材料+/应付账款+
    await post("5602", "1001", 5000, "付管理费"); // 管理费用+/现金-

    const rows = db
      .select()
      .from(accounts)
      .where(eq(accounts.projectId, PROJECT_B))
      .all();
    // 全部科目余额代数和 === 0 (debit 增加类为正, credit 增加类为负的恒等结果)
    const debitTypes = ["asset", "expense"];
    const sum = rows.reduce(
      (s: number, a: any) =>
        s + (debitTypes.includes(a.type) ? a.balance : -a.balance),
      0
    );
    expect(Math.abs(sum)).toBeLessThan(0.01);
    expect(b("1001").balance).toBe(95000);
    expect(b("4001").balance).toBe(100000);
  });
});
