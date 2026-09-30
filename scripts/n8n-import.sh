#!/usr/bin/env bash
# Import / update every built workflow in this repo into the local n8n.
#
# One-time setup: n8n UI -> Settings -> n8n API -> Create an API key, then
#   echo 'N8N_API_KEY=<key>' >> .env
#
# Workflows are matched by NAME, so re-running updates in place instead of
# creating duplicates. Imported workflows arrive INACTIVE on purpose — activate
# them from the UI once credentials are attached.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a
: "${N8N_BASE_URL:=http://localhost:5678}"
: "${N8N_API_KEY:?N8N_API_KEY is not set — create one in n8n Settings -> n8n API}"

api() { curl -sS -H "X-N8N-API-KEY: $N8N_API_KEY" -H 'Content-Type: application/json' "$@"; }

echo "==> rebuilding workflow JSON from src/"
python3 n8n/build.py >/dev/null

echo "==> fetching existing workflows"
existing=$(api "$N8N_BASE_URL/api/v1/workflows?limit=250")

for f in n8n/workflows/*.json; do
  name=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['name'])" "$f")
  id=$(printf '%s' "$existing" | python3 -c "
import json,sys
want=sys.argv[1]
for w in json.load(sys.stdin).get('data',[]):
    if w['name']==want: print(w['id']); break" "$name")

  # The API rejects keys it does not own (id, active, tags, versionId…).
  payload=$(python3 -c "
import json,sys
w=json.load(open(sys.argv[1]))
print(json.dumps({k:w[k] for k in ('name','nodes','connections','settings') if k in w}))" "$f")

  if [ -n "$id" ]; then
    api -X PUT "$N8N_BASE_URL/api/v1/workflows/$id" -d "$payload" >/dev/null
    printf '  updated  %-58s (id %s)\n' "$name" "$id"
  else
    new=$(api -X POST "$N8N_BASE_URL/api/v1/workflows" -d "$payload" \
          | python3 -c "import json,sys;print(json.load(sys.stdin).get('id','?'))")
    printf '  created  %-58s (id %s)\n' "$name" "$new"
  fi
done
echo "==> done. Attach credentials, then activate in the n8n UI."
