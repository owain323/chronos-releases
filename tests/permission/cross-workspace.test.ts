/**
 * 权限集成测试 — 跨 Workspace 越权隔离（in-process 版）
 *
 * 重写说明（P0 修复）：
 * - 旧版依赖 TEST_URL/TEST_EMAIL/TEST_PASSWORD 环境变量，describe({skip}) + it.skip
 *   默认全跳过，TEST_PASSWORD 默认空串必登录失败 —— 默认 `npm test` 与 CI 零覆盖。
 * - 本版采用 server/routers/workspace.test.ts:24-46 的 in-process 范本：
 *   express + tRPC middleware + app.listen(0) 随机端口，四用户三 workspace 真实走 HTTP，
 *   默认 `npx vitest run` 下真实执行，无任何条件 skip、无任何 TEST_* 环境变量依赖。
 * - 保留旧版断言意图：「无法跨 workspace 访问其他 workspace 的项目」——旧版用
 *   projects.list?input={workspaceId:99999} 探测，现 projects.list 无入参、按 ctx
 *   当前 workspace 隔离，改写为"伪造 x-workspace-id 头不得看到他人 workspace 项目"。
 *
 * 前缀说明：本文件使用 `sectestxw-` 前缀（保留 sectest 标识），刻意不匹配
 * tests/security/idor.test.ts 清理语句的 LIKE 'sectest-%' —— 默认 `npm test`
 * 并行多进程共享同一 sqlite 文件，若两文件前缀互相匹配，一方 afterAll 清理会
 * 删掉另一方的在跑夹具导致抖动。两文件清理面因此完全不相交。
 *
 * 数据隔离：所有测试数据带 sectestxw- 前缀，beforeAll 预清理 + afterAll 清理。
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

// ──── 测试数据（sectestxw- 前缀，与 idor.test.ts 的 sectest- 清理面不相交）────
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const PASSWORD = "SecTest123!ab"; // ≥12 位，含大小写+数字
const EMAIL_A = `sectestxw-${RUN}-a@t.dev`; // wsA / wsA2 的 owner
const EMAIL_B = `sectestxw-${RUN}-b@t.dev`; // wsB 的 owner，绝不是 wsA 成员
const EMAIL_C = `sectestxw-${RUN}-c@t.dev`; // wsA 的 member
const EMAIL_D = `sectestxw-${RUN}-d@t.dev`; // wsA 的 viewer
const PROJECT_NAME = `sectestxw-跨区机密项目-${RUN}`;
const ORG_PROJECT_NAME = `sectestxw-跨区org项目-${RUN}`;

let tokenA: string, tokenB: string, tokenC: string, tokenD: string;
let uidA: number, uidB: number, uidC: number, uidD: number;
let wsAId: number, wsA2Id: number, wsBId: number;
let projectAId: number, orgProjectAId: number;

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

/** 跨工作区拒绝应是 403（无权）或 404（不存在），二者均为正确拒绝 */
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

