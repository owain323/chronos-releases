// 数据库连接 — SQLite (生产) / PostgreSQL (可选 via DB_TYPE=postgres)
import { eq, and, inArray, or, desc, sql } from "drizzle-orm";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../config";
import { logger } from "../lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbType = config.db.type;

// ──── SQLite 实例 ────
const dbPath =
  config.db.url.replace("file:", "") ||
  path.join(__dirname, "..", "..", "CHRONOS.db");
export const sqlite = new Database(path.resolve(dbPath));
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000"); // 等锁5秒，不直接抛 SQLITE_BUSY
sqlite.pragma("wal_autocheckpoint = 1000");

// v3.1: SQLite 索引
const INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_tasks_projectId ON tasks(projectId)",
  "CREATE INDEX IF NOT EXISTS idx_tasks_columnId ON tasks(columnId)",
  "CREATE INDEX IF NOT EXISTS idx_tasks_assigneeId ON tasks(assigneeId)",
  "CREATE INDEX IF NOT EXISTS idx_costEntries_projectId ON costEntries(projectId)",
  "CREATE INDEX IF NOT EXISTS idx_revenueEntries_projectId ON revenueEntries(projectId)",
  "CREATE INDEX IF NOT EXISTS idx_expenseEntries_projectId ON expenseEntries(projectId)",
  "CREATE INDEX IF NOT EXISTS idx_journalEntries_projectId ON journalEntries(projectId)",
  "CREATE INDEX IF NOT EXISTS idx_fileSnapshots_projectId ON fileSnapshots(projectId)",
  "CREATE INDEX IF NOT EXISTS idx_kanbanColumns_projectId ON kanbanColumns(projectId)",
  "CREATE INDEX IF NOT EXISTS idx_projectMembers_projectId ON projectMembers(projectId)",
  "CREATE INDEX IF NOT EXISTS idx_subtasks_taskId ON subtasks(taskId)",
  // v4.0: 高频 JOIN/WHERE 列（表名/列名已核对 drizzle/schema.ts 与
  // server/db/userSessions.ts：workspace_members、user_sessions(user_id)）
  "CREATE INDEX IF NOT EXISTS idx_workspaceMembers_userId ON workspace_members(userId)",
  "CREATE INDEX IF NOT EXISTS idx_workspaceMembers_workspaceId ON workspace_members(workspaceId)",
  "CREATE INDEX IF NOT EXISTS idx_userSessions_userId ON user_sessions(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_audit_logs_userId ON audit_logs(userId)",
  "CREATE INDEX IF NOT EXISTS idx_audit_logs_createdAt ON audit_logs(createdAt)",
  "CREATE INDEX IF NOT EXISTS idx_vendors_projectId ON vendors(projectId)",
  "CREATE INDEX IF NOT EXISTS idx_customers_projectId ON customers(projectId)",
  "CREATE INDEX IF NOT EXISTS idx_costEntries_date ON costEntries(date)",
  "CREATE INDEX IF NOT EXISTS idx_revenueEntries_date ON revenueEntries(date)",
];
for (const idx of INDEXES) {
  try {
    sqlite.exec(idx);
  } catch {
    /* table may not exist */
  }
}

// v3.1: 缺失表自修复 — 新表已迁移到 drizzle/schema.ts，由 drizzle-kit push 管理
// 保留此数组为空以备将来从非 schema 管理的表
const MISSING_TABLES: string[] = [];
for (const ddl of MISSING_TABLES) {
  try {
    sqlite.exec(ddl);
  } catch (err) {
    console.error("[db] MISSING_TABLES DDL failed:", err);
  }
}

