#!/bin/bash
set -euo pipefail

log(){ echo "[ASTRA_NEXT_PERSISTENCE] $*"; }

: "${STORAGE_DIR:=/app/server/storage}"
: "${ANYTHINGLLM_BASE_URL:=http://127.0.0.1:3001}"

if [ -z "${AUTH_TOKEN:-}" ]; then
  log "FAIL auth_token_missing"
  exit 2
fi

SENTINEL_DIR="${STORAGE_DIR}/astra-next-persistence"
SENTINEL_FILE="${SENTINEL_DIR}/sentinel.json"
mkdir -p "$SENTINEL_DIR"

LOGIN_BODY=$(node -e 'process.stdout.write(JSON.stringify({password:process.env.AUTH_TOKEN}))')
LOGIN_JSON=$(curl -fsS -X POST "${ANYTHINGLLM_BASE_URL}/api/request-token" -H 'Content-Type: application/json' --data "$LOGIN_BODY")
TOKEN=$(printf '%s' "$LOGIN_JSON" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);if(!j.valid||!j.token)process.exit(2);process.stdout.write(j.token)})')
AUTH_HEADER="Authorization: Bearer ${TOKEN}"

WORKSPACES=$(curl -fsS "${ANYTHINGLLM_BASE_URL}/api/workspaces" -H "$AUTH_HEADER")
WORKSPACE_OK=$(printf '%s' "$WORKSPACES" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);process.stdout.write((j.workspaces||[]).some(w=>w.slug==="astra-next"||w.name==="ASTRA NEXT")?"yes":"no")})')

FLOWS=$(curl -fsS "${ANYTHINGLLM_BASE_URL}/api/agent-flows/list" -H "$AUTH_HEADER" || true)
FLOW_UUID=$(printf '%s' "$FLOWS" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);const f=(j.flows||[]).find(x=>x.name==="ASTRA NEXT Campaign360 Handoff");process.stdout.write(f?.uuid||"")}catch{}})')

DB_FILE="${STORAGE_DIR}/anythingllm.db"
DB_EXISTS=no
[ -f "$DB_FILE" ] && DB_EXISTS=yes

if [ ! -f "$SENTINEL_FILE" ]; then
  node - "$SENTINEL_FILE" "$FLOW_UUID" "$WORKSPACE_OK" "$DB_EXISTS" <<'NODE'
const fs=require('fs');
const [p,flowUuid,workspaceOk,dbExists]=process.argv.slice(2);
const out={
  sentinel_id:`ASTRA_NEXT_PERSISTENCE_${Date.now()}`,
  created_at:new Date().toISOString(),
  flow_uuid:flowUuid||null,
  workspace_present:workspaceOk==='yes',
  db_present:dbExists==='yes'
};
fs.writeFileSync(p,JSON.stringify(out,null,2));
console.log(`[ASTRA_NEXT_PERSISTENCE] sentinel_created id=${out.sentinel_id} flow_uuid=${out.flow_uuid||'missing'}`);
NODE
  log "BASELINE workspace=${WORKSPACE_OK} db=${DB_EXISTS} flow_uuid=${FLOW_UUID:-missing}"
  log "NEXT redeploy_or_restart_then_rerun_same_script"
  exit 0
fi

node - "$SENTINEL_FILE" "$FLOW_UUID" "$WORKSPACE_OK" "$DB_EXISTS" <<'NODE'
const fs=require('fs');
const [p,flowUuid,workspaceOk,dbExists]=process.argv.slice(2);
const s=JSON.parse(fs.readFileSync(p,'utf8'));
const checks={
  sentinel_reused:true,
  db_reused:dbExists==='yes',
  workspace_reused:workspaceOk==='yes',
  flow_reused:Boolean(s.flow_uuid && flowUuid && s.flow_uuid===flowUuid)
};
const pass=Object.values(checks).every(Boolean);
console.log(`[ASTRA_NEXT_PERSISTENCE] verification status=${pass?'PASS':'FAIL'} sentinel_id=${s.sentinel_id} original_flow_uuid=${s.flow_uuid||'missing'} current_flow_uuid=${flowUuid||'missing'} db_reused=${checks.db_reused} workspace_reused=${checks.workspace_reused} flow_reused=${checks.flow_reused}`);
if(!pass) process.exit(3);
NODE
