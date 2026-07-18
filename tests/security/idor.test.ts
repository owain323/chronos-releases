/**
 * 安全测试 — IDOR 越权访问（in-process 版）
 *
 * 重写说明（P0 修复）：
 * - 旧版依赖 TEST_URL/TEST_PASSWORD 环境变量，默认 describe({skip:true}) 全跳过，
 *   且 TEST_PASSWORD 默认空串，即使注入 TEST_URL 也必登录失败 —— CI 零覆盖。
 * - 本版采用 server/routers/workspace.test.ts:92-166 的 in-process 范本：
 *   express + tRPC middleware + app.listen(0) 随机端口，双用户双 workspace 真实走 HTTP，
 *   默认 `npx vitest run` 下真实执行，无任何条件 skip、无任何 TEST_* 环境变量依赖。
 * - 未使用 server/_core/index.ts 的 createApp()：其全局限流（100 req/min/IP）会让
 *   全量套件在 CI 反复运行时因 127.0.0.1 共享计数而抖动；被测的认证/IDOR 逻辑全部位于
 *   tRPC router + createContext + project-guard，与 createApp 挂载的是同一份。
 *
 * 数据隔离：所有测试数据带 sectest- 前缀，beforeAll/afterAll 双向清理。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import http from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../../server/routers";
import { createContext } from "../../server/_core/context";

// ──── in-process HTTP server ────
let server: http.Server;
let url: string;

// ──── 测试数据（sectest- 前缀，便于清理与识别）────
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const PASSWORD = "SecTest123!ab"; // ≥12 位，含大小写+数字
const EMAIL_A = `sectest-${RUN}-a@t.dev`;
const EMAIL_B = `sectest-${RUN}-b@t.dev`;
const PROJECT_NAME = `sectest-机密项目A-${RUN}`;
const TASK_TITLE = `sectest-机密任务A-${RUN}`;
const FILE_NAME = `sectest-机密文件A-${RUN}.pdf`;

let tokenA: string, tokenB: string;
let uidA: number, uidB: number;
let wsAId: number, wsBId: number;
let projectAId: number, taskAId: number, fileAId: number;

// ──── HTTP helpers ────
type ApiResult = { status: number; body: any };

function buildHeaders(token?: string, wsId?: number): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (wsId) headers["x-workspace-id"] = String(wsId);
  return headers;
}

async function apiGet(
  path: string,
  token?: string,
  wsId?: number
): Promise<ApiResult> {
  const res = await fetch(`${url}/api/trpc/${path}`, {
    headers: buildHeaders(token, wsId),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function apiPost(
  path: string,
  payload: unknown,
  token?: string,
  wsId?: number
): Promise<ApiResult> {
  const res = await fetch(`${url}/api/trpc/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildHeaders(token, wsId),
    },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** 兼容 tRPC 有无 superjson transformer 的两种响应形态 */
const dataOf = (body: any) => body?.result?.data?.json ?? body?.result?.data;

// ──── 断言 helpers ────
/** 越权拒绝的核心安全语义：非 200 + 有 error + 不泄露任何数据 */
function expectDenied(r: ApiResult, what: string) {
  expect(r.status, `${what}：不得返回 200`).toBeGreaterThanOrEqual(400);
  expect(r.body?.error, `${what}：必须返回 error`).toBeTruthy();
  expect(dataOf(r.body), `${what}：不得泄露数据`).toBeUndefined();
}

/** project-guard 守卫路由的拒绝应是 403（无权）或 404（不存在），二者均为正确拒绝 */
function expectGuardDenied(r: ApiResult, what: string) {
  expect([403, 404], `${what}：应为 403/404`).toContain(r.status);
  expectDenied(r, what);
}

// ──── 业务 helpers ────
async function registerAndLogin(email: string, name: string) {
  await apiPost("auth.register", { name, email, password: PASSWORD });
  const login = await apiPost("auth.login", { email, password: PASSWORD });
  const d = dataOf(login.body);
  expect(d?.token, `登录失败: ${email}`).toBeTruthy();
  return { token: d.token as string, userId: Number(d.user?.id) };
}

async function createWorkspace(
  token: string,
  name: string,
  slugPrefix: string
) {
  const slug = `${slugPrefix}-${RUN}`.slice(0, 64);
  const r = await apiPost("workspaces.create", { name, slug }, token);
  const created = dataOf(r.body);
  if (created?.id) return Number(created.id);
  // 兜底：从 list 里按 slug 找
  const list = await apiGet("workspaces.list", token);
  const wsList = dataOf(list.body) ?? [];
  return Number(wsList.find((w: any) => w.slug === slug)?.id);
}

