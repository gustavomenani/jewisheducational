#!/usr/bin/env bash
# Publica só o frontend na raiz do repo org-front (Vercel)
set -euo pipefail
echo "Legacy Vercel repository publishing is disabled. Deploy only through Firebase Hosting." >&2
exit 1
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="/tmp/jer-front-vercel-$$"
REMOTE="${1:-git@github.com:josueejunior/jewisheducationalresources.org-front.git}"

rm -rf "$WORK"
mkdir -p "$WORK"
rsync -a --exclude node_modules --exclude dist "$ROOT/frontend/" "$WORK/"

cd "$WORK"
git init -b main
git add .
git commit -m "Frontend only — deploy Vercel"
git remote add origin "$REMOTE"
git push -f origin main

echo "OK: $REMOTE (branch main, só frontend na raiz)"
