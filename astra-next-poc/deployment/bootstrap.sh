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
log "bootstrap_complete"

wait "$APP_PID"
