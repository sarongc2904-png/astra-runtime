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
  if curl -fsS http://127.0.0.1:3001/api/ping >/dev/null 2>&1; then break; fi
  sleep 1
  if [ "$i" -eq 120 ]; then log "ERROR api_not_ready"; wait "$APP_PID"; exit $?; fi
done
log "api_ready"

if [ -z "${AUTH_TOKEN:-}" ]; then log "ERROR AUTH_TOKEN_missing"; wait "$APP_PID"; exit $?; fi
LOGIN_BODY=$(node -e 'process.stdout.write(JSON.stringify({password:process.env.AUTH_TOKEN}))')
LOGIN_JSON=$(curl -fsS -X POST http://127.0.0.1:3001/api/request-token -H 'Content-Type: application/json' --data "$LOGIN_BODY")
TOKEN=$(printf '%s' "$LOGIN_JSON" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);if(!j.valid||!j.token)process.exit(2);process.stdout.write(j.token)})')
log "local_auth_ok"
AUTH_HEADER="Authorization: Bearer ${TOKEN}"

WORKSPACES=$(curl -fsS http://127.0.0.1:3001/api/workspaces -H "$AUTH_HEADER")
EXISTS=$(printf '%s' "$WORKSPACES" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);process.stdout.write((j.workspaces||[]).some(w=>w.name==="ASTRA NEXT")?"yes":"no")})')
if [ "$EXISTS" = "yes" ]; then
  log "workspace_exists name=ASTRA NEXT"
else
  CREATE_JSON=$(curl -fsS -X POST http://127.0.0.1:3001/api/workspace/new -H "$AUTH_HEADER" -H 'Content-Type: application/json' --data '{"name":"ASTRA NEXT","onboardingComplete":true}')
  CREATED=$(printf '%s' "$CREATE_JSON" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);process.stdout.write(j.workspace?.slug||"")})')
  [ -n "$CREATED" ] && log "workspace_created slug=$CREATED" || log "ERROR workspace_create_failed"
fi

curl -fsS -X POST http://127.0.0.1:3001/api/onboarding -H "$AUTH_HEADER" -H 'Content-Type: application/json' --data '{}' >/dev/null 2>&1 || true
[ -n "${OPENROUTER_API_KEY:-}" ] && log "openrouter_key_present" || log "ERROR openrouter_key_missing"
log "llm_provider=${LLM_PROVIDER:-unset} model=${OPENROUTER_MODEL_PREF:-unset} embedder=${EMBEDDING_ENGINE:-unset} embedding_model=${EMBEDDING_MODEL_PREF:-unset}"

