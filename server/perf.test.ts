/**
 * API 性能趋势报告
 * - 本地: 使用本地 localhost (TEST_URL 可选)
 * - CI: 启动本地服务测试, 阈值宽松 (不阻塞 PR)
 * P0 修复: 服务不可达时显式 skip (报告中可见), 不再静默 return 假绿;
 * 可达时强制断言 res.ok 与耗时阈值。
 */
import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.TEST_URL || "http://localhost:3006";
const isCI = !!process.env.CI;

let serviceUp = false;

beforeAll(async () => {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    await fetch(`${BASE}/api/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    serviceUp = true;
  } catch {
    serviceUp = false;
  }
});

const skipIfDown = (ctx: any) => {
  if (serviceUp) return false;
  // eslint-disable-next-line no-console
  console.log(`[perf] 服务不可达 (${BASE}), 显式跳过 — 起服务后重跑本用例`);
  ctx.skip();
  return true;
};

describe("API 性能趋势", { timeout: 30000 }, () => {
  it("GET /api/health < 200ms", async ctx => {
    if (skipIfDown(ctx)) return;
    const t0 = performance.now();
    const res = await fetch(`${BASE}/api/health`);
    const t1 = performance.now();
    expect(res.ok).toBe(true); // 可达但非 2xx 必须红, 不许静默放过
    const ms = Math.round(t1 - t0);
    // eslint-disable-next-line no-console
    console.log(`[perf] health: ${ms}ms`);
    // CI 用宽松阈值 (200ms), 本地默认 50ms
    expect(ms).toBeLessThan(isCI ? 200 : 50);
  });

  it("GET / < 500ms", async ctx => {
    if (skipIfDown(ctx)) return;
    const t0 = performance.now();
    const res = await fetch(BASE);
    const t1 = performance.now();
    expect(res.ok).toBe(true);
    const ms = Math.round(t1 - t0);
    // eslint-disable-next-line no-console
    console.log(`[perf] index: ${ms}ms`);
    expect(ms).toBeLessThan(isCI ? 500 : 200);
  });
});
