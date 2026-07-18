/**
 * init-db.mjs — 版本化迁移 + 种子数据
 * 使用: node scripts/init-db.mjs
 *
 * 数据库路径解析（与 server/db/connection.ts、drizzle.config.ts 行为对齐）:
 *   1. 优先 process.env.DATABASE_URL，去掉 "file:" 前缀
 *   2. 相对路径相对项目根目录解析（docker 中 cwd=/app 即项目根）
 *   3. 缺省 <root>/chronos.db
 *   注意: docker-compose.yml 使用 file:/app/data/chronos.db。旧版本硬编码
 *   <root>/chronos.db，导致默认用户/工作区/RBAC 种子全写进不被使用的库文件。
 *
 * 迁移策略（修复: 生产不再使用 drizzle-kit push --force）:
 *   push --force 会自动接受破坏性 schema 变更，生产环境危险。
 *   drizzle/ 已有版本化迁移（meta/_journal.json + 0000_*.sql），但 drizzle-kit
 *   是 devDependency，生产镜像（npm ci --omit=dev）不含 drizzle-kit CLI，
 *   因此本脚本内置最小版本化迁移执行器:
 *     - 按 drizzle/meta/_journal.json 顺序执行 drizzle/<tag>.sql
 *     - SQL 按 --> statement-breakpoint 分割，单事务内执行
 *     - __drizzle_migrations 表跟踪已应用迁移（文件内容 sha256）
 *     - 存量库 baseline: 核心表已存在但无迁移记录时（历史库由 push 创建），
 *       将初始迁移标记为已应用，避免重放 CREATE TABLE 报错
 *   后续 schema 变更流程: 修改 drizzle/schema.ts → npx drizzle-kit generate →
 *   提交新生成的 drizzle/xxxx_*.sql → 部署时本脚本自动应用。
 */
import Database from "better-sqlite3";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// ──── 1. 解析数据库路径: 优先 DATABASE_URL (file: 前缀) ────
function resolveDbPath() {
  const url = process.env.DATABASE_URL || "";
  const p = url.replace(/^file:/, "");
  if (!p) return path.join(root, "chronos.db");
  return path.isAbsolute(p) ? p : path.resolve(root, p);
}
const dbPath = resolveDbPath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
console.log("[init] Database path:", dbPath);