async function switchWorkspace(token: string, wsId: number) {
  const r = await apiPost("workspaces.switch", { workspaceId: wsId }, token);
  return dataOf(r.body)?.token as string;
}

/** 清理 sectest-% 数据（best-effort，逐条 try） */
async function cleanupSecTestData() {
  const { sqlite } = await import("../../server/db/connection");
  const run = (sql: string) => {
    try {
      sqlite.exec(sql);
    } catch {
      /* best-effort */
    }
  };
  run(`DELETE FROM fileSnapshots WHERE fileName LIKE 'sectest-%'`);
  run(`DELETE FROM tasks WHERE title LIKE 'sectest-%'`);
  run(
    `DELETE FROM projectMembers WHERE projectId IN (SELECT id FROM projects WHERE name LIKE 'sectest-%')`
  );
  run(`DELETE FROM projects WHERE name LIKE 'sectest-%'`);
  run(
    `DELETE FROM workspace_members WHERE workspaceId IN (SELECT id FROM workspaces WHERE slug LIKE 'sectest-%')`
  );
  run(
    `DELETE FROM workspace_members WHERE userId IN (SELECT id FROM users WHERE email LIKE 'sectest-%')`
  );
  run(`DELETE FROM workspaces WHERE slug LIKE 'sectest-%'`);
  // 注册时自动创建的个人工作区（slug 为 ws-<uid>-<ts>，按 createdBy 清理）
  run(
    `DELETE FROM workspaces WHERE createdBy IN (SELECT id FROM users WHERE email LIKE 'sectest-%')`
  );
  run(`DELETE FROM users WHERE email LIKE 'sectest-%'`);
}

beforeAll(async () => {
  // 0. 预清理（上次异常退出的残留）
  try {
    await cleanupSecTestData();
  } catch {
    /* OK */
  }

  // 1. in-process server — listen(0) 随机端口
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
      url = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  // 2. 双用户真实注册登录
  ({ token: tokenA, userId: uidA } = await registerAndLogin(
    EMAIL_A,
    `sectest用户A${RUN}`
  ));
  ({ token: tokenB, userId: uidB } = await registerAndLogin(
    EMAIL_B,
    `sectest用户B${RUN}`
  ));

  // 3. 双 workspace —— userB 拥有自己的 wsB，但绝不是 wsA 的成员
  wsAId = await createWorkspace(tokenA, `sectest工作区A-${RUN}`, "sectest-a");
  wsBId = await createWorkspace(tokenB, `sectest工作区B-${RUN}`, "sectest-b");
  expect(wsAId).toBeGreaterThan(1);
  expect(wsBId).toBeGreaterThan(1);
  expect(wsBId).not.toBe(wsAId);
  // 防御性确认：userB 不在 wsA 里（即便历史脏数据也不能影响本测试语义）
  const { sqlite } = await import("../../server/db/connection");
  sqlite
    .prepare(
      "DELETE FROM workspace_members WHERE userId = ? AND workspaceId = ?"
    )
    .run(uidB, wsAId);

  // 4. userA 走真实 switch 链路切到 wsA，创建私有项目
  tokenA = await switchWorkspace(tokenA, wsAId);
  expect(tokenA).toBeTruthy();
  const pr = await apiPost(
    "projects.create",
    { name: PROJECT_NAME },
    tokenA,
    wsAId
  );
  const pdata = dataOf(pr.body);
  projectAId = Number(pdata?.id ?? pdata?.lastInsertRowid);
  expect(projectAId).toBeGreaterThan(0);
  const prow = sqlite
    .prepare("SELECT workspaceId, visibility FROM projects WHERE id = ?")
    .get(projectAId) as any;
  expect(prow?.workspaceId).toBe(wsAId);

  // 5. 项目内造任务与文件（直连 DB 插入，与范本一致；API 的 tasks.create 依赖 kanban column，
  //    files.create 另有参数顺序问题——见文件末尾遗留说明）
  const now = new Date().toISOString();
  const tr = sqlite
    .prepare(
      `INSERT INTO tasks (projectId, columnId, title, creatorId, priority, "order", createdAt, updatedAt)
       VALUES (?, 1, ?, ?, 'medium', 0, ?, ?)`
    )
    .run(projectAId, TASK_TITLE, uidA, now, now);
  taskAId = Number(tr.lastInsertRowid);
  const fr = sqlite
    .prepare(
      `INSERT INTO fileSnapshots (projectId, fileName, fileKey, fileUrl, uploadedBy, version, createdAt)
       VALUES (?, ?, ?, ?, ?, 1, ?)`
    )
    .run(
      projectAId,
      FILE_NAME,
      `sectest-key-${RUN}`,
      `/uploads/sectest-${RUN}.pdf`,
      uidA,
      now
    );
  fileAId = Number(fr.lastInsertRowid);
  expect(taskAId).toBeGreaterThan(0);
  expect(fileAId).toBeGreaterThan(0);
}, 30000);

