#!/usr/bin/env bash
# Runs ON the server. Unpacks ~/receipts-code.tgz (made with `git archive`) over ~/receipts,
# keeps .env.local and the database, rebuilds and restarts the three services.
set -euo pipefail
rm -rf /tmp/rc && mkdir -p /tmp/rc && tar xzf ~/receipts-code.tgz -C /tmp/rc
cd /tmp/rc/receipts && tar cf - . | (cd ~/receipts && tar xf -)
cd ~/receipts && pnpm install --frozen-lockfile && pnpm build
sudo systemctl restart receipts-advisor receipts-worker receipts-web
echo DEPLOYED
