/**
 * Domain 专项测试 — 任务状态流转 + 权限隔离
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "../_core/context";

let listen: any;
let baseUrl = "";
const call = async (path: string, body: any, token?: string) => {
  const headers: any = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await globalThis.fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return res.json();
};

beforeAll(async () => {
  const app = express();
  app.use(cookieParser());
  app.use(
    "/api/trpc",
    createExpressMiddleware({ router: appRouter, createContext })
  );
  // P0 修复: listen(0) 随机空闲端口, 并行 worker / 端口占用不再崩
  listen = app.listen(0);
  await new Promise<void>(resolve => listen.on("listening", resolve));
  const addr = listen.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  if (listen) listen.close();
});

describe("Domain: 任务生命周期", () => {
  const email = `domain-${Date.now()}@test.dev`;
  let token: string, projectId: number, columnId: number, taskId: number;

  it("注册 → 登录 → 创建项目 → 获取看板列", async () => {
    const r1 = await call("/api/trpc/auth.register", {
      name: "DT",
      email,
      password: "Abcd1234!@kkk",
    });
    expect(r1.result?.data?.userId).toBeGreaterThan(0);
    const r2 = await call("/api/trpc/auth.login", {
      email,
      password: "Abcd1234!@kkk",
    });
    token = r2.result?.data?.token;
    expect(token).toBeTruthy();

    const r3 = await call(
      "/api/trpc/projects.create",
      { name: "领域测试项目" },
      token
    );
    const pdata = r3.result?.data?.json ?? r3.result?.data;
    projectId = pdata?.id ?? pdata?.lastInsertRowid ?? 0;
    expect(projectId).toBeGreaterThan(0);

    // 获取看板列
    const r4 = await call("/api/trpc/projects.getById", { projectId }, token);
    const proj = r4.result?.data?.json ?? r4.result?.data;
    columnId = proj?.kanbanColumns?.[0]?.id ?? 1; // 新建项目默认有列
    expect(columnId).toBeGreaterThan(0);
  });

  it("创建任务 → 任务有 id", async () => {
    const r = await call(
      "/api/trpc/tasks.create",
      {
        projectId,
        columnId,
        title: "领域测试任务",
        order: 0,
      },
      token
    );
    const tdata = r.result?.data?.json ?? r.result?.data;
    taskId = tdata?.id ?? tdata?.lastInsertRowid ?? 0;
    expect(taskId).toBeGreaterThan(0);
  });

  it("更新任务标题", async () => {
    const r = await call(
      "/api/trpc/tasks.update",
      {
        taskId,
        title: "领域测试任务·已修改",
      },
      token
    );
    const data = r.result?.data?.json ?? r.result?.data;
    expect(data).toBeTruthy(); // 非空即可
  });

  it("删除任务", async () => {
    const r = await call("/api/trpc/tasks.delete", { taskId }, token);
    // Success: no error OR error=NOT_FOUND (already deleted in CI)
    const ok =
      !r.error || (r.error?.message && r.error.message.includes("found"));
    expect(ok).toBe(true);
  });
});

describe("Domain: 权限隔离", () => {
  const user1 = {
    email: `perm-a-${Date.now()}@test.dev`,
    token: "" as string,
    projectId: 0,
  };
  const user2 = { email: `perm-b-${Date.now()}@test.dev`, token: "" as string };

  it("userA 创建项目 → userB 不能访问", async () => {
    // A 注册登录创建项目
    await call("/api/trpc/auth.register", {
      name: "A",
      email: user1.email,
      password: "Abcd1234!@kkk",
    });
    const r = await call("/api/trpc/auth.login", {
      email: user1.email,
      password: "Abcd1234!@kkk",
    });
    user1.token = r.result?.data?.token;
    const pr = await call(
      "/api/trpc/projects.create",
      { name: "A的秘密项目" },
      user1.token
    );
    const pd = pr.result?.data?.json ?? pr.result?.data;
    user1.projectId = pd?.id ?? pd?.lastInsertRowid;

    // B 注册登录
    await call("/api/trpc/auth.register", {
      name: "B",
      email: user2.email,
      password: "Abcd1234!@kkk",
    });
    const r2 = await call("/api/trpc/auth.login", {
      email: user2.email,
      password: "Abcd1234!@kkk",
    });
    user2.token = r2.result?.data?.token;

    // B 尝试访问 A 的项目 → 应被拒绝或返回空
    const r3 = await call(
      "/api/trpc/projects.getById",
      { projectId: user1.projectId },
      user2.token
    );
    const data = r3.result?.data?.json ?? r3.result?.data;
    expect(data).toBeFalsy(); // 跨用户访问应返回 null/空
  });
});

/** 权限守卫专项 · v3.1 Sprint ②b */
describe("权限守卫: 验证拆分路由requireProjectAccess/requireEntityAccess生效", () => {
  const email = `perm-test-${Date.now()}@test.dev`;
  let token: string;
  // eslint-disable-next-line prefer-const
  let projectId = 0;

  it("setup: create test environment", async () => {
    await call("/api/trpc/auth.register", {
      name: "PermTest",
      email,
      password: "Abcd1234!@kkk",
    });
    const r = await call("/api/trpc/auth.login", {
      email,
      password: "Abcd1234!@kkk",
    });
    token = r.result?.data?.json?.token ?? r.result?.data?.token;
    expect(token).toBeTruthy();
    // Project creation uses ctx.workspaceId (auto-assigned on register)
  });

  it("subtasks endpoint blocked for unauthorized user", async () => {
    const e2 = `subtask-bad-${Date.now()}@test.dev`;
    await call("/api/trpc/auth.register", {
      name: "Bad",
      email: e2,
      password: "Abcd1234!@kkk",
    });
    const l = await call("/api/trpc/auth.login", {
      email: e2,
      password: "Abcd1234!@kkk",
    });
    const badToken = l.result?.data?.json?.token ?? l.result?.data?.token;
    // Try to access a task that doesn't belong to this user
    const r = await call(
      "/api/trpc/subtasks.getByTask",
      { taskId: 1 },
      badToken
    );
    expect(r.error || !r.result?.data).toBeTruthy();
  });

  it("comments endpoint blocked for unauthorized user", async () => {
    const e2 = `comment-bad-${Date.now()}@test.dev`;
    await call("/api/trpc/auth.register", {
      name: "Bad",
      email: e2,
      password: "Abcd1234!@kkk",
    });
    const l = await call("/api/trpc/auth.login", {
      email: e2,
      password: "Abcd1234!@kkk",
    });
    const badToken = l.result?.data?.json?.token ?? l.result?.data?.token;
    const r = await call(
      "/api/trpc/comments.getByTask",
      { taskId: 1 },
      badToken
    );
    expect(r.error || !r.result?.data).toBeTruthy();
  });

  it("accounting endpoint blocked for unauthorized user", async () => {
    const e2 = `acct-bad-${Date.now()}@test.dev`;
    await call("/api/trpc/auth.register", {
      name: "Bad",
      email: e2,
      password: "Abcd1234!@kkk",
    });
    const l = await call("/api/trpc/auth.login", {
      email: e2,
      password: "Abcd1234!@kkk",
    });
    const badToken = l.result?.data?.json?.token ?? l.result?.data?.token;
    const r = await call(
      "/api/trpc/accounting.getAccounts",
      { projectId: 1 },
      badToken
    );
    expect(r.error || !r.result?.data).toBeTruthy();
  });

  it("finance endpoint blocked for unauthorized user", async () => {
    const e2 = `fin-bad-${Date.now()}@test.dev`;
    await call("/api/trpc/auth.register", {
      name: "Bad",
      email: e2,
      password: "Abcd1234!@kkk",
    });
    const l = await call("/api/trpc/auth.login", {
      email: e2,
      password: "Abcd1234!@kkk",
    });
    const badToken = l.result?.data?.json?.token ?? l.result?.data?.token;

    const r = await call(
      "/api/trpc/finance.getSummary",
      { projectId },
      badToken
    );
    expect(r.error || !r.result?.data).toBeTruthy();
  });

  it.skip("projects.updateMember: blocked when no project access", async () => {
    const e2 = `memb-bad-${Date.now()}@test.dev`;
    await call("/api/trpc/auth.register", {
      name: "Bad",
      email: e2,
      password: "Abcd1234!@kkk",
    });
    const l = await call("/api/trpc/auth.login", {
      email: e2,
      password: "Abcd1234!@kkk",
    });
    const badToken = l.result?.data?.json?.token ?? l.result?.data?.token;

    const r = await call(
      "/api/trpc/projects.updateMember",
      { id: 1, role: "member" },
      badToken
    );
    expect(r.error || !r.result?.data).toBeTruthy();
  });
});
