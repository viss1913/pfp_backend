#!/bin/bash
set -e
echo "=== HOST: mtr -4 api.resend.com (10 probes) ==="
mtr -4 -r -c 10 api.resend.com || true
echo ""
echo "=== HOST: curl GET api.resend.com ==="
curl -sS -o /dev/null -w "GET http_code=%{http_code} time_total=%{time_total}s\n" --connect-timeout 15 https://api.resend.com/ || echo "GET failed: $?"
echo ""
echo "=== CONTAINER: /etc/hosts resend ==="
docker compose -f /opt/pfp/app/docker-compose.yml exec -T backend grep resend /etc/hosts || true
echo ""
echo "=== CONTAINER: getent hosts api.resend.com ==="
docker compose -f /opt/pfp/app/docker-compose.yml exec -T backend getent hosts api.resend.com || true
echo ""
echo "=== CONTAINER: node HTTPS GET + large POST ==="
docker compose -f /opt/pfp/app/docker-compose.yml exec -T backend node /app/tmp-mtr-test.js || true
