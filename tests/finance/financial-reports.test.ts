/**
 * 财务报表恒等式 — vitest 接入版
 * P0 修复: scripts/verify-financial-reports.ts 的 10 条会计恒等式断言
 * 原仅靠手工脚本兜底, 现接入 vitest/CI, 随 `npx vitest run` 强制执行。
 * CLI (npm run verify:finance) 行为不变, 二者共用 runFinancialVerification()。
 */
import { describe, it, expect } from "vitest";
import { runFinancialVerification } from "../../scripts/verify-financial-reports.ts";

const { checks, tb, is, bs, cf, eq, ratios } = runFinancialVerification();

describe("财务报表恒等式 (verify-financial-reports → vitest)", () => {
  it("1) 试算平衡：借方合计 === 贷方合计", () => {
    expect(tb.totalDebit).toBeCloseTo(tb.totalCredit, 2);
    expect(checks[0].pass).toBe(true);
  });

  it("2) 净利润 = 收入合计 − 费用合计", () => {
    expect(is.netIncome).toBeCloseTo(is.totalIncome - is.totalExpense, 2);
    expect(checks[1].pass).toBe(true);
  });

  it("3) 资产负债表：资产 === 负债 + 权益(含净利润)", () => {
    expect(bs.assets).toBeCloseTo(bs.liabilities + bs.totalEquity, 2);
    expect(checks[2].pass).toBe(true);
  });

  it("4) 权益合计 = 权益账面 + 本期净利润", () => {
    expect(bs.totalEquity).toBeCloseTo(bs.equity + bs.netIncome, 2);
    expect(checks[3].pass).toBe(true);
  });

  it("5) 资产负债表净利润 === 利润表净利润", () => {
    expect(bs.netIncome).toBeCloseTo(is.netIncome, 2);
    expect(checks[4].pass).toBe(true);
  });

  it("6) netIncome() 独立函数与利润表一致", () => {
    expect(checks[5].pass).toBe(true);
  });

  it("7) 现金流量净额 = 现金净变动 (328,000)", () => {
    expect(cf.net).toBeCloseTo(328000, 2);
    expect(checks[6].pass).toBe(true);
  });

  it("8) 权益变动：期末 = 期初 + 净利 + 投入 − 分红", () => {
    expect(eq.ending).toBeCloseTo(
      eq.beginning + eq.netIncome + eq.ownerInvestment - eq.dividends,
      2
    );
    expect(checks[7].pass).toBe(true);
  });

  it("9) 财务比率在合理区间 (流动>0, 负债率∈[0,1])", () => {
    expect(ratios.currentRatio).toBeGreaterThan(0);
    expect(ratios.debtRatio).toBeGreaterThanOrEqual(0);
    expect(ratios.debtRatio).toBeLessThanOrEqual(1);
    expect(checks[8].pass).toBe(true);
  });

  it("10) 净利率 = 净利润 / 收入", () => {
    expect(ratios.netMargin).toBeCloseTo(is.netIncome / is.totalIncome, 4);
    expect(checks[9].pass).toBe(true);
  });

  it("汇总: 10 条恒等式全部通过", () => {
    expect(checks).toHaveLength(10);
    expect(checks.every(c => c.pass)).toBe(true);
  });
});
