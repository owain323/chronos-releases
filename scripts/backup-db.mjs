// SQLite 备份脚本 — 定时执行或手动触发
// 用法: node scripts/backup-db.mjs [tag]
// cron: 0 2 * * * node /path/to/scripts/backup-db.mjs scheduled
//
// 数据库路径解析（与 scripts/init-db.mjs、drizzle.config.ts 行为对齐）:
//   1. 优先 process.env.DATABASE_URL，去掉 "file:" 前缀
//   2. 相对路径相对项目根目录解析
//   3. 缺省 <root>/chronos.db
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function resolveDbPath() {
  const url = process.env.DATABASE_URL || "";
  const p = url.replace(/^file:/, "");
  if (!p) return path.join(root, "chronos.db");
  return path.isAbsolute(p) ? p : path.resolve(root, p);
}

const TAG = process.argv[2] || "manual";
const DB_PATH = resolveDbPath();
const BACKUP_DIR = path.join(root, "backups");

if (!fs.existsSync(DB_PATH)) {
  console.error(`❌ 数据库文件不存在: ${DB_PATH}`);
  process.exit(1);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const date = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backupPath = path.join(BACKUP_DIR, `chronos-${TAG}-${date}.db`);

const db = new Database(DB_PATH);
try {
  const safePath = backupPath.replace(/\\/g, "\\\\").replace(/'/g, "''");
  db.exec(`VACUUM INTO '${safePath}'`);
  console.log(`✅ 备份完成: ${backupPath}`);
} catch (e) {
  console.error(`❌ 备份失败: ${e instanceof Error ? e.message : String(e)}`);
  console.error(`[ALERT] VACUUM INTO 失败 — 检查磁盘空间和写入权限`);
  process.exit(2);
} finally {
  db.close();
}

// 保留最近 30 天的备份，删除旧文件
const files = fs
  .readdirSync(BACKUP_DIR)
  .filter(f => f.startsWith("chronos-") && f.endsWith(".db"));
if (files.length > 30) {
  files
    .sort()
    .slice(0, files.length - 30)
    .forEach(f => {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
      console.log(`🗑 删除旧备份: ${f}`);
    });
}