// 1.1 创建/打开 DB 文件并设置 pragma
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ──── 2. 版本化迁移（drizzle/*.sql + meta/_journal.json）────
function runMigrations(db) {
  const journalPath = path.join(root, "drizzle", "meta", "_journal.json");
  if (!fs.existsSync(journalPath)) {
    console.log("[migrate] drizzle/meta/_journal.json 不存在，跳过迁移");
    return;
  }
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));

  db.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  const applied = new Set(
    db
      .prepare("SELECT hash FROM __drizzle_migrations")
      .all()
      .map(r => r.hash)
  );

  // baseline 检测: 存量库（历史上由 drizzle-kit push 创建）无迁移记录但核心表已存在
  const hasCoreTables = !!db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    )
    .get();
  const isBaseline = hasCoreTables && applied.size === 0;
  if (isBaseline) {
    console.log(
      "[migrate] 检测到存量库（无迁移记录），初始迁移将按 baseline 处理"
    );
  }

  for (const entry of journal.entries) {
    const sqlPath = path.join(root, "drizzle", `${entry.tag}.sql`);
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`[migrate] 迁移文件缺失: ${sqlPath}`);
    }
    const sql = fs.readFileSync(sqlPath, "utf8");
    const hash = crypto.createHash("sha256").update(sql).digest("hex");
    if (applied.has(hash)) {
      console.log(`[migrate] 已应用，跳过: ${entry.tag}`);
      continue;
    }
    if (isBaseline && entry.idx === 0) {
      console.log(
        `[migrate] baseline: 跳过初始迁移 ${entry.tag}，标记为已应用`
      );
      db.prepare(
        "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)"
      ).run(hash, Date.now());
      continue;
    }
    console.log(`[migrate] 应用迁移: ${entry.tag} ...`);
    const statements = sql
      .split("--> statement-breakpoint")
      .map(s => s.trim())
      .filter(Boolean);
    db.transaction(() => {
      for (const stmt of statements) db.exec(stmt);
      db.prepare(
        "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)"
      ).run(hash, Date.now());
    })();
    console.log(`[migrate] 完成: ${entry.tag}`);
  }
}
runMigrations(db);
db.close();

// ──── 3. 种子数据 ────
const db2 = new Database(dbPath);

// v4.0: user_sessions 表由 server/db/userSessions.ts 定义，迁移 SQL 未必覆盖
db2.exec(`CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  session_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL DEFAULT (datetime('now', '+7 days')),
  FOREIGN KEY (user_id) REFERENCES users(id)
)`);
const now = new Date().toISOString();

// 默认用户
db2
  .prepare(
    `INSERT OR IGNORE INTO users (openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .run(
    "local-dev-user",
    "本地用户",
    "local@chronos.dev",
    "local",
    "admin",
    now,
    now,
    now
  );

// 默认工作区
const ws = db2
  .prepare("SELECT id FROM workspaces WHERE slug = ?")
  .get("default");
if (!ws) {
  db2
    .prepare(
      "INSERT INTO workspaces (name, slug, createdBy, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)"
    )
    .run("默认工作区", "default", 1, now, now);
  const wsId = db2
    .prepare("SELECT id FROM workspaces WHERE slug = ?")
    .get("default").id;
  db2
    .prepare(
      "INSERT INTO workspace_members (workspaceId, userId, role, joinedAt) VALUES (?, 1, 'admin', ?)"
    )
    .run(wsId, now);
  db2
    .prepare("UPDATE projects SET workspaceId = ? WHERE workspaceId = 0")
    .run(wsId);
  console.log("[init] Default workspace created (id=" + wsId + ")");
}

// 4. RBAC 权限种子
const PERM_DEFS = [
  ["project", "create"],
  ["project", "read"],
  ["project", "update"],
  ["project", "delete"],
  ["task", "create"],
  ["task", "read"],
  ["task", "update"],
  ["task", "delete"],
  ["finance", "view"],
  ["finance", "edit"],
  ["member", "invite"],
  ["member", "remove"],
  ["workspace", "manage"],
];
const insertPerm = db2.prepare(
  "INSERT OR IGNORE INTO permissions (resource, action) VALUES (?, ?)"
);
for (const [r, a] of PERM_DEFS) insertPerm.run(r, a);

// 读取刚插入的权限 (含 id)
const permRows = db2
  .prepare("SELECT id, resource, action FROM permissions")
  .all();
const idOf = (resource, action) =>
  permRows.find(p => p.resource === resource && p.action === action)?.id;
const roleMap = {
  owner: permRows.map(p => p.id),
  admin: PERM_DEFS.filter(([r]) => r !== "workspace")
    .map(([r, a]) => idOf(r, a))
    .filter(Boolean),
  member: PERM_DEFS.filter(
    ([r, a]) =>
      (r === "project" || r === "task" || r === "finance") && a !== "delete"
  )
    .map(([r, a]) => idOf(r, a))
    .filter(Boolean),
  viewer: PERM_DEFS.filter(
    ([r, a]) =>
      (r === "project" || r === "task" || r === "finance") &&
      (a === "read" || a === "view")
  )
    .map(([r, a]) => idOf(r, a))
    .filter(Boolean),
};
const insertRP = db2.prepare(
  "INSERT OR IGNORE INTO role_permissions (role, permissionId) VALUES (?, ?)"
);
for (const [role, pids] of Object.entries(roleMap)) {
  for (const pid of pids) insertRP.run(role, pid);
}

db2.close();
console.log("Database initialized successfully at:", dbPath);
