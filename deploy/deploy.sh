#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

mkdir -p logs data

git pull --ff-only
npm ci
npm run build

if pm2 describe ai-patient-scheduling-portal >/dev/null 2>&1; then
  pm2 reload ecosystem.config.js --env production
else
  pm2 start ecosystem.config.js --env production
fi
pm2 save

curl -f --retry 10 --retry-delay 2 --retry-connrefused http://127.0.0.1:3000/api/health
echo