KB_DIR=/opt/astra-next-kb
KB_TOTAL=0; KB_PASS=0; KB_FAIL=0
if [ -n "${OPENROUTER_API_KEY:-}" ] && [ -d "$KB_DIR" ]; then
  log "kb_ingestion_start manifest=ASTRA_NEXT_POC_KB_V1 workspace=astra-next"
  for FILE in "$KB_DIR"/*; do
    [ -f "$FILE" ] || continue
    KB_TOTAL=$((KB_TOTAL + 1)); BASE=$(basename "$FILE"); TMP=$(mktemp)
    HTTP_CODE=$(curl -sS -o "$TMP" -w '%{http_code}' -X POST http://127.0.0.1:3001/api/workspace/astra-next/upload-and-embed -H "$AUTH_HEADER" -F "file=@${FILE}" || true)
    OK=no
    if [ "$HTTP_CODE" = "200" ]; then
      OK=$(node - "$TMP" <<'NODE'
const fs=require('fs'); try{const j=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));process.stdout.write(j.success===true?'yes':'no')}catch{process.stdout.write('no')}
NODE
)
    fi
    if [ "$OK" = "yes" ]; then KB_PASS=$((KB_PASS+1)); log "kb_ingest_pass file=${BASE}"; else KB_FAIL=$((KB_FAIL+1)); BODY=$(tr '\n' ' ' < "$TMP" | head -c 300); log "ERROR kb_ingest_fail file=${BASE} http=${HTTP_CODE} body=${BODY}"; fi
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

if [ "${RUN_CAMPAIGN360_POC:-false}" = "true" ] && [ "$KB_TOTAL" -eq 7 ] && [ "$KB_FAIL" -eq 0 ]; then
  log "campaign360_start case=metodo360_control_v1 manifest=ASTRA_NEXT_POC_KB_V1"
  SYS_PROMPT='You are ASTRA NEXT Campaign360. Treat the canonical brief as immutable facts. Use the workspace knowledge as evidence. Never invent missing business facts. For every material assertion classify it as FACT, EVIDENCE, INFERENCE, RECOMMENDATION, or UNKNOWN. Produce a complete commercial campaign in Spanish (Mexico) covering exactly: canonical_brief, business_context, market_customer, icp, positioning, offer, funnel, creative_strategy, paid_media_strategy, whatsapp_sales, measurement, final_synthesis, unknowns, evidence_used. Preserve price, market, objective, conversion channel and audience exactly. Distinguish evidence from recommendation. Return valid JSON only.'
  UPDATE_BODY=$(node -e 'process.stdout.write(JSON.stringify({openAiPrompt:process.argv[1],openAiTemp:0.2,topN:12,similarityThreshold:0.15,chatMode:"chat"}))' "$SYS_PROMPT")
  curl -fsS -X POST http://127.0.0.1:3001/api/workspace/astra-next/update -H "$AUTH_HEADER" -H 'Content-Type: application/json' --data "$UPDATE_BODY" >/tmp/astra_workspace_update.json || true

  CAMPAIGN_PROMPT='CANONICAL BRIEF — DO NOT ALTER: Business: infoproduct for estéticas. Product: mini curso Método 360. Price: 400 MXN. Market: México. Objective: sell the mini course. Conversion channel: WhatsApp. Core proposition: teach estéticas how to fill their appointment agenda. Requirement: create the complete Campaign360 using only these facts plus evidence retrieved from ASTRA_NEXT_POC_KB_V1. Any unsupported detail must be INFERENCE, RECOMMENDATION or UNKNOWN, never FACT. Return valid JSON only with all required sections.'
  CHAT_BODY=$(node -e 'process.stdout.write(JSON.stringify({message:process.argv[1],attachments:[]}))' "$CAMPAIGN_PROMPT")
  START_MS=$(date +%s%3N)
  HTTP_CODE=$(curl -sS --max-time 600 -o /tmp/campaign360.sse -w '%{http_code}' -X POST http://127.0.0.1:3001/api/workspace/astra-next/stream-chat -H "$AUTH_HEADER" -H 'Content-Type: application/json' --data "$CHAT_BODY" || true)
  END_MS=$(date +%s%3N); DURATION_MS=$((END_MS-START_MS))
  node - /tmp/campaign360.sse "$HTTP_CODE" "$DURATION_MS" <<'NODE'
const fs=require('fs');
const p=process.argv[2], http=process.argv[3], duration=Number(process.argv[4]);
let raw=''; try{raw=fs.readFileSync(p,'utf8')}catch{}
let text='', sources=[], errors=[];
for(const line of raw.split(/\r?\n/)){
  const s=line.trim(); if(!s) continue;
  const candidate=s.startsWith('data:')?s.slice(5).trim():s;
  try{const j=JSON.parse(candidate); if(typeof j.textResponse==='string') text+=j.textResponse; if(Array.isArray(j.sources)) sources.push(...j.sources); if(j.error) errors.push(String(j.error));}catch{}
}
const uniq=[...new Set(sources.map(x=>x?.title||x?.source||x?.chunkSource||x?.docSource).filter(Boolean))];
let parsed=null; try{parsed=JSON.parse(text.replace(/^```json\s*/,'').replace(/\s*```$/,''))}catch{}
const sections=['canonical_brief','business_context','market_customer','icp','positioning','offer','funnel','creative_strategy','paid_media_strategy','whatsapp_sales','measurement','final_synthesis','unknowns','evidence_used'];
const present=parsed?sections.filter(k=>Object.prototype.hasOwnProperty.call(parsed,k)):[];
console.log(`[ASTRA_NEXT_CAMPAIGN360] http=${http} duration_ms=${duration} chars=${text.length} sources=${uniq.length} json_valid=${!!parsed} sections=${present.length}/${sections.length} errors=${errors.length}`);
console.log(`[ASTRA_NEXT_CAMPAIGN360] source_names=${JSON.stringify(uniq)}`);
console.log(`[ASTRA_NEXT_CAMPAIGN360] errors=${JSON.stringify(errors)}`);
const b64=Buffer.from(text,'utf8').toString('base64'); const size=2800; const n=Math.max(1,Math.ceil(b64.length/size));
for(let i=0;i<n;i++) console.log(`[ASTRA_NEXT_CAMPAIGN360_RESULT_B64 ${i+1}/${n}] ${b64.slice(i*size,(i+1)*size)}`);
console.log(`[ASTRA_NEXT_CAMPAIGN360] status=${http==='200'&&text.length>0&&!!parsed&&present.length===sections.length?'PASS':'FAIL'}`);
NODE
else
  log "campaign360_skipped run=${RUN_CAMPAIGN360_POC:-false} kb_total=${KB_TOTAL} kb_fail=${KB_FAIL}"
fi

log "bootstrap_complete"
wait "$APP_PID"
