#!/usr/bin/env bash
set -euo pipefail
echo "Legacy migration password reset is disabled. Use Firebase Auth/admin tooling with externally managed credentials." >&2
exit 1
API="https://jewisheducationalresources.org/api/migrate/reset-password"

for email in "ehudkwin@gmail.com" "admin@example.com"; do
  curl -s -X POST "$API" \
    -H "Content-Type: application/json" \
    -H "X-Migration-Secret: $SECRET" \
    -d "{\"email\":\"$email\",\"password\":\"${ADMIN_PASSWORD:?ADMIN_PASSWORD must come from the environment}\"}"
  echo
done

echo "Test login ehudkwin:"
  curl --fail-with-body --silent --show-error -X POST "https://jewisheducationalresources.org/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"ehudkwin@gmail.com\",\"password\":\"${ADMIN_PASSWORD:?ADMIN_PASSWORD must come from the environment}\"}"
echo
