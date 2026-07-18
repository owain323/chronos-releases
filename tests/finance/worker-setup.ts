/**
 * vitest per-test-file 测试基建 (setupFiles) — 每个测试文件独立 SQLite 数据库
 *
 * v3.9 flaky-gate 修复:
 *  ① per-test-file DB 隔离 test-db-${poolId}-${fileId}.db (fileId 每次setupFiles 求值一次)
 *  ② poolId fallback 由常量 "1" 改 ${process.pid}-${randomUUID().slice(0,8)}
 *  ③ 迁移 SQL 保留 IF NOT EXISTS 防御
 *  ④ global-setup 清理正则为 ^test-db-.*\.db
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import Database from "better-sqlite3";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const poolId = process.env.VITEST_POOL_ID || `${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
const fileId = crypto.randomUUID().slice(0, 8);
const dbFile = path.join(projectRoot, `test-db-${poolId}-${fileId}.db`);

// 必须先于任何 server/* 模块导入生效
process.env.DATABASE_URL = `file:${dbFile}`;

function ensureSchema() {
  const sqlite = new Database(dbFile);
  try {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("busy_timeout = 5000");
    const marker = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
      )
      .get();
    if (marker) return;
    const sqlFile = path.join(
      projectRoot,
      "drizzle",
      "0000_happy_juggernaut.sql"
    );
    const statements = fs
      .readFileSync(sqlFile, "utf8")
      .split("--> statement-breakpoint")
      .map(s => s.trim())
      .filter(Boolean);
    sqlite.transaction(() => {
      for (const stmt of statements) sqlite.exec(stmt);
    })();
  } finally {
    sqlite.close();
  }
}

ensureSchema();