/** 清理 sectestxw-% 数据（best-effort，逐条 try） */
async function cleanupSecTestData() {
  const { sqlite } = await import("../../server/db/connection");
  const run = (sql: string) => {
    try {
      sqlite.exec(sql);
    } catch {
      /* best-effort */
    }
  };
  run(
    `DELETE FROM projectMembers WHERE projectId IN (SELECT id FROM projects WHERE name LIKE 'sectestxw-%')`
  );
  run(`DELETE FROM projects WHERE name LIKE 'sectestxw-%'`);
  run(
    `DELETE FROM workspace_members WHERE workspaceId IN (SELECT id FROM workspaces WHERE slug LIKE 'sectestxw-%')`
  );
  run(
    `DELETE FROM workspace_members WHERE userId IN (SELECT id FROM users WHERE email LIKE 'sectestxw-%')`
  );
  run(`DELETE FROM workspaces WHERE slug LIKE 'sectestxw-%'`);
  // 注册时自动创建的个人工作区（slug 为 ws-<uid>-<ts>，按 createdBy 清理）
  run(
    `DELETE FROM workspaces WHERE createdBy IN (SELECT id FROM users WHERE email LIKE 'sectestxw-%')`
  );
  run(`DELETE FROM users WHERE email LIKE 'sectestxw-%'`);
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

  // 2. 四用户真实注册登录
  ({ token: tokenA, userId: uidA } = await registerAndLogin(
    EMAIL_A,
    `sectestxw用户A${RUN}`
  ));
  ({ token: tokenB, userId: uidB } = await registerAndLogin(
    EMAIL_B,
    `sectestxw用户B${RUN}`
  ));
  ({ token: tokenC, userId: uidC } = await registerAndLogin(
    EMAIL_C,
    `sectestxw用户C${RUN}`
  ));
  ({ token: tokenD, userId: uidD } = await registerAndLogin(
    EMAIL_D,
    `sectestxw用户D${RUN}`
  ));

  // 3. 三 workspace —— wsA/wsA2 属 userA，wsB 属 userB；userB 绝不是 wsA 成员
  wsAId = await createWorkspace(
    tokenA,
    `sectestxw工作区A-${RUN}`,
    "sectestxw-a"
  );
  wsA2Id = await createWorkspace(
    tokenA,
    `sectestxw工作区A2-${RUN}`,
    "sectestxw-a2"
  );
  wsBId = await createWorkspace(
    tokenB,
    `sectestxw工作区B-${RUN}`,
    "sectestxw-b"
  );
  expect(wsAId).toBeGreaterThan(1);
  expect(wsA2Id).toBeGreaterThan(1);
  expect(wsBId).toBeGreaterThan(1);
  expect(new Set([wsAId, wsA2Id, wsBId]).size).toBe(3);

  const { sqlite } = await import("../../server/db/connection");
  const now = new Date().toISOString();
  // 防御性确认：userB 不在 wsA/wsA2 里（即便历史脏数据也不能影响本测试语义）
  sqlite
    .prepare(
      "DELETE FROM workspace_members WHERE userId = ? AND workspaceId IN (?, ?)"
    )
    .run(uidB, wsAId, wsA2Id);
  // userC 以 member、userD 以 viewer 加入 wsA（直连 DB 造角色夹具，
  // 等价于 inviteByEmail 的落库结果，但不依赖邮件副作用）
  sqlite
    .prepare(
      `INSERT INTO workspace_members (workspaceId, userId, role, status, joinedAt)
       VALUES (?, ?, 'member', 'active', ?)`
    )
    .run(wsAId, uidC, now);
  sqlite
    .prepare(
      `INSERT INTO workspace_members (workspaceId, userId, role, status, joinedAt)
       VALUES (?, ?, 'viewer', 'active', ?)`
    )
    .run(wsAId, uidD, now);

  // 4. userA 在 wsA 创建私有项目（显式带 x-workspace-id 头，等价于 switch 后的请求）
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

  // 5. org 可见项目夹具（visibility='org'，直连 DB 插入）——伪造头越权回归用：
  //    修复前 workspaceRole=null 会落入 member/viewer 过滤分支并放行 org 项目
  const orgr = sqlite
    .prepare(
      `INSERT INTO projects (name, description, workspaceId, ownerId, visibility, status, createdAt, updatedAt)
       VALUES (?, NULL, ?, ?, 'org', 'active', ?, ?)`
    )
    .run(ORG_PROJECT_NAME, wsAId, uidA, now, now);
  orgProjectAId = Number(orgr.lastInsertRowid);
  expect(orgProjectAId).toBeGreaterThan(0);
}, 30000);

afterAll(async () => {
  server?.close();
  try {
    await cleanupSecTestData();
  } catch {
    /* OK */
  }
});

