#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "${ALLOW_PRODUCTION_MIGRATION:-0}" != "1" ]]; then
  echo "Production migration is blocked. Set ALLOW_PRODUCTION_MIGRATION=1 only after backup and approval." >&2
  exit 1
fi

for required_var in VITE_FIREBASE_API_KEY JWT_SECRET MYSQL_PASS MIGRATION_SECRET; do
  if [[ -z "${!required_var:-}" ]]; then
    echo "$required_var must be supplied by the release environment or Secret Manager." >&2
    exit 1
  fi
done

LEGACY_SSH_HOST="${LEGACY_SSH_HOST:?Set LEGACY_SSH_HOST for the approved source export.}"
LEGACY_SSH_USER="${LEGACY_SSH_USER:-root}"
LEGACY_REMOTE_ROOT="${LEGACY_REMOTE_ROOT:?Set LEGACY_REMOTE_ROOT for the approved source export.}"
LEGACY_DB_FORWARD_PORT="${LEGACY_DB_FORWARD_PORT:-7861}"
MIGRATION_API_URL="${MIGRATION_API_URL:?Set MIGRATION_API_URL to the private migrationApi Function URL.}"
MIGRATION_IDENTITY_TOKEN="${MIGRATION_IDENTITY_TOKEN:-$(gcloud auth print-identity-token)}"
FIREBASE_STORAGE_BUCKET="${FIREBASE_STORAGE_BUCKET:-${STORAGE_BUCKET:-}}"
export PAYMENTS_ENABLED="${PAYMENTS_ENABLED:-false}"
export EMAIL_ENABLED="${EMAIL_ENABLED:-false}"
if [[ -z "$FIREBASE_STORAGE_BUCKET" ]]; then
  echo "FIREBASE_STORAGE_BUCKET or STORAGE_BUCKET must be supplied for cover URL rewriting." >&2
  exit 1
fi

echo ">> Release gate..."
npm ci
npm ci --prefix frontend
npm ci --prefix backend
npm run verify:release

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo ">> Exporting the approved source snapshot from the legacy database..."
ssh -f -N -o StrictHostKeyChecking=accept-new -L "${LEGACY_DB_FORWARD_PORT}:127.0.0.1:${LEGACY_DB_FORWARD_PORT}" "${LEGACY_SSH_USER}@${LEGACY_SSH_HOST}"
sleep 2
ssh -o StrictHostKeyChecking=accept-new "${LEGACY_SSH_USER}@${LEGACY_SSH_HOST}" \
  "tar -czf /tmp/jer-uploads.tgz -C '${LEGACY_REMOTE_ROOT}/backend' uploads"
scp -o StrictHostKeyChecking=accept-new "${LEGACY_SSH_USER}@${LEGACY_SSH_HOST}:/tmp/jer-uploads.tgz" "$WORK_DIR/jer-uploads.tgz"
mkdir -p "$WORK_DIR/uploads"
tar -xzf "$WORK_DIR/jer-uploads.tgz" -C "$WORK_DIR/uploads"

DB_HOST=127.0.0.1 DB_PORT="$LEGACY_DB_FORWARD_PORT" DB_USER=root DB_PASSWORD="$MYSQL_PASS" \
  DB_NAME=jewish_educational_resources UPLOAD_DIR="$WORK_DIR/uploads/uploads" \
  node backend/scripts/export-mysql-json.js > "$WORK_DIR/jer-data.json"

echo ">> Registering Firebase Secret Manager values..."
printf '%s' "$JWT_SECRET" | firebase functions:secrets:set JWT_SECRET --data-file -
printf '%s' "$MIGRATION_SECRET" | firebase functions:secrets:set MIGRATION_SECRET --data-file -

echo ">> Deploying Firebase functions, hosting, rules, and storage..."
firebase deploy --only functions,hosting,firestore,storage --non-interactive

echo ">> Importing the verified snapshot..."
node -e "
const fs=require('fs');
const path=require('path');
const data=JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const out=process.argv[2];
const bucket=process.argv[3];
for (const resource of data.tables.resources || []) {
  if (resource.cover_image && resource.cover_image.startsWith('/uploads/')) {
    const rel=resource.cover_image.replace(/^\\/uploads\\//, '');
    resource.cover_image='https://storage.googleapis.com/'+bucket+'/'+rel;
  }
}
fs.mkdirSync(path.join(out, 'file-batches'), {recursive:true});
fs.mkdirSync(path.join(out, 'table-batches'), {recursive:true});
let tableIndex=0;
const maxBytes=2*1024*1024;
for (const [table, rows] of Object.entries(data.tables || {})) {
  if (!Array.isArray(rows) || !rows.length) continue;
  let chunk=[];
  for (const row of rows) {
    const candidate=[...chunk, row];
    const size=Buffer.byteLength(JSON.stringify({tables:{[table]:candidate},files:[]}));
    if (chunk.length && size > maxBytes) {
      fs.writeFileSync(path.join(out, 'table-batches', String(tableIndex++).padStart(6,'0')+'.json'), JSON.stringify({tables:{[table]:chunk},files:[]}));
      chunk=[row];
    } else chunk=candidate;
  }
  if (chunk.length) fs.writeFileSync(path.join(out, 'table-batches', String(tableIndex++).padStart(6,'0')+'.json'), JSON.stringify({tables:{[table]:chunk},files:[]}));
}
const batchSize=5;
for (let i=0; i<data.files.length; i+=batchSize) {
  fs.writeFileSync(path.join(out, 'file-batches', String(Math.floor(i/batchSize)).padStart(6,'0')+'.json'), JSON.stringify({tables:{}, files:data.files.slice(i,i+batchSize)}));
}
" "$WORK_DIR/jer-data.json" "$WORK_DIR" "$FIREBASE_STORAGE_BUCKET"

MIGRATION_RUN_ID="${MIGRATION_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
for table_file in "$WORK_DIR"/table-batches/*.json; do
  [[ -f "$table_file" ]] || continue
  curl --fail-with-body --silent --show-error -X POST \
    "${MIGRATION_API_URL}/api/migrate/import?tables_only=1" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $MIGRATION_IDENTITY_TOKEN" \
    -H "X-Migration-Secret: $MIGRATION_SECRET" \
    -H "X-Migration-Run-Id: $MIGRATION_RUN_ID" \
    --data-binary "@$table_file"
  echo
done

for batch_file in "$WORK_DIR"/file-batches/*.json; do
  [[ -f "$batch_file" ]] || continue
  curl --fail-with-body --silent --show-error -X POST \
    "${MIGRATION_API_URL}/api/migrate/import?files_only=1" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $MIGRATION_IDENTITY_TOKEN" \
    -H "X-Migration-Secret: $MIGRATION_SECRET" \
    -H "X-Migration-Run-Id: $MIGRATION_RUN_ID" \
    --data-binary "@$batch_file"
  echo
done

echo ">> Health check..."
curl --fail-with-body --silent --show-error "https://jewish-educational-resources.web.app/api/health"
echo
echo ">> Firebase migration and deployment completed."