// FP-01: 财务模块 schema 运行时自修复（无需 drizzle-kit push, 老库自动补表/补列）
const FP_SELF_REPAIR = [
  // accounts.cashFlowCategory 列补齐
  (() => {
    try {
      sqlite.exec("ALTER TABLE accounts ADD COLUMN cashFlowCategory TEXT");
    } catch {
      /* 已存在 */
    }
  })(),
  // budgets 表
  `CREATE TABLE IF NOT EXISTS budgets (id INTEGER PRIMARY KEY AUTOINCREMENT, projectId INTEGER NOT NULL, accountId INTEGER NOT NULL, period TEXT NOT NULL, amount REAL NOT NULL, createdAt TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_unq ON budgets(projectId, accountId, period)`,
  // closings 表
  `CREATE TABLE IF NOT EXISTS closings (id INTEGER PRIMARY KEY AUTOINCREMENT, projectId INTEGER NOT NULL, period TEXT NOT NULL, closedBy INTEGER NOT NULL, netIncome REAL NOT NULL, entryCount INTEGER NOT NULL, summary TEXT, closedAt TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_closings_unq ON closings(projectId, period)`,
  // bot_inbox table (v4.0)
  `CREATE TABLE IF NOT EXISTS bot_inbox (id INTEGER PRIMARY KEY AUTOINCREMENT, bot_user_id TEXT NOT NULL, web_user_id INTEGER, workspace_id INTEGER, project_id INTEGER, original_name TEXT NOT NULL, mime TEXT, size INTEGER, temp_path TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', received_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, committed_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS idx_bot_inbox_bot_user ON bot_inbox(bot_user_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_bot_inbox_expires ON bot_inbox(expires_at, status)`,
  // v4.1 T4: amount→integer cents columns (自修复, 与 real 列并存)
  (() => { try { sqlite.exec("ALTER TABLE costEntries ADD COLUMN amount_cents INTEGER"); } catch { /* exists */ } })(),
  (() => { try { sqlite.exec("ALTER TABLE revenueEntries ADD COLUMN amount_cents INTEGER"); } catch { /* exists */ } })(),
  (() => { try { sqlite.exec("ALTER TABLE expenseEntries ADD COLUMN amount_cents INTEGER"); } catch { /* exists */ } })(),
  (() => { try { sqlite.exec("ALTER TABLE journalEntries ADD COLUMN debit_amount_cents INTEGER"); } catch { /* exists */ } })(),
  (() => { try { sqlite.exec("ALTER TABLE journalEntries ADD COLUMN credit_amount_cents INTEGER"); } catch { /* exists */ } })(),
  (() => { try { sqlite.exec("ALTER TABLE budgets ADD COLUMN amount_cents INTEGER"); } catch { /* exists */ } })(),
  (() => { try { sqlite.exec("ALTER TABLE closings ADD COLUMN net_income_cents INTEGER"); } catch { /* exists */ } })(),
  // closings.approvedBy / approvedAt (四眼原则)
  (() => {
    try {
      sqlite.exec("ALTER TABLE closings ADD COLUMN approvedBy INTEGER");
    } catch {
      /* 已存在 */
    }
  })(),
  (() => {
    try {
      sqlite.exec("ALTER TABLE closings ADD COLUMN approvedAt TEXT");
    } catch {
      /* 已存在 */
    }
  })(),
  // users.emailVerified / notificationPrefs (L2/P3)
  (() => {
    try {
      sqlite.exec(
        "ALTER TABLE users ADD COLUMN emailVerified INTEGER DEFAULT 0"
      );
    } catch {
      /* 已存在 */
    }
  })(),
  (() => {
    try {
      sqlite.exec("ALTER TABLE users ADD COLUMN notificationPrefs TEXT");
    } catch {
      /* 已存在 */
    }
  })(),
  // users.displayName / avatarUrl / bio (W3 profile页)
  (() => {
    try {
      sqlite.exec("ALTER TABLE users ADD COLUMN displayName TEXT");
    } catch {
      /* 已存在 */
    }
  })(),
  (() => {
    try {
      sqlite.exec("ALTER TABLE users ADD COLUMN avatarUrl TEXT");
    } catch {
      /* 已存在 */
    }
  })(),
  (() => {
    try {
      sqlite.exec("ALTER TABLE users ADD COLUMN bio TEXT");
    } catch {
      /* 已存在 */
    }
  })(),
];
for (const ddl of FP_SELF_REPAIR) {
  if (typeof ddl === "string") {
    try {
      sqlite.exec(ddl);
    } catch {
      /* 已存在则忽略 */
    }
  }
}

