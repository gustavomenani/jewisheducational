#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
if [[ "${ALLOW_PRODUCTION_MIGRATION:-0}" != "1" ]]; then
  echo "Importação de produção bloqueada. Use ALLOW_PRODUCTION_MIGRATION=1 somente após backup e aprovação." >&2
  exit 1
fi
if [[ -z "${MYSQL_PASS:-}" || -z "${MIGRATION_SECRET:-}" ]]; then
  echo "MYSQL_PASS e MIGRATION_SECRET devem ser fornecidos pelo ambiente/Secret Manager." >&2
  exit 1
fi
LEGACY_SSH_HOST="${LEGACY_SSH_HOST:?Set LEGACY_SSH_HOST for the approved source export.}"
LEGACY_SSH_USER="${LEGACY_SSH_USER:-root}"
LEGACY_REMOTE_ROOT="${LEGACY_REMOTE_ROOT:?Set LEGACY_REMOTE_ROOT for the approved source export.}"
LEGACY_DB_FORWARD_PORT="${LEGACY_DB_FORWARD_PORT:-7861}"
MIGRATION_API_URL="${MIGRATION_API_URL:?Set MIGRATION_API_URL to the private migrationApi Function URL.}"
MIGRATION_IDENTITY_TOKEN="${MIGRATION_IDENTITY_TOKEN:-$(gcloud auth print-identity-token)}"
API="${MIGRATION_API_URL}/api/migrate/import"
FIREBASE_STORAGE_BUCKET="${FIREBASE_STORAGE_BUCKET:-${STORAGE_BUCKET:-}}"
if [[ -z "$FIREBASE_STORAGE_BUCKET" ]]; then
  echo "FIREBASE_STORAGE_BUCKET or STORAGE_BUCKET must be supplied for cover URL rewriting." >&2
  exit 1
fi
BATCH=5

pkill -f "${LEGACY_DB_FORWARD_PORT}:127.0.0.1:${LEGACY_DB_FORWARD_PORT}" 2>/dev/null || true
ssh -f -N -o StrictHostKeyChecking=accept-new -L "${LEGACY_DB_FORWARD_PORT}:127.0.0.1:${LEGACY_DB_FORWARD_PORT}" "${LEGACY_SSH_USER}@${LEGACY_SSH_HOST}"
sleep 2

ssh -o StrictHostKeyChecking=accept-new "${LEGACY_SSH_USER}@${LEGACY_SSH_HOST}" \
  "tar -czf /tmp/jer-uploads.tgz -C '${LEGACY_REMOTE_ROOT}/backend' uploads"
scp -o StrictHostKeyChecking=accept-new "${LEGACY_SSH_USER}@${LEGACY_SSH_HOST}:/tmp/jer-uploads.tgz" /tmp/jer-uploads.tgz
mkdir -p /tmp/jer-uploads
tar -xzf /tmp/jer-uploads.tgz -C /tmp/jer-uploads

cd "$ROOT_DIR/backend"
DB_HOST=127.0.0.1 DB_PORT="$LEGACY_DB_FORWARD_PORT" DB_USER=root DB_PASSWORD="$MYSQL_PASS" \
  DB_NAME=jewish_educational_resources UPLOAD_DIR=/tmp/jer-uploads/uploads \
  node scripts/export-mysql-json.js > /tmp/jer-full.json

node -e "
const fs=require('fs');
const data=JSON.parse(fs.readFileSync('/tmp/jer-full.json','utf8'));
fs.mkdirSync('/tmp/jer-table-batches', {recursive:true});
let tableIndex=0;
const maxBytes=2*1024*1024;
for (const [table, rows] of Object.entries(data.tables || {})) {
  if (!Array.isArray(rows) || !rows.length) continue;
  let chunk=[];
  for (const row of rows) {
    const candidate=[...chunk, row];
    const size=Buffer.byteLength(JSON.stringify({tables:{[table]:candidate},files:[]}));
    if (chunk.length && size > maxBytes) {
      fs.writeFileSync('/tmp/jer-table-batches/'+String(tableIndex++).padStart(6,'0')+'.json', JSON.stringify({tables:{[table]:chunk},files:[]}));
      chunk=[row];
    } else chunk=candidate;
  }
  if (chunk.length) fs.writeFileSync('/tmp/jer-table-batches/'+String(tableIndex++).padStart(6,'0')+'.json', JSON.stringify({tables:{[table]:chunk},files:[]}));
}
fs.writeFileSync('/tmp/jer-files.json', JSON.stringify({ tables: {}, files: data.files }));
console.log('table batches', fs.readdirSync('/tmp/jer-table-batches').length);
console.log('files', data.files.length, 'items', (fs.statSync('/tmp/jer-files.json').size/1024/1024).toFixed(1)+'MB');
"

