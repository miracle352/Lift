#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 24.04 EC2 instance (t3.small or t4g.small).
# Runs the arena worker + the web app 24/7, with HTTPS via Caddy at https://<public-ip>.sslip.io
#
#   1. scp your .env.local to the instance:   scp -i key.pem .env.local ubuntu@<ip>:~/.env.local
#   2. ssh in and run:   curl -fsSL https://raw.githubusercontent.com/... (or copy this file) | bash
#      (the repo is private: this script clones with a GitHub token you paste when asked)
set -euo pipefail

REPO_DIR="$HOME/receipts"
echo "==> packages"
sudo apt-get update -y
sudo apt-get install -y git curl debian-keyring debian-archive-keyring apt-transport-https build-essential

echo "==> Node 22 + pnpm"
if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo corepack enable
corepack prepare pnpm@10.28.0 --activate

echo "==> swap (Next.js builds need more than 1 GB)"
if ! swapon --show | grep -q swapfile; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

echo "==> code"
if [ ! -d "$REPO_DIR/.git" ]; then
  read -rsp "GitHub token with read access to miracle352/Receipts: " GH_TOKEN; echo
  git clone "https://x-access-token:${GH_TOKEN}@github.com/miracle352/Receipts.git" "$REPO_DIR"
  git -C "$REPO_DIR" remote set-url origin https://github.com/miracle352/Receipts.git
fi
cp -n "$HOME/.env.local" "$REPO_DIR/.env.local" || true
chmod 600 "$REPO_DIR/.env.local"
cd "$REPO_DIR"
pnpm install --frozen-lockfile
pnpm build

echo "==> systemd services"
sudo tee /etc/systemd/system/receipts-worker.service >/dev/null <<UNIT
[Unit]
Description=Receipts arena worker
After=network-online.target
[Service]
User=$USER
WorkingDirectory=$REPO_DIR
ExecStart=$(command -v pnpm) arena worker
Restart=always
RestartSec=10
Environment=NODE_ENV=production
[Install]
WantedBy=multi-user.target
UNIT
sudo tee /etc/systemd/system/receipts-web.service >/dev/null <<UNIT
[Unit]
Description=Receipts web app
After=network-online.target
[Service]
User=$USER
WorkingDirectory=$REPO_DIR
ExecStart=/usr/bin/env bash -c 'set -a; source .env.local; exec $(command -v pnpm) start -p 3000'
Restart=always
RestartSec=10
Environment=NODE_ENV=production
[Install]
WantedBy=multi-user.target
UNIT

echo "==> Caddy (HTTPS)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update -y && sudo apt-get install -y caddy
fi
IP=$(curl -s https://checkip.amazonaws.com)
sudo tee /etc/caddy/Caddyfile >/dev/null <<CADDY
${IP}.sslip.io {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000
}
CADDY

sudo systemctl daemon-reload
sudo systemctl enable --now receipts-worker receipts-web
sudo systemctl restart caddy
echo
echo "Done. Site: https://${IP}.sslip.io   Logs: journalctl -u receipts-worker -f"
