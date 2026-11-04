#!/usr/bin/env bash
# Runs ON the server. Unpacks ~/receipts-code.tgz (made with `git archive`) over ~/receipts, removing files that are no
# longer in the repo but keeping .env.local, the database, node_modules and the build cache; rebuilds and restarts.
set -euo pipefail
rm -rf /tmp/rc && mkdir -p /tmp/rc && tar xzf ~/receipts-code.tgz -C /tmp/rc
rsync -a --delete --exclude .env.local --exclude 'local.db*' --exclude node_modules --exclude .next --exclude '*.log' /tmp/rc/receipts/ ~/receipts/
cd ~/receipts && pnpm install --frozen-lockfile && pnpm build
sudo systemctl restart receipts-advisor receipts-worker receipts-web
echo DEPLOYED
