#!/bin/bash
# scripts/restore-sqlite.sh — CHRONOS SQLite 数据库还原 (v4.3 WO-QA-1)
# 用法: bash scripts/restore-sqlite.sh <backup-file-path>
# 示例: bash scripts/restore-sqlite.sh /opt/CHRONOS/backups/chronos-v43-pre-deploy-20260718-192000.db

set -euo pipefail

BACKUP_FILE="${1:-}"
CHRONOS_DIR="/opt/CHRONOS"
DB_FILE="$CHRONOS_DIR/chronos.db"
DB_WAL="$CHRONOS_DIR/chronos.db-wal"
DB_SHM="$CHRONOS_DIR/chronos.db-shm"

if [ -z "$BACKUP_FILE" ]; then
  echo "用法: $0 <backup-file-path>"
  echo "可用备份:"
  ls -lh "$CHRONOS_DIR/backups/" 2>/dev/null || echo "  (无备份)"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ 备份文件不存在: $BACKUP_FILE"
  exit 1
fi

echo "⏳ 停止 chronos 服务..."
systemctl stop chronos

echo "📦 备份当前 DB (安全回退)..."
cp "$DB_FILE" "$DB_FILE.bak-$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
rm -f "$DB_WAL" "$DB_SHM" 2>/dev/null || true

echo "🔄 还原备份: $BACKUP_FILE"
cp "$BACKUP_FILE" "$DB_FILE"

echo "🚀 启动 chronos 服务..."
systemctl start chronos

sleep 2
if systemctl is-active --quiet chronos; then
  echo "✅ 还原成功，服务已启动"
else
  echo "❌ 服务启动失败，回滚 DB..."
  LATEST_BAK=$(ls -t "$DB_FILE.bak-"* 2>/dev/null | head -1)
  if [ -n "$LATEST_BAK" ]; then
    cp "$LATEST_BAK" "$DB_FILE"
    systemctl start chronos
    echo "已回滚到: $LATEST_BAK"
  else
    echo "⚠️ 无可用回退备份，请手动处理"
  fi
  exit 1
fi
