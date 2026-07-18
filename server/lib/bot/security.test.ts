/**
 * P0 安全测试 — Bot 回调认证 + 命令权限校验
 *
 * 覆盖审计实证的攻击链：
 *   互联网任何人 POST /api/bot/callback 伪造 {senderId, text:{content}}
 *   → 自动建临时账号 → /切换 #1 → /报表 → 项目任务与成本金额外泄。
 *
 * 本文件真实 import 被测代码（callback / executor / access / project-guard），
 * 直连测试 DB（vitest env: file:./chronos.db，globalSetup 已 drizzle-kit push），
 * 断言真实行为，不断言本地字面量副本。
 *
 * 数据隔离：所有测试数据带 botsec- 前缀，afterAll 清理。
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import crypto from "crypto";
import { handleBotCallback, verifyDingtalkSign } from "./callback";
import { executeCommand } from "./executor";
import { isTempBotUser } from "./access";
import { getOrCreateBotUser, bindBotUser } from "../../db";
import { sqlite } from "../../db/connection";

// ──── 测试数据（botsec- 前缀）────
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const P = (s: string) => `botsec-${s}-${RUN}`;
const SECRET = "botsec-dingtalk-secret";
const PROJECT_NAME = P("机密项目");

let ownerId: number; // 正式账号（workspace owner）
let outsiderId: number; // 正式账号但不在 workspace 里
let wsId: number;
let projectId: number;
let tempChronosUserId: number; // 临时账号 chronosUserId
const TEMP_PLATFORM_UID = P("temp-user"); // 已存在（isNew=false）的临时 bot 用户
const BOUND_PLATFORM_UID = P("bound-user"); // 绑定到 ownerId 的 bot 用户
const OUTSIDER_PLATFORM_UID = P("outsider-user"); // 绑定到 outsiderId 的 bot 用户

const savedEnv = {
  NODE_ENV: process.env.NODE_ENV,
  DINGTALK_SECRET: process.env.DINGTALK_SECRET,
  WECOM_ENCODING_AES_KEY: process.env.WECOM_ENCODING_AES_KEY,
  WECOM_TOKEN: process.env.WECOM_TOKEN,
};

afterEach(() => {
  // 每个用例后恢复环境，避免交叉污染
  process.env.NODE_ENV = savedEnv.NODE_ENV;
  if (savedEnv.DINGTALK_SECRET === undefined)
    delete process.env.DINGTALK_SECRET;
  else process.env.DINGTALK_SECRET = savedEnv.DINGTALK_SECRET;
  if (savedEnv.WECOM_ENCODING_AES_KEY === undefined)
    delete process.env.WECOM_ENCODING_AES_KEY;
  else process.env.WECOM_ENCODING_AES_KEY = savedEnv.WECOM_ENCODING_AES_KEY;
  if (savedEnv.WECOM_TOKEN === undefined) delete process.env.WECOM_TOKEN;
  else process.env.WECOM_TOKEN = savedEnv.WECOM_TOKEN;
});

// ──── helpers ────
/** 按钉钉官方规范计算签名：base64(HmacSHA256(timestamp+"\n"+secret, secret)) */
function dingSign(ts: string, secret: string = SECRET): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${ts}\n${secret}`, "utf8")
    .digest("base64");
}

/** 构造带合法签名的新鲜钉钉请求 */
function validDingReq(senderId: string, content: string) {
  const ts = String(Date.now());
  return {
    platform: "dingtalk" as const,
    raw: { senderId, text: { content } },
    timestamp: ts,
    sign: dingSign(ts),
  };
}

function countBotContext(platformUserId: string): number {
  const row = sqlite
    .prepare(
      "SELECT COUNT(*) AS c FROM bot_user_context WHERE platform = 'dingtalk' AND platformUserId = ?"
    )
    .get(platformUserId) as any;
  return row.c as number;
}

// ──── 数据准备 ────
beforeAll(() => {
  const now = new Date().toISOString();

  // 两个正式账号（loginMethod=local，非临时账号）
  ownerId = Number(
    sqlite
      .prepare(
        `INSERT INTO users (openId, name, loginMethod, role, passwordHash, createdAt, updatedAt, lastSignedIn)
         VALUES (?, ?, 'local', 'user', 'botsec-hash', ?, ?, ?)`
      )
      .run(P("owner-openid"), P("业主"), now, now, now).lastInsertRowid
  );
  outsiderId = Number(
    sqlite
      .prepare(
        `INSERT INTO users (openId, name, loginMethod, role, passwordHash, createdAt, updatedAt, lastSignedIn)
         VALUES (?, ?, 'local', 'user', 'botsec-hash', ?, ?, ?)`
      )
      .run(P("outsider-openid"), P("外人"), now, now, now).lastInsertRowid
  );

  // owner 的 workspace + 成员关系（owner 角色）
  wsId = Number(
    sqlite
      .prepare(
        `INSERT INTO workspaces (name, slug, createdBy, status, createdAt, updatedAt)
         VALUES (?, ?, ?, 'active', ?, ?)`
      )
      .run(P("工作区"), P("ws"), ownerId, now, now).lastInsertRowid
  );
  sqlite
    .prepare(
      `INSERT INTO workspace_members (workspaceId, userId, role, status, joinedAt)
       VALUES (?, ?, 'owner', 'active', ?)`
    )
    .run(wsId, ownerId, now);

  // 私有项目（owner 所有）
  projectId = Number(
    sqlite
      .prepare(
        `INSERT INTO projects (name, workspaceId, ownerId, visibility, status, createdAt, updatedAt)
         VALUES (?, ?, ?, 'private', 'active', ?, ?)`
      )
      .run(PROJECT_NAME, wsId, ownerId, now, now).lastInsertRowid
  );
  expect(projectId).toBeGreaterThan(0);

  // 已存在的临时账号（绕过 callback 的 isNew 欢迎拦截，直达命令层）
  const tempCtx = getOrCreateBotUser("dingtalk", TEMP_PLATFORM_UID);
  tempChronosUserId = tempCtx.chronosUserId;
  expect(tempCtx.isNew).toBe(true);

  // 绑定关系：bound → owner；outsider-bound → outsider（不在 ws 里）
  bindBotUser("dingtalk", BOUND_PLATFORM_UID, ownerId);
  bindBotUser("dingtalk", OUTSIDER_PLATFORM_UID, outsiderId);
});

afterAll(() => {
  const run = (sql: string) => {
    try {
      sqlite.exec(sql);
    } catch {
      /* best-effort */
    }
  };
  run(`DELETE FROM bot_user_context WHERE platformUserId LIKE 'botsec-%'`);
  run(
    `DELETE FROM workspace_members WHERE workspaceId IN (SELECT id FROM workspaces WHERE slug LIKE 'botsec-%')`
  );
  run(`DELETE FROM projects WHERE name LIKE 'botsec-%'`);
  run(`DELETE FROM workspaces WHERE slug LIKE 'botsec-%'`);
  run(`DELETE FROM users WHERE openId LIKE 'botsec-%'`);
});

// ──── 钉钉回调验签 ────
describe("P0 — 钉钉回调验签", () => {
  it("伪造请求无签名 → 拒绝，且不创建临时账号", async () => {
    process.env.NODE_ENV = "production";
    process.env.DINGTALK_SECRET = SECRET;
    const attacker = P("atk-nosign");
    const res = await handleBotCallback({
      platform: "dingtalk",
      raw: { senderId: attacker, text: { content: "/报表" } },
    });
    expect(res?.reply).toContain("❌");
    expect(res?.reply).not.toContain(PROJECT_NAME);
    // 攻击链第一环被斩断：连临时账号都不允许创建
    expect(countBotContext(attacker)).toBe(0);
  });

  it("错误签名 → 拒绝", async () => {
    process.env.NODE_ENV = "production";
    process.env.DINGTALK_SECRET = SECRET;
    const attacker = P("atk-badsign");
    const res = await handleBotCallback({
      platform: "dingtalk",
      raw: { senderId: attacker, text: { content: "/报表" } },
      timestamp: String(Date.now()),
      sign: "forged-signature",
    });
    expect(res?.reply).toContain("❌");
    expect(res?.reply).not.toContain(PROJECT_NAME);
    expect(countBotContext(attacker)).toBe(0);
  });

  it("正确签名但时间戳偏差 >1 小时 → 防重放拒绝", async () => {
    process.env.NODE_ENV = "production";
    process.env.DINGTALK_SECRET = SECRET;
    const ts = String(Date.now() - 2 * 60 * 60 * 1000); // 2 小时前
    const res = await handleBotCallback({
      platform: "dingtalk",
      raw: { senderId: P("atk-replay"), text: { content: "/报表" } },
      timestamp: ts,
      sign: dingSign(ts), // 签名本身合法
    });
    expect(res?.reply).toContain("过期");
  });

  it("生产环境未配置 DINGTALK_SECRET → fail-closed 拒绝", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.DINGTALK_SECRET;
    const attacker = P("atk-nosecret");
    const res = await handleBotCallback({
      platform: "dingtalk",
      raw: { senderId: attacker, text: { content: "/报表" } },
      timestamp: String(Date.now()),
      sign: "whatever",
    });
    expect(res?.reply).toContain("❌");
    expect(countBotContext(attacker)).toBe(0);
  });

  it("正确签名 + 新鲜时间戳 → 通过验签进入业务流程（新用户收欢迎语）", async () => {
    process.env.NODE_ENV = "production";
    process.env.DINGTALK_SECRET = SECRET;
    const legit = P("legit-user");
    const res = await handleBotCallback(validDingReq(legit, "/任务"));
    // 通过验签后被新用户欢迎语拦截（不泄露任何数据），证明验签放行
    expect(res?.reply).toContain("临时账号");
    expect(res?.reply).not.toContain("❌ 签名校验失败");
    expect(countBotContext(legit)).toBe(1);
  });

  it("verifyDingtalkSign 单元行为：URL 编码签名同样可验，错 secret 不通过", () => {
    const ts = String(Date.now());
    const raw = dingSign(ts);
    expect(verifyDingtalkSign(SECRET, ts, raw)).toBe(true);
    expect(verifyDingtalkSign(SECRET, ts, encodeURIComponent(raw))).toBe(true);
    expect(verifyDingtalkSign("wrong-secret", ts, raw)).toBe(false);
    expect(verifyDingtalkSign(SECRET, ts, "")).toBe(false);
  });
});

// ──── 企微明文模式 ────
describe("P0 — 企微明文回调生产禁用", () => {
  it("生产环境 + 未配置加密 key → 明文回调拒绝", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.WECOM_ENCODING_AES_KEY;
    delete process.env.WECOM_TOKEN;
    const res = await handleBotCallback({
      platform: "wecom",
      raw: { from: { userid: P("wecom-atk") }, text: { content: "/报表" } },
    });
    expect(res?.reply).toContain("❌");
    expect(res?.reply).not.toContain(PROJECT_NAME);
  });

  it("生产环境 + 已配置加密 key → 明文 body 仍然拒绝（无身份凭证）", async () => {
    process.env.NODE_ENV = "production";
    process.env.WECOM_ENCODING_AES_KEY = "dummy-key";
    process.env.WECOM_TOKEN = "dummy-token";
    const res = await handleBotCallback({
      platform: "wecom",
      raw: { from: { userid: P("wecom-atk2") }, text: { content: "/报表" } },
      encodingAESKey: "dummy-key",
      wecomToken: "dummy-token",
    });
    expect(res?.reply).toContain("❌");
  });

  it("非生产环境明文模式兼容老配置（回归保护）", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.WECOM_ENCODING_AES_KEY;
    delete process.env.WECOM_TOKEN;
    const res = await handleBotCallback({
      platform: "wecom",
      raw: { from: { userid: P("wecom-dev") }, text: { content: "" } },
    });
    expect(res?.reply).toContain("🤖");
  });
});

// ──── 命令权限（真实 DB + 真实守卫链路）────
describe("P0 — 命令权限校验", () => {
  beforeAll(() => {
    process.env.DINGTALK_SECRET = SECRET;
  });

  it("临时账号识别：bot 自动创建的是临时账号，正式账号不是", async () => {
    expect(await isTempBotUser(tempChronosUserId)).toBe(true);
    expect(await isTempBotUser(ownerId)).toBe(false);
    expect(await isTempBotUser(outsiderId)).toBe(false);
  });

  it("临时账号执行 /报表 → 拒绝且不泄露项目名与成本", async () => {
    const res = await handleBotCallback(
      validDingReq(TEMP_PLATFORM_UID, "/报表")
    );
    expect(res?.reply).toContain("临时账号");
    expect(res?.reply).toContain("绑定");
    expect(res?.reply).not.toContain(PROJECT_NAME);
    expect(res?.reply).not.toContain("成本：¥");
  });

  it("临时账号 /切换 #编号 → 拒绝", async () => {
    const res = await handleBotCallback(
      validDingReq(TEMP_PLATFORM_UID, `/切换 #${projectId}`)
    );
    expect(res?.reply).toContain("临时账号");
    expect(res?.reply).not.toContain("已切换");
  });

  it("临时账号 /帮助 放行（绑定类命令不受限）", async () => {
    const res = await handleBotCallback(
      validDingReq(TEMP_PLATFORM_UID, "/帮助")
    );
    expect(res?.reply).toContain("CHRONOS 机器人命令");
    expect(res?.reply).not.toContain("🔒");
  });

  it("executor 层直调：临时账号项目数据命令被拒", async () => {
    const r1 = await executeCommand("/报表", tempChronosUserId, projectId);
    expect(r1.reply).toContain("临时账号");
    const r2 = await executeCommand("/任务", tempChronosUserId, projectId);
    expect(r2.reply).toContain("临时账号");
  });

  it("绑定用户完整链路：/切换 有权项目 → /报表 放行并返回真实数据", async () => {
    const sw = await handleBotCallback(
      validDingReq(BOUND_PLATFORM_UID, `/切换 #${projectId}`)
    );
    expect(sw?.reply).toContain("已切换到");
    expect(sw?.reply).toContain(PROJECT_NAME);

    const rep = await handleBotCallback(
      validDingReq(BOUND_PLATFORM_UID, "/报表")
    );
    expect(rep?.reply).toContain(PROJECT_NAME);
    expect(rep?.reply).toContain("报表");
    expect(rep?.reply).not.toContain("🔒");
  });

  it("executor 层直调：绑定用户 /任务 放行", async () => {
    const r = await executeCommand("/任务", ownerId, projectId);
    expect(r.reply).toContain(PROJECT_NAME);
    expect(r.reply).not.toContain("🔒");
  });

  it("跨租户：绑定了非成员账号的 bot 用户 /切换 他人私有项目 → 拒绝", async () => {
    const res = await handleBotCallback(
      validDingReq(OUTSIDER_PLATFORM_UID, `/切换 #${projectId}`)
    );
    expect(res?.reply).toContain("❌");
    expect(res?.reply).not.toContain("已切换");
    expect(res?.reply).not.toContain(PROJECT_NAME);
  });

  it("跨租户：/项目 列表不泄露无权项目名", async () => {
    const res = await handleBotCallback(
      validDingReq(OUTSIDER_PLATFORM_UID, "/项目")
    );
    expect(res?.reply).not.toContain(PROJECT_NAME);
  });

  it("跨租户：/项目 切换 #N 同样校验目标项目（不能只验上下文项目）", async () => {
    const res = await handleBotCallback(
      validDingReq(OUTSIDER_PLATFORM_UID, `/项目 切换 #${projectId}`)
    );
    expect(res?.reply).toContain("❌");
    expect(res?.reply).not.toContain(PROJECT_NAME);
    expect(res?.reply).not.toContain("任务：");
  });

  it("绑定用户 /项目 切换 #N 到有权项目 → 放行", async () => {
    const res = await handleBotCallback(
      validDingReq(BOUND_PLATFORM_UID, `/项目 切换 #${projectId}`)
    );
    expect(res?.reply).toContain(PROJECT_NAME);
    expect(res?.reply).not.toContain("🔒");
  });

  it("跨租户：按项目名切换也无法命中无权项目", async () => {
    const res = await handleBotCallback(
      validDingReq(OUTSIDER_PLATFORM_UID, "/切换 机密项目")
    );
    expect(res?.reply).toContain("❌");
    expect(res?.reply).not.toContain("已切换");
  });
});
