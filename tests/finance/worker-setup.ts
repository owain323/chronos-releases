/**
 * vitest per-worker 测试基建 (setupFiles) — 每 worker 独立 SQLite 数据库
 *
 * 为什么: 旧配置所有 worker 共享 file:./chronos.db + globalSetup 对同一文件
 * drizzle-kit push, 默认并行必现 WAL 锁竞争 (database is locked / 失败点漂移)。
 *
 * 机制:
 *  1. setupFiles 保证先于任何测试文件在本 worker 进程内执行, 因此在
 *     server/config.ts 读取 process.env 之前, 按 VITEST_POOL_ID 设置
 *     DATABASE_URL=file:./test-db-<poolId>.db —— 每个 worker 一个物理库。
 *  2. 用 drizzle/0000_happy_juggernaut.sql (覆盖全部 34 张表, 已核对与活体库
 *     一致) 幂等建 schema —— 比每 worker 起 drizzle-kit push 子进程快且无锁。
 *  3. 测试库文件由 vitest.global-setup.ts 在运行前后清理。
 *
 * 同一 worker 内的多个测试文件顺序复用同一库 (无并发), 建表用 marker 表
 * 探测保证幂等。测试绝不读写仓库根的 chronos.db。
 */
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const poolId = process.env.VITEST_POOL_ID || "1";
const dbFile = path.join(projectRoot, `test-db-${poolId}.db`);

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
    if (marker) return; // 本 worker 库已初始化
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
