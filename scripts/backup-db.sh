#!/bin/bash
# 服务器数据库备份 — 部署/迁移前必跑
# 用法: bash scripts/backup-db.sh [tag]
#
# 修复记录:
#   - 统一库路径常量（小写 chronos.db，与 chronos.service / deploy-rollback.sh 一致；
#     旧配置曾写 CHRONOS.db，Linux 下 SQLite 会静默创建并打开第二个空库）
#   - WAL 活库不再裸 cp：优先调用 backup-db.mjs（VACUUM INTO 在线一致性备份，
#     含 WAL 内容且自动保留最近 30 份）；兜底先 wal_checkpoint(TRUNCATE) 再拷贝
#   - set -euo pipefail：任何一步失败即非零退出，不再用 || true 掩盖错误

set -euo pipefail

TAG=${1:-"pre-deploy"}
APP_DIR="/opt/CHRONOS"
BACKUP_DIR="$APP_DIR/backups"
DB_PATH="$APP_DIR/chronos.db"
TS=$(date +%Y%m%d-%H%M%S)
DEST="$BACKUP_DIR/chronos-${TAG}-${TS}.db"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_PATH" ]; then
  echo "[backup][FATAL] 数据库文件不存在: $DB_PATH" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/backup-db.mjs" ] && command -v node >/dev/null 2>&1; then
  # 首选: VACUUM INTO（在线一致性备份），tag 透传用于文件命名
  (cd "$APP_DIR" && node "$SCRIPT_DIR/backup-db.mjs" "$TAG")
else
  # 兜底: checkpoint 截断 WAL 后拷贝主库文件
  (cd "$APP_DIR" && node -e "const db=require('better-sqlite3')(process.argv[1]);db.pragma('wal_checkpoint(TRUNCATE)');db.close();" "$DB_PATH")
  cp "$DB_PATH" "$DEST"
fi

echo "[backup] $DB_PATH -> $BACKUP_DIR/chronos-${TAG}-* (${TS})"
ls -la "$BACKUP_DIR" | tail -5
