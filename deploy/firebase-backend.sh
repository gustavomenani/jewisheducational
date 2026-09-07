#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo ">> Instalando dependências do backend..."
npm ci
npm ci --prefix frontend
npm ci --prefix backend

echo ">> Build frontend..."
# The Firebase predeploy hook runs the single release build and gate.

echo ">> Configurando variáveis externas da Cloud Function..."
if [[ -z "${JWT_SECRET:-}" ]]; then
  echo "JWT_SECRET precisa ser fornecido pelo ambiente/Secret Manager; nenhum segredo será lido do VPS." >&2
  exit 1
fi
if [[ -z "${VITE_FIREBASE_API_KEY:-}" ]]; then
  echo "VITE_FIREBASE_API_KEY deve ser injetada pelo ambiente de build; não use uma chave fixa no repositório." >&2
  exit 1
fi

if [[ -z "${MIGRATION_SECRET:-}" ]]; then
  echo "MIGRATION_SECRET must be supplied to provision the private migration Function; it is never bound to the public API." >&2
  exit 1
fi

export FRONTEND_URL="${FRONTEND_URL:-https://jewisheducationalresources.org}"
export VITE_SITE_URL="${VITE_SITE_URL:-$FRONTEND_URL}"
export PAYMENTS_ENABLED="${PAYMENTS_ENABLED:-false}"
export EMAIL_ENABLED="${EMAIL_ENABLED:-false}"

echo ">> Release gate..."
npm run verify:release

echo ">> Configurando JWT_SECRET no Secret Manager..."
for secret_name in JWT_SECRET MIGRATION_SECRET; do
  if [[ -n "${!secret_name:-}" ]]; then
    printf '%s' "${!secret_name}" | firebase functions:secrets:set "$secret_name" --data-file -
  fi
done

echo ">> Deploy Firebase (functions, hosting, firestore, storage)..."
firebase deploy --only functions,hosting,firestore,storage --non-interactive

echo ">> OK"
echo "   Site: https://jewish-educational-resources.web.app"
echo "   API:  https://jewish-educational-resources.web.app/api/health"
