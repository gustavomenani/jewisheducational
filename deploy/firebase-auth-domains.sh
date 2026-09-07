#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="jewish-educational-resources"
DOMAINS=(
  "jewisheducationalresources.org"
  "www.jewisheducationalresources.org"
)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo ">> Deploy auth (redirect URIs Google)..."
firebase deploy --only auth --non-interactive

echo ">> Atualizando dominios autorizados..."
python3 - <<'PY'
import json
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path

PROJECT_ID = "jewish-educational-resources"
TO_ADD = ["jewisheducationalresources.org", "www.jewisheducationalresources.org"]
CLIENT_ID = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "").strip()
CLIENT_SECRET = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "").strip()
if not CLIENT_ID or not CLIENT_SECRET:
    raise SystemExit("Defina GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET fora do repositório.")
CONFIG_PATH = Path.home() / ".config/configstore/firebase-tools.json"
BASE = f"https://identitytoolkit.googleapis.com/admin/v2/projects/{PROJECT_ID}/config"


def load_store():
    return json.loads(CONFIG_PATH.read_text())


def save_store(store):
    CONFIG_PATH.write_text(json.dumps(store, indent=2))


def refresh_access_token(store):
    refresh_token = store["tokens"]["refresh_token"]
    body = urllib.parse.urlencode({
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }).encode()
    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=body,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read().decode())
    store["tokens"]["access_token"] = data["access_token"]
    store["tokens"]["expires_at"] = int(time.time() * 1000) + int(data.get("expires_in", 3600)) * 1000
    save_store(store)
    return data["access_token"]


def get_access_token():
    store = load_store()
    token = store.get("tokens", {}).get("access_token")
    expires_at = store.get("tokens", {}).get("expires_at", 0)
    if not token or int(expires_at) < int(time.time() * 1000) + 60000:
        token = refresh_access_token(store)
    return token


def api(method, url, token, body=None):
    data = None if body is None else json.dumps(body).encode()
    headers = {"Authorization": f"Bearer {token}"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode())


token = get_access_token()
current = api("GET", BASE, token)
if "error" in current:
    raise SystemExit(json.dumps(current["error"], indent=2))

merged = list(current.get("authorizedDomains", []))
for domain in TO_ADD:
    if domain not in merged:
        merged.append(domain)

updated = api("PATCH", f"{BASE}?updateMask=authorizedDomains", token, {"authorizedDomains": merged})
if "error" in updated:
    raise SystemExit(json.dumps(updated["error"], indent=2))

print("Dominios autorizados:")
for domain in updated.get("authorizedDomains", []):
    print(" -", domain)
PY

echo ">> Concluido."