// V3.8: SQL 慢查询日志 — patch prepare 对 run/all/get/iterate 计时，超阈值用 pino 打日志
const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS || 50);
// better-sqlite3 prepare(sql) 仅接收单参，无 rest；用普通函数包装避免展开报错
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _origPrepare = sqlite.prepare.bind(sqlite) as (sql: string) => any;
const TIMED_STMT_METHODS = new Set(["run", "all", "get", "iterate"]);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
sqlite.prepare = ((sqlStr: string): any => {
  const stmt = _origPrepare(sqlStr);
  // 缓存每个属性解析结果，避免每次访问重复分配
  const cache = new Map<string | symbol, unknown>();
  return new Proxy(stmt, {
    get(target, prop) {
      if (cache.has(prop)) return cache.get(prop);
      // 通过 target[prop] 解析：getter 以真实 statement 为 this，函数先取引用
      const value = (target as Record<string | symbol, unknown>)[prop];
      let wrapped: unknown;
      if (typeof value === "function") {
        if (TIMED_STMT_METHODS.has(prop as string)) {
          // 计时包装：保持 this = 真实 statement
          wrapped = (...args: unknown[]) => {
            const start = Date.now();
            try {
              return (value as (...a: unknown[]) => unknown).apply(
                target,
                args
              );
            } finally {
              const dur = Date.now() - start;
              if (dur >= SLOW_QUERY_MS) {
                logger.warn(
                  { type: "slow_query", ms: dur },
                  `slow query ${dur}ms: ${String(sqlStr).slice(0, 200)}`
                );
              }
            }
          };
        } else {
          // 其余方法（如 raw）绑定到真实 statement，避免 native Illegal invocation
          wrapped = (value as (...a: unknown[]) => unknown).bind(target);
        }
      } else {
        wrapped = value;
      }
      cache.set(prop, wrapped);
      return wrapped;
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

const _rawDb = drizzle(sqlite);

// v4.0: 全局 LIMIT 守护 — 无 .limit() 的 .all() 打警告(不静默截断)
// v3.9.2 W3修复: 去掉静默 LIMIT 50, 改为 console.warn 提示调用方显式传 limit
const MAX_LIMIT = 500;

function wrapWithLimitGuard(db: typeof _rawDb): typeof _rawDb {
  return new Proxy(db, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof original !== "function") return original;
      if (prop === "select") {
        return (...args: unknown[]) => {
          const query = (original as any).apply(target, args);
          let hasLimit = false;
          return new Proxy(query, {
            get(obj: any, p, recv) {
              if (p === "limit") {
                hasLimit = true;
                const origLimit = obj.limit;
                return (n: number) => {
                  const clamped = Math.min(n, MAX_LIMIT);
                  return origLimit.call(obj, clamped);
                };
              }
              if (p === "all") {
                const origAll = obj.all;
                return (...a: any[]) => {
                  if (!hasLimit) {
                    console.warn(
                      "[DB] .all() called without .limit() — recommend explicit limit to avoid large result sets"
                    );
                  }
                  return (origAll || obj.all).call(obj, ...a);
                };
              }
              const val = Reflect.get(obj, p, recv);
              return typeof val === "function" ? val.bind(obj) : val;
            },
          });
        };
      }
      return typeof original === "function" ? original.bind(target) : original;
    },
  });
}

export const db = wrapWithLimitGuard(_rawDb);

// ──── PostgreSQL 可选懒加载 ────
let _pgDb: any = null;

export async function getPgDb() {
  if (_pgDb) return _pgDb;
  const { drizzle: pgDrizzle } = await import("drizzle-orm/node-postgres");
  // @ts-expect-error — optional pg dep
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: config.db.url || "postgres://localhost:5432/chronos",
    max: config.db.poolMax,
  });
  _pgDb = pgDrizzle(pool);
  return _pgDb;
}

export function getDb() {
  return dbType === "postgres" ? _pgDb || db : db;
}

export { eq, and, inArray, or, desc, sql };
