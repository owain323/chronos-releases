/**
 * Auth Router 测试 — 全部真实 import + in-process HTTP 集成
 *
 * 被测真实模块:
 *   - ./auth            → authRouter / signToken / verifyToken
 *   - ../lib/rate-limit → peekRateLimit / resetRateLimit (真实限流实例)
 *   - ../db/connection  → sqlite (真实 DB 断言)
 *
 * 覆盖语义 (v3.8 审计基准):
 *   - 重复邮箱注册报 "该邮箱不可用"
 *   - 登录限流 ip+email 双维度, 失败窗口 MAX_FAILS=10 → 第 11 次锁定
 *   - login 设 httpOnly cookie; logout 清 cookie + 递增 tokenVersion
 *   - uploadAvatar 限 2MB + png/jpg/webp magic-byte 校验
 *   - forgotPassword 防枚举: 存在/不存在均返回 { sent: true }, token 每流程重生成
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import http from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "../_core/context";
import { signToken, verifyToken } from "./auth";
import { peekRateLimit, resetRateLimit } from "../lib/rate-limit";

let server: http.Server;
let url: string;

/** 限流测试专用账号 (在 beforeAll 注册, 不登录以免清零失败窗口) */
const RL_EMAIL = `faketest-rl-${Date.now()}@t.dev`;
const PASSWORD = "Abcd1234!@kkk";

function unwrap(r: any) {
  return r?.result?.data?.json ?? r?.result?.data;
}
function errMsg(r: any): string {
  return r?.error?.json?.message ?? r?.error?.message ?? "";
}

async function api(path: string, body: any, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${url}/api/trpc/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    setCookie: res.headers.get("set-cookie"),
    body: await res.json(),
  };
}

async function register(email: string, name = "ft-user") {
  return api("auth.register", { name, email, password: PASSWORD });
}
async function login(email: string, password = PASSWORD) {
  return api("auth.login", { email, password });
}
/** 注册 + 登录, 返回 token 与 userId */
async function registerAndLogin(tag: string) {
  const email = `faketest-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@t.dev`;
  const reg = await register(email);
  const userId = unwrap(reg.body)?.userId;
  expect(userId, `注册失败: ${errMsg(reg.body)}`).toBeGreaterThan(0);
  const lg = await login(email);
  const token = unwrap(lg.body)?.token;
  expect(token, `登录失败: ${errMsg(lg.body)}`).toBeTruthy();
  return { email, userId, token: token as string };
}

async function sqlite() {
  return (await import("../db/connection")).sqlite;
}

/** 级联清理 faketest-% 用户及其自动创建的工作区 */
async function cleanupFakeUsers() {
  const db = await sqlite();
  const ids = (
    db
      .prepare("SELECT id FROM users WHERE email LIKE 'faketest-%'")
      .all() as any[]
  ).map(r => r.id);
  if (ids.length === 0) return;
  const ph = ids.map(() => "?").join(",");
  db.prepare(`DELETE FROM user_sessions WHERE user_id IN (${ph})`).run(...ids);
  db.prepare(`DELETE FROM workspace_members WHERE userId IN (${ph})`).run(
    ...ids
  );
  db.prepare(`DELETE FROM workspaces WHERE createdBy IN (${ph})`).run(...ids);
  db.prepare(`DELETE FROM users WHERE id IN (${ph})`).run(...ids);
}

beforeAll(async () => {
  await cleanupFakeUsers().catch(() => {});

  const app = express();
  app.use(express.json({ limit: "8mb" }));
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
      url = `http://localhost:${(server.address() as any).port}`;
      resolve();
    });
  });

  const r = await register(RL_EMAIL, "ft-ratelimit");
  expect(errMsg(r.body), "限流测试账号注册失败").toBe("");
}, 20000);

afterAll(async () => {
  server?.close();
  await resetRateLimit(`login:acct:${RL_EMAIL.toLowerCase()}`).catch(() => {});
  await cleanupFakeUsers().catch(() => {});
});

// ─────────── 真实导出函数: JWT 结构 ───────────
describe("auth.ts 真实导出 · signToken/verifyToken", () => {
  it("JWT payload 只含 uid+tv, 不含 role/敏感字段", () => {
    const token = signToken(42, 3);
    const payload = verifyToken(token);
    // jwt.sign 自动附带 iat/exp, 业务字段必须只有 uid+tv
    expect(payload).toMatchObject({ uid: 42, tv: 3 });
    expect(Object.keys(payload!).sort()).toEqual(["exp", "iat", "tv", "uid"]);
    expect(payload).not.toHaveProperty("role");
    expect(payload).not.toHaveProperty("email");
  });

  it("verifyToken 拒绝篡改/无效 token", () => {
    expect(verifyToken("not-a-jwt")).toBeNull();
    expect(verifyToken(signToken(1, 0) + "x")).toBeNull();
  });
});

