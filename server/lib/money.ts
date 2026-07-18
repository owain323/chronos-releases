/**
 * Money utility — v3.9.2 T4 部分修复
 *
 * 完整方案: DB amount: real → integer cents (大改, 需 schema 迁移 + 全链路读写改)
 * v4.0 TODO: 实施完整迁移
 *
 * v3.9.2 临时方案: 在计算层用整数分, 避免浮点累积误差
 * - 业务计算: toCents() 转 integer, 加减全用整数
 * - 显示层: toDisplay() 转回 number, 限定小数位
 * - DB 存 real 但计算前先转 cents
 */

/** 转成整数分(避免浮点) */
export function toCents(amount: number | string | null | undefined): number {
  if (amount == null) return 0;
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return Math.round(n * 100);
}

/** 整数分转回可显示数值 */
export function toDisplay(cents: number | null | undefined): number {
  if (cents == null) return 0;
  return Math.round(cents) / 100;
}

/** 安全加(整数分) */
export function addCents(...args: Array<number | string | null | undefined>): number {
  return args.reduce((sum: number, a) => sum + toCents(a), 0);
}

/** 安全减 */
export function subCents(a: number | string | null | undefined, b: number | string | null | undefined): number {
  return toCents(a) - toCents(b);
}

/** 格式化货币显示 */
export function fmtCents(cents: number | null | undefined, currency = "¥"): string {
  const v = toDisplay(cents);
  return `${currency}${v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
