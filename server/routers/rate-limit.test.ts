/**
 * 限流测试：高阈值下不误锁
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import http from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "../_core/context";

let server: http.Server;
let url: string;

beforeAll(async () => {
  process.env.JWT_SECRET = "rl-test-secret-32-chars-long-for-test";
  // DATABASE_URL 由 tests/finance/worker-setup.ts 按 VITEST_POOL_ID 注入
  // per-worker 测试库（test-db-<poolId>.db），绝不写活体 chronos.db。

  const app = express();
  app.use(express.json());
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext: async (opts: any) => createContext(opts),
    })
  );

  await new Promise<void>(resolve => {
    server = app.listen(0, () => {
      url = `http://localhost:${(server.address() as any).port}`;
      resolve();
    });
  });
}, 15000);

afterAll(() => server?.close());

async function login(email: string, password: string) {
  return fetch(`${url}/api/trpc/auth.login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then(r => r.json());
}

describe("auth 限流", { timeout: 30000 }, () => {
  const email = `rl-${Date.now()}@rk.dev`;

  it("连续错误密码不锁账户（900次阈值内）", async () => {
    for (let i = 0; i < 10; i++) {
      const r = await login(email, "wrong");
      expect(!!r.error).toBe(true);
      // 不应被限流（远低于900阈值）
      expect(r.error?.message || "").not.toContain("过于频繁");
    }
  });
});