// ─────────── 登录限流 (ip+email 双维度, 第 11 次锁定) ───────────
// 注意: 本 describe 必须先于任何成功登录用例执行 (成功登录会 reset ip 维度失败窗口)
describe("auth.login 限流 · 真实 rate-limit 实例", () => {
  // ip 维度键由本机回环地址决定, 测试后必须清零, 否则同 ip 后续登录全被锁
  const IP_KEY_CANDIDATES = [
    "login:ip:127.0.0.1",
    "login:ip:::1",
    "login:ip:::ffff:127.0.0.1",
  ];

  afterAll(async () => {
    await Promise.all(
      IP_KEY_CANDIDATES.map(k => resetRateLimit(k).catch(() => {}))
    );
  });

  it("连续 10 次密码错误放行, 第 11 次被锁定", async () => {
    for (let i = 1; i <= 10; i++) {
      const r = await login(RL_EMAIL, "WrongPass123!");
      expect(errMsg(r.body), `第 ${i} 次应为密码错误`).toContain(
        "用户不存在或密码错误"
      );
    }
    // acct 维度失败窗口已满 (MAX_FAILS=10)
    expect(await peekRateLimit(`login:acct:${RL_EMAIL.toLowerCase()}`)).toBe(
      false
    );
    const r11 = await login(RL_EMAIL, "WrongPass123!");
    expect(errMsg(r11.body)).toContain("登录尝试过于频繁");
    // 锁定后即使密码正确也进不到密码校验
    const r12 = await login(RL_EMAIL, PASSWORD);
    expect(errMsg(r12.body)).toContain("登录尝试过于频繁");
  }, 30000);
});

// ─────────── register 集成 (it.todo → 真实测试) ───────────
describe("auth.register 集成", () => {
  it("register 创建 user + 专属 workspace + owner 成员", async () => {
    const email = `faketest-reg-${Date.now()}@t.dev`;
    const r = await register(email);
    const userId = unwrap(r.body)?.userId;
    expect(userId).toBeGreaterThan(0);

    const db = await sqlite();
    const user = db
      .prepare("SELECT id, email, role FROM users WHERE id = ?")
      .get(userId) as any;
    expect(user.email).toBe(email);
    const ws = db
      .prepare("SELECT id, createdBy FROM workspaces WHERE createdBy = ?")
      .get(userId) as any;
    expect(ws).toBeTruthy();
    const member = db
      .prepare(
        "SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?"
      )
      .get(ws.id, userId) as any;
    expect(member?.role).toBe("owner");
  });

  it("重复邮箱注册报「该邮箱不可用」(防枚举模糊化)", async () => {
    const email = `faketest-dup-${Date.now()}@t.dev`;
    await register(email);
    const r2 = await register(email);
    expect(errMsg(r2.body)).toBe("该邮箱不可用");
  });

  it("弱密码被真实 zod schema 拒绝 (min 12 + 大小写数字)", async () => {
    const email = `faketest-weak-${Date.now()}@t.dev`;
    const r = await api("auth.register", {
      name: "ft-user",
      email,
      password: "abcdefgh1234",
    });
    expect(errMsg(r.body)).not.toBe("");
    const db = await sqlite();
    expect(
      db.prepare("SELECT id FROM users WHERE email = ?").get(email)
    ).toBeUndefined();
  });
});

