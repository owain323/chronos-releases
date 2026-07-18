#!/bin/bash
# CHRONOS PG 恢复脚本
# 用法: scripts/restore-pg.sh backups/chronos_20260716_030000.sql.gz

if [ -z "$1" ]; then
  echo "Usage: $0 <backup-file.sql.gz>"
  echo "Example: $0 backups/chronos_20260716_030000.sql.gz"
  exit 1
fi

BACKUP="$1"
DB_NAME="${DB_NAME:-chronos}"

echo "⚠️  This will DROP and recreate database '$DB_NAME'"
echo "   Backup: $BACKUP"
read -p "Continue? (y/N) " confirm
if [ "$confirm" != "y" ]; then exit 0; fi

echo "Restoring..."
gunzip -c "$BACKUP" | psql "$DB_NAME"
echo "✅ Restore complete. Restarting chronos..."
systemctl restart chronos
