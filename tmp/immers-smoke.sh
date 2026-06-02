#!/bin/bash
set -e
BASE="${1:-http://127.0.0.1:3000}"
echo "=== Swagger $BASE/api-docs/ ==="
curl -sS -o /dev/null -w "HTTP %{http_code}\n" "$BASE/api-docs/"

echo "=== Login ==="
LOGIN=$(curl -sS -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/login.json)
echo "$LOGIN" | head -c 120
echo "..."

TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
ROLE=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['role'])")
echo "role=$ROLE token_len=${#TOKEN}"

echo "=== GET /api/auth/me ==="
ME=$(curl -sS "$BASE/api/auth/me" -H "Authorization: Bearer $TOKEN")
echo "$ME" | head -c 200
echo ""

echo "=== GET /api/pfp/settings (admin JWT) ==="
curl -sS -o /dev/null -w "HTTP %{http_code}\n" "$BASE/api/pfp/settings" -H "Authorization: Bearer $TOKEN"
