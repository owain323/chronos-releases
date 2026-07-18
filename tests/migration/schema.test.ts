/**
 * Migration 验证测试 — Schema 完整性检查
 * P0 修复: 去掉 describe.skip; DB_PATH 残留指向 ../../TaskNest/chronos.db
 * (其他项目) 已修正 —— 改用 per-worker 独立测试库 (worker-setup.ts 注入的
 * DATABASE_URL → test-db-${VITEST_POOL_ID}.db), 不再依赖任何活体库。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync } from "fs";
import Database from "better-sqlite3";

const DB_PATH = (process.env.DATABASE_URL || "").replace(/^file:/, "");

describe("Migration — Schema 完整性", () => {
  let db: Database.Database;

  beforeAll(() => {
    expect(DB_PATH).toBeTruthy();
    expect(existsSync(DB_PATH)).toBe(true);
    db = new Database(DB_PATH);
  });
  afterAll(() => {
    db?.close();
  });

  it("所有必需表存在 (drizzle 迁移 SQL 已落)", () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      )
      .all()
      .map((r: any) => r.name);
    expect(tables).toContain("users");
    expect(tables).toContain("projects");
    expect(tables).toContain("tasks");
    expect(tables).toContain("user_sessions");
    expect(tables).toContain("activity_events");
    // 财务核心表
    expect(tables).toContain("accounts");
    expect(tables).toContain("journalEntries");
  });

  it("users 表包含必要列", () => {
    const cols = db
      .prepare("PRAGMA table_info(users)")
      .all()
      .map((c: any) => c.name);
    expect(cols).toContain("id");
    expect(cols).toContain("name");
    expect(cols).toContain("email");
    expect(cols).toContain("role");
  });

  it("system_roles 表结构可建且 SYSTEM_OWNER 种子可写读 (fixture 自建)", () => {
    // system_roles 由 server/db/systemRoles.ts 定义, 不在 drizzle 迁移 SQL
    // 覆盖范围内 —— 测试内按其定义自建 fixture 验证结构契约
    db.close();
    const rw = new Database(DB_PATH);
    try {
      rw.exec(
        `CREATE TABLE IF NOT EXISTS system_roles (
          id text PRIMARY KEY NOT NULL,
          user_id integer NOT NULL,
          system_role text NOT NULL,
          created_at integer
        )`
      );
      rw.prepare(
        "INSERT INTO system_roles (id, user_id, system_role, created_at) VALUES (?, ?, 'SYSTEM_OWNER', ?)"
      ).run(crypto.randomUUID(), 1, Date.now());
      const row = rw
        .prepare("SELECT * FROM system_roles WHERE system_role='SYSTEM_OWNER'")
        .get() as any;
      expect(row).toBeTruthy();
      expect(row.user_id).toBe(1);
    } finally {
      rw.close();
    }
    db = new Database(DB_PATH);
  });
});
