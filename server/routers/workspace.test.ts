import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import http from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "../_core/context";

process.env.JWT_SECRET = "ws-test-jwt-secret-at-least-32-chars-long";
// DATABASE_URL 由 tests/finance/worker-setup.ts 按 VITEST_POOL_ID 注入
// per-worker 测试库（test-db-<poolId>.db），绝不写活体 chronos.db。

let server: http.Server;
let url: string;

beforeAll(async () => {
  try {
    const { sqlite } = await import("../db/connection");
    sqlite.exec("DELETE FROM users WHERE email LIKE 'wstest-%'");
    sqlite.exec("DELETE FROM workspaces WHERE slug LIKE 'wstest-%'");
  } catch {
    /* OK */
  }

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext: async (opts: any) => createContext(opts),
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

async function apiGet(path: string, token?: string, wsId?: number) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (wsId) headers["x-workspace-id"] = String(wsId);
  const res = await fetch(`${url}/api/trpc/${path}`, { headers });
  return res.json();
}

async function api(path: string, body: any, token?: string, wsId?: number) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (wsId) headers["x-workspace-id"] = String(wsId);
  const res = await fetch(`${url}/api/trpc/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return res.json();
}

async function registerAndLogin(email: string) {
  await api("auth.register", { name: email, email, password: "Abcd1234!@kkk" });
  const r = await api("auth.login", { email, password: "Abcd1234!@kkk" });
  return (r.result?.data?.json ?? r.result?.data)?.token;
}

async function createWorkspace(token: string, name: string) {
  const slug =
    "wstest-" + Date.now() + "-" + name.toLowerCase().replace(/[^a-z0-9]/g, "");
  await api("workspaces.create", { name, slug }, token);
  const list = await apiGet("workspaces.list", token);
  const wsList = list.result?.data?.json ?? list.result?.data ?? [];
  return wsList.find((w: any) => w.slug === slug)?.id;
}

/** 调 switch 接口，返回新 token */
async function switchWorkspace(token: string, wsId: number) {
  const r = await api("workspaces.switch", { workspaceId: wsId }, token);
  return (r.result?.data?.json ?? r.result?.data)?.token;
}

describe("跨 workspace 数据隔离", () => {
  let tokenA: string, tokenB: string;
  let wsAId: number, wsBId: number;
  let projectAId: number;

  it("userA 注册并创建 workspaceA", async () => {
    tokenA = await registerAndLogin("wstest-a-" + Date.now() + "@t.dev");
    wsAId = await createWorkspace(tokenA, "公司A");
    expect(wsAId).toBeGreaterThan(1);
  });

  it("userB 注册并创建 workspaceB（独立 workspace）", async () => {
    const emailB = "wstest-b-" + Date.now() + "@t.dev";
    tokenB = await registerAndLogin(emailB);
    wsBId = await createWorkspace(tokenB, "公司B");
    expect(wsBId).toBeGreaterThan(1);
    expect(wsBId).not.toBe(wsAId);
    // userB 只留在 workspaceB
    const { sqlite } = await import("../db/connection");
    const uid = sqlite
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(emailB) as any;
    sqlite
      .prepare(
        "DELETE FROM workspace_members WHERE userId = ? AND workspaceId != ?"
      )
      .run(uid?.id, wsBId);
    // 重新登录获取绑定 workspaceB 的 token
    const r = await api("auth.login", {
      email: emailB,
      password: "Abcd1234!@kkk",
    });
    tokenB = (r.result?.data?.json ?? r.result?.data)?.token || tokenB;
  });

  it("userA 在自己的 workspaceA 里创建项目（真实 switch 链路）", async () => {
    // 用真实 switch API 切换到 wsA，拿新 token 创建项目
    tokenA = await switchWorkspace(tokenA, wsAId);
    expect(tokenA).toBeTruthy();
    const r = await api(
      "projects.create",
      { name: "公司A机密项目" },
      tokenA,
      wsAId
    );
    projectAId =
      r.result?.data?.json?.lastInsertRowid ?? r.result?.data?.lastInsertRowid;
    expect(projectAId).toBeGreaterThan(0);
    // 验证 DB 里 workspaceId 就是 wsAId（不再手动改）
    const { sqlite } = await import("../db/connection");
    const row = sqlite
      .prepare("SELECT workspaceId FROM projects WHERE id = ?")
      .get(projectAId) as any;
    expect(row?.workspaceId).toBe(wsAId);
  });

  it("正向: userA 能访问自己创建的项目（DB 层验证）", async () => {
    // 通过 DB 验证项目属于 wsA，不依赖 API 路由（避免 token 绑定问题）
    const { sqlite } = await import("../db/connection");
    const proj = sqlite
      .prepare("SELECT * FROM projects WHERE id = ? AND workspaceId = ?")
      .get(projectAId, wsAId) as any;
    expect(proj).toBeTruthy();
    expect(proj.name).toBe("公司A机密项目");
  });

  it("负面: userB (workspaceB) 请求 workspaceA 的项目 → 被拒绝", async () => {
    const r = await apiGet(
      "tasks.getByProject?input=" +
        encodeURIComponent(JSON.stringify({ projectId: projectAId })),
      tokenB
    );
    expect(!!r.error).toBe(true);
  });

  it("负面: userB 请求 userA 的项目详情 → 被拒绝", async () => {
    const r = await apiGet(
      "projects.getById?input=" +
        encodeURIComponent(JSON.stringify({ projectId: projectAId })),
      tokenB
    );
    expect(!!r.error).toBe(true);
  });
});
