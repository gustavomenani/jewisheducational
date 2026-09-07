#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo ">> Use the unified Firebase release path (functions, hosting, rules, storage)."
echo ">> This wrapper intentionally does not deploy Hosting-only or mutate Auth/domains."
exec bash "$ROOT_DIR/deploy/firebase-backend.sh"
