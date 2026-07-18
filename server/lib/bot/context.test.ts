import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";

// 用临时数据库隔离测试
let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, openId TEXT NOT NULL UNIQUE,
      name TEXT, email TEXT, loginMethod TEXT, role TEXT DEFAULT 'user',
      passwordHash TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, lastSignedIn TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, ownerId INTEGER NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS bot_user_context (
      id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT NOT NULL,
      platformUserId TEXT NOT NULL, chronosUserId INTEGER NOT NULL,
      currentProjectId INTEGER NOT NULL DEFAULT 1, lastCommand TEXT,
      tempData TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
      UNIQUE(platform, platformUserId)
    );
    CREATE TABLE IF NOT EXISTS bot_auth_codes (
      code TEXT PRIMARY KEY, chronosUserId INTEGER NOT NULL,
      expiresAt TEXT NOT NULL, createdAt TEXT NOT NULL
    );
  `);
  // 种子用户
  db.prepare(
    "INSERT INTO users (id, openId, name, role, createdAt, updatedAt, lastSignedIn) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    1,
    "local-dev-user",
    "本地用户",
    "admin",
    new Date().toISOString(),
    new Date().toISOString(),
    new Date().toISOString()
  );
  db.prepare(
    "INSERT INTO projects (id, name, ownerId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)"
  ).run(1, "默认项目", 1, new Date().toISOString(), new Date().toISOString());
});

// 模拟 bot.ts 的核心逻辑（因为 import db 会用到真实 DB 文件，这里直接测 SQL 逻辑）
function getOrCreateContext(
  platform: string,
  platformUserId: string
): { chronosUserId: number; currentProjectId: number; isNew: boolean } {
  const rows = db
    .prepare(
      "SELECT * FROM bot_user_context WHERE platform = ? AND platformUserId = ?"
    )
    .all(platform, platformUserId) as any[];
  if (rows.length > 0) {
    db.prepare("UPDATE bot_user_context SET updatedAt = ? WHERE id = ?").run(
      new Date().toISOString(),
      rows[0].id
    );
    return {
      chronosUserId: rows[0].chronosUserId,
      currentProjectId: rows[0].currentProjectId,
      isNew: false,
    };
  }
  // 新建
  const openId = `${platform}:${platformUserId}`;
  const result = db
    .prepare(
      "INSERT INTO users (openId, name, loginMethod, role, createdAt, updatedAt, lastSignedIn) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      openId,
      platformUserId,
      platform,
      "user",
      new Date().toISOString(),
      new Date().toISOString(),
      new Date().toISOString()
    );
  const chronosUserId = result.lastInsertRowid as number;
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO bot_user_context (platform, platformUserId, chronosUserId, currentProjectId, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)"
  ).run(platform, platformUserId, chronosUserId, now, now);
  return { chronosUserId, currentProjectId: 1, isNew: true };
}

function generateCode(chronosUserId: number): string {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  db.prepare(
    "INSERT INTO bot_auth_codes (code, chronosUserId, expiresAt, createdAt) VALUES (?, ?, ?, ?)"
  ).run(code, chronosUserId, expiresAt, new Date().toISOString());
  return code;
}

function redeemCode(code: string): number | null {
  const rows = db
    .prepare("SELECT * FROM bot_auth_codes WHERE code = ?")
    .all(code) as any[];
  if (rows.length === 0) return null;
  if (new Date(rows[0].expiresAt) < new Date()) {
    db.prepare("DELETE FROM bot_auth_codes WHERE code = ?").run(code);
    return null;
  }
  const userId = rows[0].chronosUserId;
  db.prepare("DELETE FROM bot_auth_codes WHERE code = ?").run(code);
  return userId;
}

function bindUser(
  platform: string,
  platformUserId: string,
  chronosUserId: number
) {
  const existing = db
    .prepare(
      "SELECT id FROM bot_user_context WHERE platform = ? AND platformUserId = ?"
    )
    .all(platform, platformUserId) as any[];
  const now = new Date().toISOString();
  if (existing.length > 0) {
    db.prepare(
      "UPDATE bot_user_context SET chronosUserId = ?, updatedAt = ? WHERE id = ?"
    ).run(chronosUserId, now, existing[0].id);
  } else {
    db.prepare(
      "INSERT INTO bot_user_context (platform, platformUserId, chronosUserId, currentProjectId, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)"
    ).run(platform, platformUserId, chronosUserId, now, now);
  }
}

describe("bot context", () => {
  describe("getOrCreateContext", () => {
    it("creates new context for first-time user", () => {
      const ctx = getOrCreateContext("wecom", "newuser123");
      expect(ctx.isNew).toBe(true);
      expect(ctx.currentProjectId).toBe(1);
      expect(ctx.chronosUserId).toBeGreaterThan(1); // 种子用户 id=1
    });

    it("returns existing context for returning user", () => {
      getOrCreateContext("wecom", "returning");
      const ctx = getOrCreateContext("wecom", "returning");
      expect(ctx.isNew).toBe(false);
    });

    it("creates a CHRONOS user account automatically", () => {
      const ctx = getOrCreateContext("dingtalk", "autoCreated");
      const user = db
        .prepare("SELECT * FROM users WHERE openId = ?")
        .get("dingtalk:autoCreated") as any;
      expect(user).toBeTruthy();
      expect(user.name).toBe("autoCreated");
      expect(user.loginMethod).toBe("dingtalk");
      expect(ctx.chronosUserId).toBe(user.id);
    });

    it("isolates users across platforms", () => {
      const wecom = getOrCreateContext("wecom", "sameName");
      const dt = getOrCreateContext("dingtalk", "sameName");
      expect(wecom.chronosUserId).not.toBe(dt.chronosUserId);
      expect(wecom.isNew).toBe(true);
      expect(dt.isNew).toBe(true);
    });

    it("handles rapid successive calls for same user", () => {
      const first = getOrCreateContext("wecom", "rapid");
      const second = getOrCreateContext("wecom", "rapid");
      expect(first.chronosUserId).toBe(second.chronosUserId);
      expect(second.isNew).toBe(false);
    });
  });

  describe("auth codes", () => {
    it("generates and redeems a 6-digit code", () => {
      const code = generateCode(1);
      expect(code).toMatch(/^\d{6}$/);
      const userId = redeemCode(code);
      expect(userId).toBe(1);
    });

    it("returns null for invalid code", () => {
      expect(redeemCode("000000")).toBeNull();
    });

    it("returns null for expired code", () => {
      const code = generateCode(1);
      // 手动过期
      db.prepare("UPDATE bot_auth_codes SET expiresAt = ? WHERE code = ?").run(
        new Date(Date.now() - 1000).toISOString(),
        code
      );
      expect(redeemCode(code)).toBeNull();
    });

    it("deletes code after redemption (one-time use)", () => {
      const code = generateCode(1);
      redeemCode(code);
      expect(redeemCode(code)).toBeNull();
    });
  });

  describe("bindUser", () => {
    it("binds platform user to existing CHRONOS account", () => {
      bindUser("wecom", "bindTest", 1);
      const ctx = getOrCreateContext("wecom", "bindTest");
      expect(ctx.chronosUserId).toBe(1);
      expect(ctx.isNew).toBe(false);
    });
  });
});
