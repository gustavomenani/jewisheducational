#!/usr/bin/env bash
set -euo pipefail
API="${API:-https://jewish-educational-resources.web.app/api}"
case "$API" in
  http://localhost:*|http://127.0.0.1:*|https://localhost:*|https://127.0.0.1:*) ;;
  *) echo "Login probe bloqueado fora de localhost; não envie tentativas para produção." >&2; exit 1 ;;
esac
for email in "ehudkwin@gmail.com" "josueejunior99@gmail.com" "admin@example.com"; do
  echo "=== $email ==="
  curl --fail-with-body --silent --show-error -X POST "$API/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"wrongpass\"}"
  echo
done
