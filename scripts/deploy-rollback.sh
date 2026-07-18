#!/bin/bash
# deploy-rollback.sh — L3 自动回滚部署脚本
# 用法: ./scripts/deploy-rollback.sh [SERVER] [HEALTH_URL]
# 流程: 备份 → 部署 → 健康检查 (重试×5) → 失败自动回滚
#
# 修复记录:
#   P0: 原 Phase 6 以 err() 开头，err() 内部 exit 1，回滚逻辑是死代码。
#       改为 warn 后继续执行回滚；仅当回滚本身失败时才 err 退出。
#   高: 备份改为先在服务器端 PRAGMA wal_checkpoint(TRUNCATE) 再拷贝，
#       避免裸 cp WAL 活库拿到不含 WAL 内容的旧主库文件；
#       用显式存在性检查替代 || true，不再掩盖真实拷贝错误。
#   高: 统一库路径常量（小写 chronos.db，与 chronos.service / backup-db.sh 一致）。

set -euo pipefail

SERVER="${1:-root@101.35.234.57}"
HEALTH_URL="${2:-https://chronos.owain32380.cn/api/health}"
RETRY_COUNT=5
RETRY_DELAY=3
BACKUP_DIR="/tmp/chronos-rollback-$(date +%Y%m%d-%H%M%S)"

# ──── 统一路径常量（Linux 大小写敏感，必须与实际文件一致）────
APP_DIR="/opt/CHRONOS"
DB_PATH="$APP_DIR/chronos.db"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $*"; }
err()  { echo -e "${RED}[FATAL]${NC} $*"; exit 1; }

# ──── Phase 1: 构建 ────
log "Phase 1: 构建项目..."
npm run build || err "构建失败"

# ──── Phase 2: 备份 ────
log "Phase 2: 备份服务器现有文件..."
# 数据库是 WAL 模式活库：先 checkpoint 截断 WAL，再拷贝主库文件。
# 首次部署时文件可能不存在 —— 用 if 守卫显式跳过，而不是 || true 吞错。
ssh "$SERVER" "bash -s" <<EOF
set -euo pipefail
mkdir -p "$BACKUP_DIR"
if [ -f "$DB_PATH" ]; then
  cd "$APP_DIR"
  node -e "const db=require('better-sqlite3')(process.argv[1]);db.pragma('wal_checkpoint(TRUNCATE)');db.close();" "$DB_PATH"
  cp "$DB_PATH" "$BACKUP_DIR/chronos.db"
  echo "[backup] db checkpointed + copied"
else
  echo "[backup] 首次部署？未找到 $DB_PATH，跳过数据库备份"
fi
if [ -f "$APP_DIR/dist/index.js" ]; then
  cp "$APP_DIR/dist/index.js" "$BACKUP_DIR/index.js"
fi
if [ -d "$APP_DIR/dist/public" ]; then
  cp -r "$APP_DIR/dist/public" "$BACKUP_DIR/public"
fi
EOF

# ──── Phase 3: 同步文件 ────
log "Phase 3: 同步文件到服务器..."
scp dist/index.js "$SERVER:$APP_DIR/dist/" || err "scp index.js 失败"

# 同步 public 目录（如果存在）
if [ -d "dist/public" ]; then
  ssh "$SERVER" "rm -rf $APP_DIR/dist/public"
  scp -r dist/public "$SERVER:$APP_DIR/dist/" || err "scp public 失败"
fi

# ──── Phase 4: 重启服务 ────
log "Phase 4: 重启服务..."
ssh "$SERVER" "systemctl restart chronos" || warn "systemctl restart 返回非零"

# ──── Phase 5: 健康检查 ────
log "Phase 5: 健康检查 ($HEALTH_URL)..."
for i in $(seq 1 $RETRY_COUNT); do
  sleep $RETRY_DELAY
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" --max-time 5 || echo "000")
  if [ "$STATUS" = "200" ]; then
    log "健康检查通过 (attempt $i/$RETRY_COUNT)"
    log "部署成功! 备份: $BACKUP_DIR"
    exit 0
  fi
  warn "健康检查失败 (attempt $i/$RETRY_COUNT, status=$STATUS)"
done

# ──── Phase 6: 自动回滚 ────
# 修复: 原为 err(...) 直接退出，以下回滚逻辑永远不可达。改为 warn 后继续。
warn "健康检查持续失败，开始自动回滚..."
log "回滚: 恢复备份文件..."
if ! ssh "$SERVER" "bash -s" <<EOF
set -euo pipefail
if [ -f "$BACKUP_DIR/index.js" ]; then
  cp "$BACKUP_DIR/index.js" "$APP_DIR/dist/index.js"
else
  echo "[rollback][FATAL] 备份中无 index.js: $BACKUP_DIR" >&2
  exit 1
fi
if [ -d "$BACKUP_DIR/public" ]; then
  rm -rf "$APP_DIR/dist/public"
  cp -r "$BACKUP_DIR/public" "$APP_DIR/dist/public"
fi
systemctl restart chronos
EOF
then
  err "回滚执行失败 (ssh/文件恢复/systemctl)。备份保留在: $BACKUP_DIR，需人工介入"
fi

log "回滚完成，验证回滚后健康状态..."
sleep 3
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" --max-time 10 || echo "000")
if [ "$STATUS" = "200" ]; then
  log "回滚成功，服务已恢复"
  # 部署本身已失败：以非零退出，避免 CI/调用方误判为成功
  exit 1
else
  err "回滚后服务仍不可用 (status=$STATUS). 备份: $BACKUP_DIR"
fi
