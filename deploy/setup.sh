#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root: sudo bash deploy/setup.sh" >&2
  exit 1
fi

APP_USER="${SUDO_USER:-ubuntu}"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
SWAP_FILE="/swapfile"

export DEBIAN_FRONTEND=noninteractive

if ! swapon --show=NAME --noheadings | grep -q "^${SWAP_FILE}$"; then
  if [ ! -f "$SWAP_FILE" ]; then
    fallocate -l 2G "$SWAP_FILE"
    chmod 600 "$SWAP_FILE"
    mkswap "$SWAP_FILE"
  fi
  swapon "$SWAP_FILE"
fi
if ! grep -q "^${SWAP_FILE} " /etc/fstab; then
  echo "${SWAP_FILE} none swap sw 0 0" >> /etc/fstab
fi

apt-get update -y
apt-get install -y ca-certificates curl gnupg build-essential nginx certbot python3-certbot-nginx ufw git

NODE_MAJOR="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)"
if [ "${NODE_MAJOR:-0}" != "22" ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "$APP_HOME"
sudo -u "$APP_USER" pm2 save

ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

systemctl enable nginx
systemctl start nginx

echo "Bootstrap complete."
echo "Next: clone the repo as ${APP_USER}, create .env from .env.example, run deploy/deploy.sh,"
echo "then obtain a certificate with certbot and enable deploy/nginx.conf."
