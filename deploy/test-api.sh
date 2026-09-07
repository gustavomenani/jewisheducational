#!/usr/bin/env bash
set -euo pipefail
API="${API:-https://jewish-educational-resources.web.app/api}"
curl --fail-with-body --silent --show-error "$API/resources?limit=12&category=torah"
echo
echo '---ALL---'
curl --fail-with-body --silent --show-error "$API/resources?limit=50"
echo
