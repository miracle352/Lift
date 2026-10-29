#!/usr/bin/env bash
# Snapshot the arena database to the private branch `arena-data` (used once, to move the arena to the server).
# Stop the worker first so nothing writes during the copy.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -f /tmp/arena-snapshot.db
node -e "require('@libsql/client').createClient({url:'file:./local.db'}).execute(\"VACUUM INTO '/tmp/arena-snapshot.db'\").then(()=>console.log('vacuumed'))"
gzip -9 -c /tmp/arena-snapshot.db > /tmp/arena.db.gz
TMP=$(mktemp -d)
git -C "$TMP" init -q && git -C "$TMP" checkout -q -b arena-data
cp /tmp/arena.db.gz "$TMP/arena.db.gz"
git -C "$TMP" add arena.db.gz
git -C "$TMP" -c user.name=Claude -c user.email=noreply@anthropic.com commit -qm "arena database snapshot $(date -u +%FT%TZ)"
git -C "$TMP" push -q -f "$(git remote get-url origin)" arena-data
echo "pushed $(du -h /tmp/arena.db.gz | cut -f1) snapshot to branch arena-data"
