#!/bin/bash
# Деплой ветки finam на Immers test (VM bankfuturebackend).
# Локально: ssh -i ~/.ssh/immers_pfp ubuntu@81.94.159.209 'bash -s' < scripts/deploy_immers_finam.sh
set -euo pipefail
cd /opt/pfp/app

echo "=== before ==="
git branch --show-current || true
git rev-parse --short HEAD || true

git fetch origin finam
git checkout finam 2>/dev/null || git checkout -B finam origin/finam
git pull --ff-only origin finam

echo "=== after pull ==="
git log -1 --oneline

docker compose build backend
docker compose up -d backend

sleep 8
docker compose ps
docker compose logs backend --tail 30

curl -sS -o /dev/null -w "swagger HTTP %{http_code}\n" https://pfp-api.bank-future.com/api-docs/
echo "DONE"
