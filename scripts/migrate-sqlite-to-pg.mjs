#!/usr/bin/env node
/**
 * migrate-sqlite-to-pg.mjs — SQLite → PostgreSQL 数据迁移
 *
 * 用法:
 *   DATABASE_URL=postgres://user:pass@host:5432/chronos node scripts/migrate-sqlite-to-pg.mjs
 *
 * 步骤:
 *   1. 连接 SQLite (读取 CHRONOS.db)
 *   2. 连接 PostgreSQL (写入)
 *   3. 在 PG 中建表 (DDL)
 *   4. 逐表迁移数据
 *   5. 验证行数
 */

import Database from "better-sqlite3";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH =
  process.env.SQLITE_PATH || path.join(__dirname, "..", "chronos.db");
const PG_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:5432/chronos";

const sqlite = new Database(DB_PATH);

const { Pool } = pg;
const pool = new Pool({ connectionString: PG_URL });

// ──── DDL ────
const DDL = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    passwordHash TEXT,
    role TEXT DEFAULT 'user',
    tokenVersion INTEGER DEFAULT 0,
    lastSignedIn TEXT,
    createdAt TEXT,
    updatedAt TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS workspaces (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT, settings TEXT,
    createdAt TEXT, updatedAt TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS workspaceMembers (
    id SERIAL PRIMARY KEY,
    workspaceId INTEGER NOT NULL REFERENCES workspaces(id),
    userId INTEGER NOT NULL REFERENCES users(id),
    role TEXT DEFAULT 'member',
    createdAt TEXT, updatedAt TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL, workspaceId INTEGER NOT NULL,
    ownerId INTEGER, visibility TEXT DEFAULT 'private',
    status TEXT DEFAULT 'active',
    settings TEXT, createdAt TEXT, updatedAt TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS projectMembers (
    id SERIAL PRIMARY KEY,
    projectId INTEGER NOT NULL REFERENCES projects(id),
    userId INTEGER NOT NULL REFERENCES users(id),
    role TEXT DEFAULT 'member',
    createdAt TEXT, updatedAt TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS system_roles (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
    system_role TEXT NOT NULL, created_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
    session_id_hash TEXT NOT NULL,
    ip_address TEXT, user_agent TEXT, device TEXT,
    login_at TIMESTAMPTZ, last_active_at TIMESTAMPTZ,
    logout_at TIMESTAMPTZ, status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS activity_events (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
    workspace_id INTEGER, session_id TEXT,
    source TEXT DEFAULT 'USER', category TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT, resource_id TEXT,
    level TEXT DEFAULT 'INFO',
    metadata JSONB, ip_address TEXT,
    request_id TEXT, status TEXT DEFAULT 'SUCCESS',
    created_at TIMESTAMPTZ
  )`,
];

async function main() {
  console.log("[migrate] Connecting to PostgreSQL...");
  const client = await pool.connect();

  console.log("[migrate] Creating tables...");
  for (const ddl of DDL) {
    await client.query(ddl);
  }
  console.log("[migrate] Tables created.");

  // ──── Data Migration ────
  const TABLES = [
    "users",
    "workspaces",
    "workspaceMembers",
    "projects",
    "projectMembers",
    "system_roles",
    "user_sessions",
    "activity_events",
  ];

  for (const table of TABLES) {
    try {
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      if (rows.length === 0) {
        console.log(`  ${table}: 0 rows (skip)`);
        continue;
      }

      const columns = Object.keys(rows[0]);
      const placeholders = columns.map((_, i) => "$" + (i + 1)).join(", ");
      const insertSQL = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

      for (const row of rows) {
        const values = columns.map(c => row[c]);
        await client.query(insertSQL, values);
      }
      console.log(`  ${table}: ${rows.length} rows migrated`);
    } catch (e) {
      console.warn(`  ${table}: SKIPPED - ${e.message}`);
    }
  }

  const pgCount = await client.query(`
    SELECT 'users' AS t, COUNT(*) AS c FROM users
    UNION ALL SELECT 'projects', COUNT(*) FROM projects
    UNION ALL SELECT 'activity_events', COUNT(*) FROM activity_events
  `);
  console.log("\n[migrate] Verification:");
  pgCount.rows.forEach(r => console.log(`  ${r.t}: ${r.c} rows`));

  client.release();
  await pool.end();
  console.log("\n[migrate] Done.");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
