#!/usr/bin/env bash
set -euo pipefail

API="${API:-http://127.0.0.1:3000/api}"
if [[ ! "$API" =~ ^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/api/?$ ]]; then
  echo "Mutating multipart test is restricted to a local/staging API; production is read-only." >&2
  exit 1
fi
ADMIN_EMAIL=${ADMIN_EMAIL:?Set ADMIN_EMAIL in the environment}
ADMIN_PASSWORD=${ADMIN_PASSWORD:?Set ADMIN_PASSWORD in the environment}

login=$(curl -s -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
TOKEN=$(echo "$login" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
echo "Login: ${login:0:80}..."
echo "Token length: ${#TOKEN}"

echo "--- Test multipart without files ---"
curl -s -w "\nHTTP:%{http_code}\n" -X POST "$API/resources" \
  -H "Authorization: Bearer $TOKEN" \
  -F 'title=TesteCurl' \
  -F 'description=teste' \
  -F 'is_published=true' \
  -F 'display_mode=default' \
  -F 'download_limit_max=' \
  -F 'download_limit_period=' \
  -F 'page_layout={}'

echo "--- Test multipart with PNG cover ---"
python3 - <<'PY'
import subprocess, struct, zlib

def png_chunk(tag, data):
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

raw = b''.join([
    b'\x89PNG\r\n\x1a\n',
    png_chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)),
    png_chunk(b'IDAT', zlib.compress(b'\x00\xff\x00\x00')),
    png_chunk(b'IEND', b''),
])
open('/tmp/test-cover.png', 'wb').write(raw)
PY
curl -s -w "\nHTTP:%{http_code}\n" -X POST "$API/resources" \
  -H "Authorization: Bearer $TOKEN" \
  -F 'title=TesteComCapa' \
  -F 'description=teste' \
  -F 'is_published=true' \
  -F 'display_mode=default' \
  -F 'download_limit_max=' \
  -F 'download_limit_period=' \
  -F 'page_layout={}' \
  -F 'cover=@/tmp/test-cover.png;type=image/png'
