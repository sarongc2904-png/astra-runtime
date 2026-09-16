#!/bin/bash
set -euo pipefail

log() { echo "[ASTRA_NEXT_BOOTSTRAP] $*"; }

/usr/local/bin/docker-entrypoint.sh &
APP_PID=$!

cleanup() {
  if kill -0 "$APP_PID" 2>/dev/null; then
    kill "$APP_PID" 2>/dev/null || true
  fi
}
trap cleanup INT TERM

log "waiting for AnythingLLM local API"
for i in $(seq 1 120); do
  if curl -fsS http://127.0.0.1:3001/api/ping >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [ "$i" -eq 120 ]; then
    log "ERROR api_not_ready"
    wait "$APP_PID"
    exit $?
  fi
done
log "api_ready"

if [ -z "${AUTH_TOKEN:-}" ]; then
  log "ERROR AUTH_TOKEN_missing"
  wait "$APP_PID"
  exit $?
fi

LOGIN_BODY=$(node -e 'process.stdout.write(JSON.stringify({password:process.env.AUTH_TOKEN}))')
LOGIN_JSON=$(curl -fsS -X POST http://127.0.0.1:3001/api/request-token \
  -H 'Content-Type: application/json' \
  --data "$LOGIN_BODY")
TOKEN=$(printf '%s' "$LOGIN_JSON" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);if(!j.valid||!j.token)process.exit(2);process.stdout.write(j.token)})')
log "local_auth_ok"

AUTH_HEADER="Authorization: Bearer ${TOKEN}"
WORKSPACES=$(curl -fsS http://127.0.0.1:3001/api/workspaces -H "$AUTH_HEADER")
EXISTS=$(printf '%s' "$WORKSPACES" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);const xs=j.workspaces||[];process.stdout.write(xs.some(w=>w.name==="ASTRA NEXT")?"yes":"no")})')

if [ "$EXISTS" = "yes" ]; then
  log "workspace_exists name=ASTRA NEXT"
else
  CREATE_BODY='{"name":"ASTRA NEXT","onboardingComplete":true}'
  CREATE_JSON=$(curl -fsS -X POST http://127.0.0.1:3001/api/workspace/new \
    -H "$AUTH_HEADER" \
    -H 'Content-Type: application/json' \
    --data "$CREATE_BODY")
  CREATED=$(printf '%s' "$CREATE_JSON" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);process.stdout.write(j.workspace?.slug||"")})')
  if [ -z "$CREATED" ]; then
    log "ERROR workspace_create_failed"
  else
    log "workspace_created slug=$CREATED"
  fi
fi

curl -fsS -X POST http://127.0.0.1:3001/api/onboarding \
  -H "$AUTH_HEADER" \
  -H 'Content-Type: application/json' \
  --data '{}' >/dev/null 2>&1 || true

if [ -n "${OPENROUTER_API_KEY:-}" ]; then
  log "openrouter_key_present"
else
  log "ERROR openrouter_key_missing"
fi
log "llm_provider=${LLM_PROVIDER:-unset} model=${OPENROUTER_MODEL_PREF:-unset}"

KB_DIR=/opt/astra-next-kb
KB_TOTAL=0
KB_PASS=0
KB_FAIL=0

if [ -n "${OPENROUTER_API_KEY:-}" ] && [ -d "$KB_DIR" ]; then
  log "kb_ingestion_start manifest=ASTRA_NEXT_POC_KB_V1 workspace=astra-next"
  for FILE in "$KB_DIR"/*; do
    [ -f "$FILE" ] || continue
    KB_TOTAL=$((KB_TOTAL + 1))
    BASE=$(basename "$FILE")
    TMP=$(mktemp)
    HTTP_CODE=$(curl -sS -o "$TMP" -w '%{http_code}' -X POST \
      http://127.0.0.1:3001/api/workspace/astra-next/upload-and-embed \
      -H "$AUTH_HEADER" \
      -F "file=@${FILE}" || true)

    OK=no
    if [ "$HTTP_CODE" = "200" ]; then
      OK=$(node - "$TMP" <<'NODE'
const fs=require('fs');
const p=process.argv[2];
try { const j=JSON.parse(fs.readFileSync(p,'utf8')); process.stdout.write(j.success===true?'yes':'no'); }
catch { process.stdout.write('no'); }
NODE
)
    fi

    if [ "$OK" = "yes" ]; then
      KB_PASS=$((KB_PASS + 1))
      log "kb_ingest_pass file=${BASE}"
    else
      KB_FAIL=$((KB_FAIL + 1))
      BODY=$(tr '\n' ' ' < "$TMP" | head -c 300)
      log "ERROR kb_ingest_fail file=${BASE} http=${HTTP_CODE} body=${BODY}"
    fi
    rm -f "$TMP"
  done

  if [ "$KB_TOTAL" -eq 7 ] && [ "$KB_FAIL" -eq 0 ]; then
    log "kb_ingestion_complete status=PASS manifest=ASTRA_NEXT_POC_KB_V1 total=${KB_TOTAL} passed=${KB_PASS} failed=${KB_FAIL}"
  else
    log "ERROR kb_ingestion_complete status=FAIL manifest=ASTRA_NEXT_POC_KB_V1 total=${KB_TOTAL} passed=${KB_PASS} failed=${KB_FAIL}"
  fi
else
  log "ERROR kb_ingestion_skipped reason=openrouter_or_kb_dir_missing"
fi

log "bootstrap_complete"
wait "$APP_PID"
