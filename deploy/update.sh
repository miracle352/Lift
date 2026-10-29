#!/usr/bin/env bash
# Pull the latest code, rebuild, restart both services.
set -euo pipefail
cd "$HOME/receipts"
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
sudo systemctl restart receipts-advisor receipts-worker receipts-web
echo "updated to $(git rev-parse --short HEAD)"
