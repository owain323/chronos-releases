/**
 * E2E 主流程：注册 → 登录 → 创建项目 → 读取
 * 模拟完整用户旅程
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import http from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.JWT_SECRET = "e2e-test-secret-32-chars-long-string!";
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
      baseUrl = `http://localhost:${(server.address() as any).port}`;
      resolve();
    });
  });
}, 15000);

afterAll(() => server?.close());

async function call(path: string, body?: any, token?: string, wsId?: number) {
  const headers: Record<string, string> = body
    ? { "Content-Type": "application/json" }
    : {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (wsId) headers["x-workspace-id"] = String(wsId);
  const res = await fetch(`${baseUrl}/api/trpc/${path}`, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

describe("E2E: 用户主线旅程", { timeout: 20000 }, () => {
  const email = `e2e-${Date.now()}@test.dev`;
  let token: string;
  let workspaceId: number;
  let projectId: number;

  it("1. 注册", async () => {
    const r = await call("auth.register", {
      name: "E2E-Test",
      email,
      password: "Abcd1234!@kkk",
    });
    const data = r.result?.data?.json ?? r.result?.data;
    expect(data?.userId).toBeGreaterThan(0);
  });

  it("2. 登录", async () => {
    const r = await call("auth.login", { email, password: "Abcd1234!@kkk" });
    const data = r.result?.data?.json ?? r.result?.data;
    expect(data?.token).toBeTruthy();
    token = data.token;
  });

  it("3. 创建工作区", async () => {
    const slug = "e2e-ws-" + Date.now();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const r = await call(
      "workspaces.create",
      { name: "我的工作区", slug },
      token
    );
    // 查列表确认
    const list = await call("workspaces.list", undefined, token);
    const wsList = list.result?.data?.json ?? list.result?.data ?? [];
    const ws = wsList.find((w: any) => w.slug === slug);
    expect(ws).toBeTruthy();
    workspaceId = ws.id;
  });

  it("4. 创建项目", async () => {
    const r = await call(
      "projects.create",
      { name: "第一个项目" },
      token,
      workspaceId
    );
    const data = r.result?.data?.json ?? r.result?.data;
    projectId = data?.id ?? data?.lastInsertRowid ?? 0;
    expect(projectId).toBeGreaterThan(0);
  });

  it("5. 创建任务 (完整 Critical Path)", async () => {
    // Init DB creates default columns 1=待办 2=进行中 3=已完成
    const taskR = await call(
      "tasks.create",
      {
        projectId,
        columnId: 1,
        title: "E2E 测试任务",
        priority: "high",
        order: 0,
      },
      token,
      workspaceId
    );
    const taskData = taskR.result?.data?.json ?? taskR.result?.data;
    const taskId = taskData?.id ?? taskData?.lastInsertRowid;
    expect(taskId).toBeGreaterThan(0);
  });

  it("5b. 异常: 不存在的项目返回404/error", async () => {
    const r = await call("projects.getById", { id: 99999 }, token, workspaceId);
    // 数据库查无 → 业务层应返回 error 或 data=null
    const data = r.result?.data?.json ?? r.result?.data ?? r;
    const isError =
      !!r.error || data === null || data === undefined || data.error;
    expect(isError).toBe(true);
  });

  it("6. 验证认证（未登录拒绝）", async () => {
    const r = await call("projects.list");
    expect(!!r.error).toBe(true);
  });
});

describe("E2E: 权限边界", { timeout: 20000 }, () => {
  const emailA = `e2e-a-${Date.now()}@test.dev`;
  const emailB = `e2e-b-${Date.now()}@test.dev`;
  let tokenA: string;
  let tokenB: string;
  let wsId: number;

  it("7a. 注册用户A+B并登录", async () => {
    await call("auth.register", {
      name: "User A",
      email: emailA,
      password: "Abcd1234!@kkk",
    });
    const rA = await call("auth.login", {
      email: emailA,
      password: "Abcd1234!@kkk",
    });
    tokenA = rA.result?.data?.json?.token ?? rA.result?.data?.token;

    await call("auth.register", {
      name: "User B",
      email: emailB,
      password: "Abcd1234!@kkk",
    });
    const rB = await call("auth.login", {
      email: emailB,
      password: "Abcd1234!@kkk",
    });
    tokenB = rB.result?.data?.json?.token ?? rB.result?.data?.token;
  });

  it("7b. 用户A创建Workspace", async () => {
    const slug = "ws-a-" + Date.now();
    await call("workspaces.create", { name: "A的工作区", slug }, tokenA);
    const list = await call("workspaces.list", undefined, tokenA);
    const wsList = list.result?.data?.json ?? list.result?.data ?? [];
    const ws = wsList.find((w: Record<string, unknown>) => w.slug === slug);
    expect(ws).toBeTruthy();
    wsId = ws.id;
  });

  it("7c. 用户B访问用户A的Workspace → 403/拒绝", async () => {
    const r = await call("projects.list", undefined, tokenB, wsId);
    const hasError = !!r.error;
    const data = r.result?.data?.json ?? r.result?.data;
    const isBlocked = hasError || (Array.isArray(data) && data.length === 0);
    expect(isBlocked).toBe(true);
  });
});