echo ">> Importando tabelas..."
MIGRATION_RUN_ID="${MIGRATION_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
for table_file in /tmp/jer-table-batches/*.json; do
  [[ -f "$table_file" ]] || continue
  curl --fail-with-body --silent --show-error -X POST "${API}?tables_only=1" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $MIGRATION_IDENTITY_TOKEN" \
    -H "X-Migration-Secret: $MIGRATION_SECRET" \
    -H "X-Migration-Run-Id: $MIGRATION_RUN_ID" \
    --data-binary "@$table_file"
  echo
done

echo ">> Importando arquivos em lotes de $BATCH..."
JER_MIGRATION_SECRET="$MIGRATION_SECRET" JER_MIGRATION_IDENTITY_TOKEN="$MIGRATION_IDENTITY_TOKEN" JER_MIGRATION_API="$API" JER_MIGRATION_RUN_ID="$MIGRATION_RUN_ID" node -e "
const fs=require('fs');
const {execSync}=require('child_process');
const files=JSON.parse(fs.readFileSync('/tmp/jer-files.json','utf8')).files;
const secret=process.env.JER_MIGRATION_SECRET;
const identity=process.env.JER_MIGRATION_IDENTITY_TOKEN;
const api=process.env.JER_MIGRATION_API;
const runId=process.env.JER_MIGRATION_RUN_ID;
const batch=$BATCH;
for (let i=0;i<files.length;i+=batch) {
  const chunk=files.slice(i,i+batch);
  const body=JSON.stringify({tables:{},files:chunk});
  const tmp='/tmp/jer-files-batch.json';
  fs.writeFileSync(tmp,body);
  console.log('batch', Math.floor(i/batch)+1, '/', Math.ceil(files.length/batch));
  const curlArgs=['--fail-with-body','--silent','--show-error','-X','POST',api+'?files_only=1','-H','Content-Type: application/json','-H','Authorization: Bearer '+identity,'-H','X-Migration-Secret: '+secret,'-H','X-Migration-Run-Id: '+runId,'--data-binary','@'+tmp];
  execSync('curl '+curlArgs.map((arg) => JSON.stringify(arg)).join(' '), {stdio:'inherit'});
}
"

echo ">> Atualizando capas com URLs do Storage..."
node -e "
const fs=require('fs');
const data=JSON.parse(fs.readFileSync('/tmp/jer-full.json','utf8'));
const bucket=process.argv[1];
for (const r of data.tables.resources||[]) {
  if (r.cover_image && r.cover_image.startsWith('/uploads/')) {
    const rel=r.cover_image.replace(/^\\/uploads\\//,'');
    r.cover_image='https://storage.googleapis.com/'+bucket+'/'+rel;
  }
}
fs.writeFileSync('/tmp/jer-covers.json', JSON.stringify({tables:{resources:data.tables.resources},files:[]}));
" "$FIREBASE_STORAGE_BUCKET"
curl --fail-with-body --silent --show-error -X POST "${API}?tables_only=1" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MIGRATION_IDENTITY_TOKEN" \
  -H "X-Migration-Secret: $MIGRATION_SECRET" \
  -H "X-Migration-Run-Id: $MIGRATION_RUN_ID" \
  --data-binary @/tmp/jer-covers.json
echo

echo ">> Teste:"
curl --fail-with-body --silent --show-error "https://jewish-educational-resources.web.app/api/resources?limit=3"
echo