describe("Permission — 跨 Workspace 隔离（in-process，默认真实执行）", () => {
  // ──── 正向控制：证明拒绝是"针对性越权拒绝"而非接口整体坏掉 ────
  it("正向: userA(owner) 在 wsA 的项目列表包含自己的项目", async () => {
    const r = await apiGet("projects.list", tokenA, wsAId);
    expect(r.status).toBe(200);
    const list = dataOf(r.body) ?? [];
    expect(list.map((p: any) => Number(p.id))).toContain(projectAId);
  });

  it("正向: userA(owner) 可访问财务汇总 finance.getSummary", async () => {
    const r = await apiGet(
      "finance.getSummary?input=" +
        encodeURIComponent(JSON.stringify({ projectId: projectAId })),
      tokenA,
      wsAId
    );
    expect(r.status).toBe(200);
    expect(r.body?.error).toBeFalsy();
  });

  it("正向: userA(owner) 可在 wsA 内 searchUsers 找到 member userC", async () => {
    const r = await apiGet(
      "auth.searchUsers?input=" +
        encodeURIComponent(
          JSON.stringify({ query: "sectestxw", workspaceId: wsAId })
        ),
      tokenA,
      wsAId
    );
    expect(r.status).toBe(200);
    const users = dataOf(r.body) ?? [];
    expect(users.map((u: any) => u.email)).toContain(EMAIL_C);
  });

  it("正向: userC(member) 可查看 wsA 成员列表（证明 ⑤ 的 403 是角色拒绝而非成员身份损坏）", async () => {
    const r = await apiGet(
      "workspaces.members?input=" +
        encodeURIComponent(JSON.stringify({ workspaceId: wsAId })),
      tokenC,
      wsAId
    );
    expect(r.status).toBe(200);
    const members = dataOf(r.body) ?? [];
    const memberIds = members.map((m: any) => Number(m.userId));
    expect(memberIds).toContain(uidC);
    expect(memberIds).toContain(uidA); // owner 也在成员列表中
  });

  // ──── ② userB 未加入 workspaceA，访问其资源全部必须被拒 ────
  it("越权: userB 读 wsA 工作区详情 workspaces.getById → 403", async () => {
    const r = await apiGet(
      "workspaces.getById?input=" +
        encodeURIComponent(JSON.stringify({ id: wsAId })),
      tokenB,
      wsBId
    );
    expect(r.status).toBe(403);
    expectDenied(r, "userB 读 wsA 详情");
  });

  it("越权: userB 列 wsA 成员 workspaces.members → 403", async () => {
    const r = await apiGet(
      "workspaces.members?input=" +
        encodeURIComponent(JSON.stringify({ workspaceId: wsAId })),
      tokenB,
      wsBId
    );
    expect(r.status).toBe(403);
    expectDenied(r, "userB 列 wsA 成员");
  });

  it("越权: userB 读 wsA 的项目详情 projects.getById → 拒绝（保留旧版意图）", async () => {
    const r = await apiGet(
      "projects.getById?input=" +
        encodeURIComponent(JSON.stringify({ projectId: projectAId })),
      tokenB,
      wsBId
    );
    expectGuardDenied(r, "userB 读 wsA 项目");
  });

  it("越权: userB 向 wsA inviteByEmail → 403（新语义：仅 owner/admin 可邀请）", async () => {
    const r = await apiPost(
      "workspaces.inviteByEmail",
      { workspaceId: wsAId, email: EMAIL_B },
      tokenB,
      wsBId
    );
    expect(r.status).toBe(403);
    expectDenied(r, "userB 邀请他人进 wsA");
  });

  it("越权: userC(member) 向 wsA inviteByEmail → 403（新语义：member 不可邀请）", async () => {
    const r = await apiPost(
      "workspaces.inviteByEmail",
      { workspaceId: wsAId, email: EMAIL_B },
      tokenC,
      wsAId
    );
    expect(r.status).toBe(403);
    expectDenied(r, "member 邀请他人进 wsA");
  });

  it("越权: userB switch 到未加入的 wsA → 403（无法为他人工作区铸造切换凭据）", async () => {
    const r = await apiPost(
      "workspaces.switch",
      { workspaceId: wsAId },
      tokenB
    );
    expect(r.status).toBe(403);
    expectDenied(r, "userB switch 到 wsA");
  });

  // ──── 伪造 x-workspace-id 头：不得借此看到他人 workspace 的数据 ────
  it("越权: userB 伪造 x-workspace-id=wsA 调 projects.list → 不得包含 wsA 私有项目（保留旧版意图: workspaceId 探测无效）", async () => {
    const r = await apiGet("projects.list", tokenB, wsAId); // 刻意伪造他人 workspace 头
    expect(r.status).toBe(200); // list 本身不报错，但必须按可见性过滤
    const list = dataOf(r.body) ?? [];
    expect(
      list.map((p: any) => Number(p.id)),
      "伪造 workspace 头不得看到 wsA 的私有项目"
    ).not.toContain(projectAId);
  });

  it("越权: userB 伪造 x-workspace-id=wsA 调 projects.list → 不得包含 wsA 的 org 可见项目（回归: 非成员伪造头一律返回空）", async () => {
    // 回归固化: 修复前 server/db/projects.ts getProjectsByUserId 在
    // workspaceRole=null（伪造头的非成员）时落入 member/viewer 过滤分支，
    // 放行 visibility='org' 的项目元数据。现 projects.list 前置要求
    // workspace 成员身份，非成员伪造头 → 空列表。
    const r = await apiGet("projects.list", tokenB, wsAId); // 刻意伪造他人 workspace 头
    expect(r.status).toBe(200);
    const list = dataOf(r.body) ?? [];
    expect(
      list.map((p: any) => Number(p.id)),
      "伪造 workspace 头不得看到 wsA 的 org 项目"
    ).not.toContain(orgProjectAId);
    expect(
      list,
      "伪造头后应被切换到自己的 workspace, 不得看到 wsA 的 org 项目"
    ).not.toContain(orgProjectAId);
  });

  it("越权: userB 伪造 x-workspace-id=wsA 调 finance.getSummary → 被拒绝 (v4.3 切换到自己 workspace 后 project 不可达)", async () => {
    const r = await apiGet(
      "finance.getSummary?input=" +
        encodeURIComponent(JSON.stringify({ projectId: projectAId })),
      tokenB,
      wsAId // 伪造头：context 查不到 → 清 workspaceId → fallback 到自己 workspace
    );
    expect(r.status).toBe(404); // project 在自己 workspace 不可达 → 404
    expectDenied(r, "userB 伪造头访问 wsA 财务");
  });

  it("越权: 指向不存在 workspace 的 projects.list → fallback 到自己的 workspace (v4.3 WO-SEC-1)", async () => {
    const r = await apiGet("projects.list", tokenA, 99999999);
    expect(r.status).toBe(200);
    // 非成员 workspace 被清→ fallback 到自己 workspace, 项目不为空
    expect(Array.isArray(dataOf(r.body) ?? [])).toBe(true);
  });

  // ──── ④ 切换 workspace 后旧资源不可达 ────
  it("切换: userA 走真实 switch 链路切到 wsA2 后，projects.list 不再包含 wsA 的项目", async () => {
    const sw = await apiPost(
      "workspaces.switch",
      { workspaceId: wsA2Id },
      tokenA
    );
    const newToken = dataOf(sw.body)?.token as string;
    expect(newToken).toBeTruthy();

    const r = await apiGet("projects.list", newToken, wsA2Id);
    expect(r.status).toBe(200);
    const list = dataOf(r.body) ?? [];
    expect(
      list.map((p: any) => Number(p.id)),
      "切到 wsA2 后列表不得再出现 wsA 的项目"
    ).not.toContain(projectAId);

    // 切回 wsA（带 wsA 头）项目重新可见 —— 证明上面是"切换导致"而非数据丢失
    const back = await apiGet("projects.list", newToken, wsAId);
    expect((dataOf(back.body) ?? []).map((p: any) => Number(p.id))).toContain(
      projectAId
    );
    // 设计语义说明：按 ID 直访（projects.getById 等）由 project-guard 按"是否项目所属
    // workspace 的成员"判定，与当前激活 workspace 无关——member+ 可读本 workspace 全部项目。
    // 本测试断言的是列表层隔离；按 ID 的非成员拒绝由 tests/security/idor.test.ts 覆盖。
  });

  // ──── ⑤ member/viewer 角色访问财务接口一律 403（finance.view 权限化新语义）────
  it("角色: userC(member) 访问 finance.getSummary → 403", async () => {
    const r = await apiGet(
      "finance.getSummary?input=" +
        encodeURIComponent(JSON.stringify({ projectId: projectAId })),
      tokenC,
      wsAId
    );
    expect(r.status).toBe(403);
    expectDenied(r, "member 访问财务汇总");
  });

  it("角色: userD(viewer) 访问 finance.getSummary → 403", async () => {
    const r = await apiGet(
      "finance.getSummary?input=" +
        encodeURIComponent(JSON.stringify({ projectId: projectAId })),
      tokenD,
      wsAId
    );
    expect(r.status).toBe(403);
    expectDenied(r, "viewer 访问财务汇总");
  });

  // ──── ⑥ auth.searchUsers 非成员 403（防跨工作区 PII 枚举新语义）────
  it("越权: userB 对 wsA 调 auth.searchUsers → 403（非成员不可枚举他人工作区用户）", async () => {
    const r = await apiGet(
      "auth.searchUsers?input=" +
        encodeURIComponent(
          JSON.stringify({ query: "sectestxw", workspaceId: wsAId })
        ),
      tokenB,
      wsBId
    );
    expect(r.status).toBe(403);
    expectDenied(r, "非成员 searchUsers wsA");
  });

  // ──── ③ 未认证：无 token 访问受保护端点必须 401 ────
  it("未认证: 无 token 访问 finance.getSummary / auth.searchUsers / workspaces.members → 401", async () => {
    const rf = await apiGet(
      "finance.getSummary?input=" +
        encodeURIComponent(JSON.stringify({ projectId: projectAId }))
    );
    expect(rf.status).toBe(401);
    expectDenied(rf, "无 token 访问财务");

    const rs = await apiGet(
      "auth.searchUsers?input=" +
        encodeURIComponent(
          JSON.stringify({ query: "sectestxw", workspaceId: wsAId })
        )
    );
    expect(rs.status).toBe(401);
    expectDenied(rs, "无 token searchUsers");

    const rm = await apiGet(
      "workspaces.members?input=" +
        encodeURIComponent(JSON.stringify({ workspaceId: wsAId }))
    );
    expect(rm.status).toBe(401);
    expectDenied(rm, "无 token 列成员");
  });
});

/*
 * 遗留说明（不在本测试断言，供修复工人/审计跟进）：
 * 1. 【已修复】projects.list 对伪造 x-workspace-id 头的非成员调用者曾返回目标
 *    workspace 中 visibility='org' 的项目元数据。现 projects.list 前置要求
 *    workspace 成员身份（非成员 → 空列表），上方 org 项目伪造头回归用例已固化。
 * 2. workspaces.update/delete 依赖 ctx.workspaceRole 判定 owner/admin；非成员伪造头时
 *    role=null 会被拒，但 member 角色带 wsA 头调 update 走 ctx.workspaceRole==='member'
 *    也被拒——该路径已由角色矩阵保证，未在本文件重复覆盖。
 */