// ─────────── login 集成 (it.todo → 真实测试) ───────────
describe("auth.login 集成", () => {
  it("登录返回 token 并设置 httpOnly + SameSite=Strict cookie", async () => {
    const { email, userId } = await registerAndLogin("cookie");
    const r = await login(email);
    expect(r.setCookie).toBeTruthy();
    expect(r.setCookie).toMatch(/HttpOnly/);
    expect(r.setCookie).toMatch(/SameSite=Strict/i);
    expect(r.setCookie).toMatch(/Path=\//);
    expect(r.setCookie).toMatch(/^token=/);

    const data = unwrap(r.body);
    expect(data.user.id).toBe(userId);
    // cookie 里的 token 与 body token 均可被真实 verifyToken 验出 uid
    const payload = verifyToken(data.token);
    expect(payload?.uid).toBe(userId);
  });

  it("密码错误不计入成功: 失败响应不含 token", async () => {
    const { email } = await registerAndLogin("badpw");
    const r = await login(email, "WrongPass123!");
    expect(unwrap(r.body)).toBeUndefined();
    expect(errMsg(r.body)).toContain("用户不存在或密码错误");
    expect(r.setCookie ?? "").not.toMatch(/^token=[^;]/);
  });
});

// ─────────── logout 集成 (it.todo → 真实测试) ───────────
describe("auth.logout 集成", () => {
  it("logout 清 cookie + 递增 tokenVersion, 旧 token 立即失效", async () => {
    const { token, userId } = await registerAndLogin("logout");
    const db = await sqlite();
    const tvBefore =
      (
        db
          .prepare("SELECT tokenVersion FROM users WHERE id = ?")
          .get(userId) as any
      )?.tokenVersion ?? 0;

    const r = await api("auth.logout", {}, token);
    expect(unwrap(r.body)?.success).toBe(true);
    // clearCookie: token 置空 + 过期时间 1970
    expect(r.setCookie).toMatch(/^token=;/);
    expect(r.setCookie).toMatch(/Expires=Thu, 01 Jan 1970/);

    const tvAfter = (
      db
        .prepare("SELECT tokenVersion FROM users WHERE id = ?")
        .get(userId) as any
    )?.tokenVersion;
    expect(tvAfter).toBe(tvBefore + 1);

    // 旧 token (tv=旧值) 不再通过 context 校验
    const me = await api("auth.me", {}, token);
    expect(errMsg(me.body)).toBeTruthy();
  });
});

// ─────────── forgotPassword / reset token ───────────
describe("auth.forgotPassword · 防枚举 + token 一次性", () => {
  it("存在/不存在的邮箱均返回 { sent: true }", async () => {
    const { email } = await registerAndLogin("forgot");
    const r1 = await api("auth.forgotPassword", {
      email: `faketest-noexist-${Date.now()}@t.dev`,
    });
    expect(unwrap(r1.body)).toEqual({ sent: true });
    const r2 = await api("auth.forgotPassword", { email });
    expect(unwrap(r2.body)).toEqual({ sent: true });
  });

  it("重置 token 每流程重新生成 (hash 不复用)", async () => {
    const { email, userId } = await registerAndLogin("reset");
    const db = await sqlite();
    await api("auth.forgotPassword", { email });
    const h1 = (
      db
        .prepare("SELECT resetTokenHash FROM users WHERE id = ?")
        .get(userId) as any
    )?.resetTokenHash;
    await api("auth.forgotPassword", { email });
    const h2 = (
      db
        .prepare("SELECT resetTokenHash FROM users WHERE id = ?")
        .get(userId) as any
    )?.resetTokenHash;
    expect(h1).toBeTruthy();
    expect(h2).toBeTruthy();
    expect(h2).not.toBe(h1);
  });

  it("错误 token 无法 resetPassword (真实 bcrypt 校验)", async () => {
    const { email } = await registerAndLogin("reset2");
    await api("auth.forgotPassword", { email });
    const r = await api("auth.resetPassword", {
      email,
      token: "deadbeef".repeat(8),
      newPassword: "NewPass123!xyz",
    });
    expect(errMsg(r.body)).toContain("无效的重置令牌");
  });
});

// ─────────── deleteAccount 软删除 + 会话失效 ───────────
describe("auth.deleteAccount 集成", () => {
  it("软删除清空 PII + 递增 tokenVersion", async () => {
    const { token, userId } = await registerAndLogin("del");
    const db = await sqlite();
    const tvBefore =
      (
        db
          .prepare("SELECT tokenVersion FROM users WHERE id = ?")
          .get(userId) as any
      )?.tokenVersion ?? 0;

    const r = await api("auth.deleteAccount", { password: PASSWORD }, token);
    expect(unwrap(r.body)?.success).toBe(true);

    const row = db
      .prepare(
        "SELECT name, email, passwordHash, tokenVersion FROM users WHERE id = ?"
      )
      .get(userId) as any;
    expect(row.name).toBe("[deleted]");
    expect(row.email).toBeNull();
    expect(row.passwordHash).toBeNull();
    expect(row.tokenVersion).toBe(tvBefore + 1);
  });

  it("密码错误拒绝删除", async () => {
    const { token } = await registerAndLogin("del2");
    const r = await api(
      "auth.deleteAccount",
      { password: "WrongPass123!" },
      token
    );
    expect(errMsg(r.body)).toContain("密码错误");
  });
});

// ─────────── uploadAvatar: 2MB 限制 + magic-byte 嗅探 ───────────
describe("auth.uploadAvatar · 真实校验", () => {
  it("拒绝 MIME 伪装: 声明 png 但内容非图片", async () => {
    const { token } = await registerAndLogin("avatar1");
    const fakePng = `data:image/png;base64,${Buffer.from("this is not an image").toString("base64")}`;
    const r = await api("auth.uploadAvatar", { dataUrl: fakePng }, token);
    expect(errMsg(r.body)).toContain("文件内容不是有效的 PNG/JPG/WebP 图片");
  });

  it("拒绝不支持的格式 (gif)", async () => {
    const { token } = await registerAndLogin("avatar2");
    const gif = `data:image/gif;base64,${Buffer.from("GIF89a").toString("base64")}`;
    const r = await api("auth.uploadAvatar", { dataUrl: gif }, token);
    expect(errMsg(r.body)).toContain("仅支持 PNG/JPG/WebP 格式");
  });

  it("拒绝超过 2MB 的头像", async () => {
    const { token } = await registerAndLogin("avatar3");
    // 解码后 > 2MB 的合法 PNG 头 + 填充
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const big = Buffer.concat([pngHeader, Buffer.alloc(2 * 1024 * 1024 + 1)]);
    const r = await api(
      "auth.uploadAvatar",
      { dataUrl: `data:image/png;base64,${big.toString("base64")}` },
      token
    );
    expect(errMsg(r.body)).toContain("头像大小不能超过 2MB");
  }, 20000);
});
