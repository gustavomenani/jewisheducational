#!/usr/bin/env bash
# Publica só o backend na raiz do repo org-back (Supabase / deploy)
set -euo pipefail
echo "Legacy Supabase repository publishing is disabled. Deploy only through Firebase." >&2
exit 1
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="/tmp/jer-back-supabase-$$"
REMOTE="${1:-git@github.com:josueejunior/jewisheducationalresources.org-back.git}"

rm -rf "$WORK"
mkdir -p "$WORK"
rsync -a --exclude node_modules --exclude uploads "$ROOT/backend/" "$WORK/"

cd "$WORK"
git init -b main
git add .
git commit -m "Backend only — Supabase + API"
git remote add origin "$REMOTE"
git push -f origin main

echo "OK: $REMOTE (branch main, só backend na raiz)"
