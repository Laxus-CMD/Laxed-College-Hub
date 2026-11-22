#!/usr/bin/env bash
# Encrypted logical backup of the College Hub database, with retention.
#
#   DATABASE_URL=postgres://… BACKUP_PASSPHRASE=… ./server/scripts/backup.sh [output-dir]
#
# Writes college-hub-YYYYMMDDTHHMMSSZ.dump.gpg (pg_dump custom format, AES-256 with gpg),
# then deletes backups in the output dir older than RETENTION_DAYS (default 30).
# The dump holds password hashes and emails, so it is always encrypted.
#
# Restore:
#   gpg --batch --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" -d FILE.dump.gpg > restore.dump
#   pg_restore --clean --if-exists --no-owner -d "$TARGET_DATABASE_URL" restore.dump
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL}"
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE}"
OUT_DIR="${1:-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$OUT_DIR"
umask 077
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/college-hub-$STAMP.dump.gpg"

pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" \
  | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 --symmetric --cipher-algo AES256 -o "$FILE" 3<<<"$BACKUP_PASSPHRASE"

# Prove the backup is readable before trusting it.
gpg --batch --pinentry-mode loopback --passphrase-fd 3 -d "$FILE" 3<<<"$BACKUP_PASSPHRASE" 2>/dev/null | pg_restore --list > /dev/null

echo "Wrote $FILE ($(du -h "$FILE" | cut -f1))"
find "$OUT_DIR" -name 'college-hub-*.dump.gpg' -type f -mtime "+$RETENTION_DAYS" -print -delete
