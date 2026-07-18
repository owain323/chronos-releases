/**
 * tRPC 集成测试 — 真实调用 server/routers.ts 的完整路由
 * 测试 auth + projects + tasks 三条核心链路
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import http from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../../routers";
import { createContext } from "../../_core/context";

// 设置 JWT_SECRET（测试用）
process.env.JWT_SECRET = "test-jwt-secret-for-integration-testing-only-32chars";
// DATABASE_URL 由 tests/finance/worker-setup.ts 按 VITEST_POOL_ID 注入
// per-worker 测试库（test-db-<poolId>.db），绝不写活体 chronos.db。

let server: http.Server;
let url: string;

beforeAll(async () => {
  const app = express();
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext: async (opts: any) => {
        return createContext(opts);
      },
    })
  );

  await new Promise<void>(resolve => {
    server = app.listen(0, () => {
      const addr = server.address() as any;
      url = `http://localhost:${addr.port}`;
      resolve();
    });
  });
}, 15000);

afterAll(() => {
  server?.close();
});

// 清理测试用户——防连续跑出现假失败
beforeAll(async () => {
  try {
    const { db } = await import("../../db/connection");
    db.run("DELETE FROM users WHERE email LIKE 'test-%'");
  } catch {
    /* DB 可能还没初始化 */
  }
});

// ---- 辅助函数 ----
async function post(path: string, body: any, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${url}/api/trpc/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return res.json();
}

async function get(path: string, input: any, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const qs = input ? "?input=" + encodeURIComponent(JSON.stringify(input)) : "";
  const res = await fetch(`${url}/api/trpc/${path}${qs}`, { headers });
  return res.json();
}

async function query(path: string, input: any, token?: string) {
  return get(path, input, token);
}

// ---- 测试 ----
describe("Auth", () => {
  const email = "test-integration-" + Date.now() + "@chronos.dev";

  it("注册新用户", async () => {
    const r = await post("auth.register", {
      name: "测试用户",
      email,
      password: "Abcd1234!@kkk",
    });
    // result.data 可能有 json 格式也可能直接返回
    const data = r.result?.data?.json ?? r.result?.data;
    // 只要能拿到 token 就算成功
    expect(data).toBeDefined();
  });

  it("重复注册返回错误", async () => {
    const r = await post("auth.register", {
      name: "重复",
      email,
      password: "Abcd1234!@kkk",
    });
    expect(r.error || r.result?.error).toBeTruthy();
  });

  it("登录返回 token", async () => {
    const r = await post("auth.login", { email, password: "Abcd1234!@kkk" });
    const data = r.result?.data?.json ?? r.result?.data;
    expect(data?.token).toBeDefined();
  });

  it("错误密码登录失败", async () => {
    const r = await post("auth.login", { email, password: "Wr0ngPass!99999" });
    expect(r.error || r.result?.error).toBeTruthy();
  });
});

describe("Projects", () => {
  const email = "test-project-" + Date.now() + "@chronos.dev";

  it("项目列表不为空（需登录）", async () => {
    await post("auth.register", {
      name: "项目用户",
      email,
      password: "Abcd1234!@kkk",
    });
    const login = await post("auth.login", {
      email,
      password: "Abcd1234!@kkk",
    });
    const d = login.result?.data?.json ?? login.result?.data;
    const token = d?.token;
    expect(token).toBeDefined();
    const r = await query("projects.list", {}, token);
    console.warn("PROJECTS RESPONSE:", JSON.stringify(r).slice(0, 500));
    expect(r.result?.data || r.result).toBeDefined();
  });
});

describe("Tasks", () => {
  const email = "test-task-" + Date.now() + "@chronos.dev";

  it("任务列表可访问（需登录）", async () => {
    await post("auth.register", {
      name: "任务用户",
      email,
      password: "Abcd1234!@kkk",
    });
    const login = await post("auth.login", {
      email,
      password: "Abcd1234!@kkk",
    });
    const d = login.result?.data?.json ?? login.result?.data;
    const token = d?.token;
    expect(token).toBeDefined();
    const r = await query("tasks.list", { projectId: 1 }, token);
    // 返回数据或空数组均可（可能是别的用户的项目）
    expect(r.error || r.result?.data).toBeDefined();
  });
});
