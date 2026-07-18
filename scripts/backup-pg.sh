#!/bin/bash
# CHRONOS PostgreSQL 自动备份脚本
# 用法: crontab -e → 0 3 * * * /opt/CHRONOS/scripts/backup-pg.sh

BACKUP_DIR="/opt/CHRONOS/backups"
DB_NAME="chronos"
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/chronos_${TIMESTAMP}.sql.gz"

pg_dump "$DB_NAME" | gzip > "$FILE"

# 保留最近 30 天
find "$BACKUP_DIR" -name "chronos_*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "[$(date)] Backup: $FILE ($(du -h "$FILE" | cut -f1))"
