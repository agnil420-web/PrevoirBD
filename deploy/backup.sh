#!/usr/bin/env bash
# Safe nightly copy of the database. Cron example (every night at 02:30):
#   30 2 * * * /var/www/prevoir-shop/deploy/backup.sh
set -euo pipefail
APP=/var/www/prevoir-shop
OUT=/var/backups/prevoir
mkdir -p "$OUT"
sqlite3 "$APP/data/prevoir.db" ".backup '$OUT/prevoir-$(date +%F).db'"
find "$OUT" -name 'prevoir-*.db' -mtime +14 -delete
