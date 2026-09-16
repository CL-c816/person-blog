#!/bin/bash
# ============================================================
# my-space 备份脚本（增强版）
#  - 数据库在线一致性备份（better-sqlite3 backup API，WAL 安全）
#  - 一并备份 public/uploads（照片/头像），避免服务器故障丢图
#  - 保留 N 天，自动清理旧备份
# 建议配合 crontab 周期执行，例如每天 03:30：
#   30 3 * * * /opt/my-space/backup-db.sh >> /opt/my-space/backups/cron.log 2>&1
# ============================================================
set -euo pipefail

APP_DIR=/opt/my-space
BACKUP_DIR="$APP_DIR/backups"
DATA_DIR="$APP_DIR/data"
UPLOADS_DIR="$APP_DIR/public/uploads"
KEEP_DAYS=14
TS=$(date +%Y%m%d-%H%M)

mkdir -p "$BACKUP_DIR"

# 定位 node（兼容系统安装与 nvm，cron 非交互环境可能无 node 在 PATH）
if command -v node >/dev/null 2>&1; then
  NODE_BIN=node
else
  NODE_BIN=$(find /root/.nvm /home/ubuntu/.nvm /usr/local/bin -name node -type f 2>/dev/null | head -1)
fi
[ -z "$NODE_BIN" ] && { echo "ERROR: 未找到 node，备份中止"; exit 1; }

# 1) 数据库在线一致性备份（WAL 模式下 cp 可能不一致，用 backup API）
DB_BACKUP="$BACKUP_DIR/space-$TS.sqlite"
( cd "$APP_DIR" && "$NODE_BIN" -e "const db=require('better-sqlite3')('data/space.db'); db.backup(process.argv[1]).then(()=>{console.log('DB_BACKUP_OK')}).catch(e=>{console.error(e);process.exit(1)})" "$DB_BACKUP" )
gzip -f "$DB_BACKUP"

# 2) 上传文件（照片/头像）打包备份
UP_BACKUP="$BACKUP_DIR/uploads-$TS.tgz"
if [ -d "$UPLOADS_DIR" ]; then
  tar czf "$UP_BACKUP" -C "$UPLOADS_DIR" . 2>/dev/null || true
fi

# 3) 清理超过保留天数的旧备份
find "$BACKUP_DIR" -name 'space-*.sqlite.gz' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'uploads-*.tgz' -mtime +"$KEEP_DAYS" -delete

echo "Backup done: $DB_BACKUP.gz + $UP_BACKUP (保留 $KEEP_DAYS 天)"
