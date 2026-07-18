/**
 * Feature Flag — 灰度发布控制
 * Sprint 4.2
 *
 * NOTE: feature_flags 表尚未创建（Sprint 4 实施时创建）。
 * 此测试基于 config.ts 验证逻辑，FF 表 DDL 在下一轮。
 */
import { describe, it, expect } from "vitest";
import { config } from "../../server/config";

describe("Feature Flag — 配置校验", () => {
  it("config 启动不崩溃 (所有必填项有值或默认)", () => {
    expect(config.auth.jwtSecret).toBeTruthy();
    expect(config.rateLimit.maxFails).toBeGreaterThan(0);
    expect(config.rateLimit.windowSec).toBeGreaterThan(0);
    expect(config.db.type).toMatch(/^(sqlite|postgres)$/);
  });

  it("rate limit 配置可读", () => {
    expect(config.rateLimit.maxFails).toBeGreaterThanOrEqual(10);
    expect(config.rateLimit.windowSec).toBeGreaterThanOrEqual(60);
  });

  it("audit 保留天数配置合理", () => {
    expect(config.audit.retentionDays).toBeGreaterThanOrEqual(30);
  });

  it("服务器端口在合法范围", () => {
    expect(config.server.port).toBeGreaterThanOrEqual(1);
    expect(config.server.port).toBeLessThanOrEqual(65535);
  });
});
