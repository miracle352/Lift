#!/usr/bin/env bash
# Pull the latest code, rebuild, restart both services.
set -euo pipefail
cd "$HOME/receipts"
if [ -z "${GH_TOKEN:-}" ]; then read -rsp "GitHub token: " GH_TOKEN; echo; fi
git pull -q --ff-only "https://x-access-token:${GH_TOKEN}@github.com/miracle352/Receipts.git" main
pnpm install --frozen-lockfile
pnpm build
sudo systemctl restart receipts-advisor receipts-worker receipts-web
echo "updated to $(git rev-parse --short HEAD)"