afterAll(async () => {
  server?.close();
  try {
    await cleanupSecTestData();
  } catch {
    /* OK */
  }
});

describe("Security — IDOR 防护（in-process，默认真实执行）", () => {
  // ──── 正向控制：证明拒绝是"针对性越权拒绝"而非接口整体坏掉 ────
  it("正向: userA 可访问自己的项目详情", async () => {
    const r = await apiGet(
      "projects.getById?input=" +
        encodeURIComponent(JSON.stringify({ projectId: projectAId })),
      tokenA,
      wsAId
    );
    expect(r.status).toBe(200);
    expect(Number(dataOf(r.body)?.id)).toBe(projectAId);
  });

  it("正向: userA 可列出自己项目的任务", async () => {
    const r = await apiGet(
      "tasks.getByProject?input=" +
        encodeURIComponent(JSON.stringify({ projectId: projectAId })),
      tokenA,
      wsAId
    );
    expect(r.status).toBe(200);
    const list = dataOf(r.body) ?? [];
    expect(list.map((t: any) => Number(t.id))).toContain(taskAId);
  });

  it("正向: userA 可读取自己的任务详情与项目文件", async () => {
    const rt = await apiGet(
      "tasks.getById?input=" +
        encodeURIComponent(JSON.stringify({ taskId: taskAId })),
      tokenA,
      wsAId
    );
    expect(rt.status).toBe(200);
    expect(Number(dataOf(rt.body)?.id)).toBe(taskAId);

    const rf = await apiGet(
      "files.getByProject?input=" +
        encodeURIComponent(JSON.stringify({ projectId: projectAId })),
      tokenA,
      wsAId
    );
    expect(rf.status).toBe(200);
    const files = dataOf(rf.body) ?? [];
    expect(files.map((f: any) => Number(f.id))).toContain(fileAId);
  });

  // ──── IDOR：userB 持有 userA 的资源 ID（枚举/泄露得到），全部必须被拒 ────
  it("IDOR: userB 用 userA 的项目 ID 读项目详情 → 拒绝（保留原意图: 无权访问其他 workspace 的项目）", async () => {
    const r = await apiGet(
      "projects.getById?input=" +
        encodeURIComponent(JSON.stringify({ projectId: projectAId })),
      tokenB
    );
    expectGuardDenied(r, "userB 读 userA 项目");
  });

  it("IDOR: userB 用 userA 的项目 ID 列任务 → 拒绝", async () => {
    const r = await apiGet(
      "tasks.getByProject?input=" +
        encodeURIComponent(JSON.stringify({ projectId: projectAId })),
      tokenB
    );
    expectGuardDenied(r, "userB 列 userA 项目任务");
  });

  it("IDOR: userB 用 userA 的任务 ID 读任务详情 → 拒绝", async () => {
    const r = await apiGet(
      "tasks.getById?input=" +
        encodeURIComponent(JSON.stringify({ taskId: taskAId })),
      tokenB
    );
    expectGuardDenied(r, "userB 读 userA 任务");
  });

  it("IDOR: userB 用 userA 的任务 ID 改任务 → 拒绝且数据未被篡改", async () => {
    const r = await apiPost(
      "tasks.update",
      { taskId: taskAId, title: "sectest-被篡改标题" },
      tokenB
    );
    expectGuardDenied(r, "userB 改 userA 任务");
    const { sqlite } = await import("../../server/db/connection");
    const row = sqlite
      .prepare("SELECT title FROM tasks WHERE id = ?")
      .get(taskAId) as any;
    expect(row?.title, "任务标题不得被越权修改").toBe(TASK_TITLE);
  });

  it("IDOR: userB 用 userA 的项目 ID 改项目 → 拒绝且数据未被篡改", async () => {
    const r = await apiPost(
      "projects.update",
      { projectId: projectAId, name: "sectest-被改名项目" },
      tokenB
    );
    expectGuardDenied(r, "userB 改 userA 项目");
    const { sqlite } = await import("../../server/db/connection");
    const row = sqlite
      .prepare("SELECT name FROM projects WHERE id = ?")
      .get(projectAId) as any;
    expect(row?.name, "项目名不得被越权修改").toBe(PROJECT_NAME);
  });

  it("IDOR: userB 用 userA 的项目 ID 列文件 → 拒绝", async () => {
    const r = await apiGet(
      "files.getByProject?input=" +
        encodeURIComponent(JSON.stringify({ projectId: projectAId })),
      tokenB
    );
    expectGuardDenied(r, "userB 列 userA 项目文件");
  });

  it("IDOR: userB 用 userA 的文件 ID 改备注 → 拒绝且数据未被篡改", async () => {
    const r = await apiPost(
      "files.updateNotes",
      { id: fileAId, notes: "sectest-被篡改备注" },
      tokenB
    );
    expectGuardDenied(r, "userB 改 userA 文件备注");
    const { sqlite } = await import("../../server/db/connection");
    const row = sqlite
      .prepare("SELECT notes FROM fileSnapshots WHERE id = ?")
      .get(fileAId) as any;
    expect(row?.notes ?? null, "文件备注不得被越权修改").toBeNull();
  });

  it("IDOR: userB 用 userA 的文件 ID 删文件 → 拒绝且记录仍存在", async () => {
    const r = await apiPost("files.delete", { id: fileAId }, tokenB);
    expectGuardDenied(r, "userB 删 userA 文件");
    const { sqlite } = await import("../../server/db/connection");
    const row = sqlite
      .prepare("SELECT id FROM fileSnapshots WHERE id = ?")
      .get(fileAId) as any;
    expect(row?.id, "文件不得被越权删除").toBe(fileAId);
  });

  it("IDOR: 不存在的项目 ID 返回 404（保留原意图: 不应以 403 暴露存在性）", async () => {
    const r = await apiGet(
      "projects.getById?input=" +
        encodeURIComponent(JSON.stringify({ projectId: 99999999 })),
      tokenA,
      wsAId
    );
    // 当前实现: NOT_FOUND → 404。注意残留观察: 无权项目 403 / 不存在项目 404 构成
    // 存在性 oracle（可枚举哪些 ID 有项目），属低危信息泄露，留给后续统一为 404。
    expect(r.status).toBe(404);
    expect(r.body?.error).toBeTruthy();
    expect(dataOf(r.body)).toBeUndefined();
  });

  // ──── 未认证：无 token 访问受保护端点必须 401 ────
  it("未认证: 无 token 访问 projects.getById → 401", async () => {
    const r = await apiGet(
      "projects.getById?input=" +
        encodeURIComponent(JSON.stringify({ projectId: projectAId }))
    );
    expect(r.status).toBe(401);
    expectDenied(r, "无 token 读项目");
  });

  it("未认证: 无 token 访问 tasks.getByProject / files.getByProject → 401", async () => {
    const rt = await apiGet(
      "tasks.getByProject?input=" +
        encodeURIComponent(JSON.stringify({ projectId: projectAId }))
    );
    expect(rt.status).toBe(401);
    expectDenied(rt, "无 token 列任务");
    const rf = await apiGet(
      "files.getByProject?input=" +
        encodeURIComponent(JSON.stringify({ projectId: projectAId }))
    );
    expect(rf.status).toBe(401);
    expectDenied(rf, "无 token 列文件");
  });
});

/*
 * 遗留说明（不在本测试断言，供修复工人/审计跟进）：
 * 1. server/routers.ts files.create 中 `requireProjectAccess(pid, ctx.user!.id)` 参数顺序
 *    与函数签名 requireProjectAccess(userId, projectId) 相反，导致合法用户创建文件大概率
 *    被误拒（NOT_FOUND/FORBIDDEN）。本测试因此用 DB 直插构造文件夹具，未覆盖 files.create。
 * 2. 403/404 存在性 oracle：无权访问的项目返回 403、不存在返回 404，可被用于枚举项目 ID
 *    是否存在。建议统一对外返回 404。
 */
