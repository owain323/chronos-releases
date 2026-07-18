import { describe, it, expect, afterEach } from "vitest";

// Mock config before import
process.env.REDIS_URL = "";
process.env.RATE_LIMIT_MAX = "10";
process.env.RATE_LIMIT_WINDOW = "60";

// Re-import to pick up mocked env
const { checkRateLimit, resetRateLimit, createRateLimiter } =
  await import("../lib/rate-limit");

describe("Rate-Limit", () => {
  afterEach(() => {
    // Reset internal state for isolation
    resetRateLimit("127.0.0.1");
  });

  it("允许低于阈值的请求", async () => {
    for (let i = 0; i < 8; i++) {
      expect(await checkRateLimit("127.0.0.1")).toBe(true);
    }
  });

  // v3.8: rate-limit 配置已可注入（createRateLimiter 工厂），
  // 用独立 limiter 固定阈值（成功窗口=10），两条核心用例真实执行
  it("第11次请求被拒绝", async () => {
    const limiter = createRateLimiter({
      maxFails: 10,
      maxAttempts: 10,
      windowSec: 60,
      redisUrl: "",
    });
    for (let i = 0; i < 10; i++) {
      expect(await limiter.checkRateLimit("127.0.0.2")).toBe(true);
    }
    expect(await limiter.checkRateLimit("127.0.0.2")).toBe(false);
  });

  it("不同IP独立计数", async () => {
    const limiter = createRateLimiter({
      maxFails: 10,
      maxAttempts: 10,
      windowSec: 60,
      redisUrl: "",
    });
    for (let i = 0; i < 10; i++) {
      await limiter.checkRateLimit("127.0.0.3");
    }
    expect(await limiter.checkRateLimit("127.0.0.3")).toBe(false);
    expect(await limiter.checkRateLimit("127.0.0.4")).toBe(true);
  });

  it("resetRateLimit 清除计数", async () => {
    for (let i = 0; i < 10; i++) {
      await checkRateLimit("127.0.0.5");
    }
    await resetRateLimit("127.0.0.5");
    expect(await checkRateLimit("127.0.0.5")).toBe(true);
  });
});
