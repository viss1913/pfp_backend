#!/bin/bash
set -euo pipefail
cd /opt/pfp/app

echo "=== fetch finam ==="
git fetch origin finam
git merge origin/finam -m "deploy: ATB project 3 white-label" || {
  echo "merge failed; aborting"
  exit 1
}

echo "=== patch .env.production for project 3 ==="
if grep -q '^FINAM_REPORT_PROJECT_IDS=' .env.production; then
  sed -i 's/^FINAM_REPORT_PROJECT_IDS=.*/FINAM_REPORT_PROJECT_IDS=2,3/' .env.production
else
  echo 'FINAM_REPORT_PROJECT_IDS=2,3' >> .env.production
fi

if grep -q '^FINAM_REPORT_VERSION=' .env.production; then
  sed -i 's/^FINAM_REPORT_VERSION=.*/FINAM_REPORT_VERSION=2/' .env.production
else
  echo 'FINAM_REPORT_VERSION=2' >> .env.production
fi

if grep -q '^FINAM_REPORT_VERSION_PROJECT_IDS=' .env.production; then
  sed -i 's/^FINAM_REPORT_VERSION_PROJECT_IDS=.*/FINAM_REPORT_VERSION_PROJECT_IDS=2,3,28/' .env.production
else
  echo 'FINAM_REPORT_VERSION_PROJECT_IDS=2,3,28' >> .env.production
fi

echo "=== build & restart backend ==="
docker compose build backend
docker compose up -d backend

echo "=== wait for backend health ==="
sleep 8
docker compose logs --tail=40 backend

echo "=== DB check projects/settings ==="
docker compose exec -T mysql mysql -upfp -ppfp_app_2026_secure pfp < /tmp/immers-atb-project3-check.sql

echo "=== swagger ==="
curl -sS -o /dev/null -w "swagger HTTP %{http_code}\n" https://pfp-api.bank-future.com/api-docs/

echo "DONE"
