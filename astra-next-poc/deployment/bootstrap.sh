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

# ASTRA-NEXT-06: materialize a real, side-effect-free AnythingLLM Agent Flow.
# The flow accepts an already-grounded Campaign360 payload and returns it directly.
# It intentionally contains no llmInstruction, API call, web scraping, or secret.
FLOW_NAME='ASTRA NEXT Campaign360 Handoff'
FLOW_LIST=$(curl -fsS http://127.0.0.1:3001/api/agent-flows/list -H "$AUTH_HEADER" || true)
FLOW_UUID=$(printf '%s' "$FLOW_LIST" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);const f=(j.flows||[]).find(x=>x.name==="ASTRA NEXT Campaign360 Handoff");process.stdout.write(f?.uuid||"")}catch{}})')
if [ -z "$FLOW_UUID" ]; then
  FLOW_BODY=$(node <<'NODE'
const body={
  name:'ASTRA NEXT Campaign360 Handoff',
  config:{
    description:'Receive an already-grounded ASTRA NEXT Campaign360 JSON payload and return it unchanged as a deterministic handoff. No external side effects.',
    active:true,
    steps:[{
      type:'start',
      config:{
        variables:[{
          name:'campaign_json',
          type:'required',
          description:'Already-grounded Campaign360 JSON payload. Preserve exactly.',
          value:''
        }],
        directOutput:true
      }
    }]
  }
};
process.stdout.write(JSON.stringify(body));
NODE
)
  FLOW_SAVE=$(curl -fsS -X POST http://127.0.0.1:3001/api/agent-flows/save -H "$AUTH_HEADER" -H 'Content-Type: application/json' --data "$FLOW_BODY" || true)
  FLOW_UUID=$(printf '%s' "$FLOW_SAVE" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(j.flow?.uuid||"")}catch{}})')
  [ -n "$FLOW_UUID" ] && log "agent_flow_saved name=ASTRA_NEXT_Campaign360_Handoff uuid=${FLOW_UUID}" || log "ERROR agent_flow_save_failed"
else
  log "agent_flow_exists name=ASTRA_NEXT_Campaign360_Handoff uuid=${FLOW_UUID}"
fi

FLOW_LIST=$(curl -fsS http://127.0.0.1:3001/api/agent-flows/list -H "$AUTH_HEADER" || true)
FLOW_ACTIVE=$(printf '%s' "$FLOW_LIST" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d),u=process.argv[1];const f=(j.flows||[]).find(x=>x.uuid===u);process.stdout.write(f&&f.active!==false?"yes":"no")}catch{process.stdout.write("no")}})' "$FLOW_UUID")
if [ -n "$FLOW_UUID" ] && [ "$FLOW_ACTIVE" = "yes" ]; then
  log "agent_flow_materialization status=PASS uuid=${FLOW_UUID} active=true blocks=1 side_effects=0"
else
  log "ERROR agent_flow_materialization status=FAIL uuid=${FLOW_UUID:-missing} active=${FLOW_ACTIVE}"
fi

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
  log "campaign360_start case=metodo360_control_v1 manifest=ASTRA_NEXT_POC_KB_V1 gate=ASTRA-NEXT-05 mode=sync-api"
  SYS_PROMPT='You are ASTRA NEXT Campaign360. Treat the canonical brief as immutable facts. Use the workspace knowledge as evidence. Never invent missing business facts. For every material assertion classify it as FACT, EVIDENCE, INFERENCE, RECOMMENDATION, or UNKNOWN. Every claim object must use the shape {"statement":"...","classification":"FACT|EVIDENCE|INFERENCE|RECOMMENDATION|UNKNOWN","evidence_ids":[]}. FACT claims may use an empty evidence_ids array only when directly supported by the canonical brief. Every EVIDENCE claim MUST contain one or more evidence_ids. Every evidence_id referenced by a claim MUST exactly match a unique evidence_id declared in evidence_used. evidence_used must contain unique evidence_id values and the sourceDocument for each cited source. Never classify a claim as EVIDENCE unless you can cite at least one valid evidence_id. If evidence is unavailable, classify the assertion as INFERENCE, RECOMMENDATION, or UNKNOWN instead. Produce a complete commercial campaign in Spanish (Mexico) covering exactly: canonical_brief, business_context, market_customer, icp, positioning, offer, funnel, creative_strategy, paid_media_strategy, whatsapp_sales, measurement, final_synthesis, unknowns, evidence_used. Preserve price, market, objective, conversion channel and audience exactly. Distinguish evidence from recommendation. Return valid JSON only.'
  UPDATE_BODY=$(node -e 'process.stdout.write(JSON.stringify({openAiPrompt:process.argv[1],openAiTemp:0.2,topN:12,similarityThreshold:0.15,chatMode:"chat"}))' "$SYS_PROMPT")
  curl -fsS -X POST http://127.0.0.1:3001/api/workspace/astra-next/update -H "$AUTH_HEADER" -H 'Content-Type: application/json' --data "$UPDATE_BODY" >/tmp/astra_workspace_update.json || true

  API_KEYS_JSON=$(curl -fsS http://127.0.0.1:3001/api/system/api-keys -H "$AUTH_HEADER" || true)
  DEV_API_KEY=$(printf '%s' "$API_KEYS_JSON" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);const k=(j.apiKeys||[]).find(x=>x.name==="astra-next-poc");process.stdout.write(k?.secret||"")}catch{}})')
  if [ -z "$DEV_API_KEY" ]; then
    API_KEY_JSON=$(curl -fsS -X POST http://127.0.0.1:3001/api/system/generate-api-key -H "$AUTH_HEADER" -H 'Content-Type: application/json' --data '{"name":"astra-next-poc"}' || true)
    DEV_API_KEY=$(printf '%s' "$API_KEY_JSON" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(j.apiKey?.secret||"")}catch{}})')
  fi
  if [ -z "$DEV_API_KEY" ]; then
    log "ERROR developer_api_key_unavailable"
  else
    log "developer_api_key_ready"
  fi

  CAMPAIGN_PROMPT='CANONICAL BRIEF — DO NOT ALTER: Business: infoproduct for estéticas. Product: mini curso Método 360. Price: 400 MXN. Market: México. Objective: sell the mini course. Conversion channel: WhatsApp. Core proposition: teach estéticas how to fill their appointment agenda. Requirement: create the complete Campaign360 using only these facts plus evidence retrieved from ASTRA_NEXT_POC_KB_V1. Any unsupported detail must be INFERENCE, RECOMMENDATION or UNKNOWN, never FACT. STRICT TRACEABILITY: every claim classified EVIDENCE must include evidence_ids with at least one ID; every cited ID must exist exactly once in evidence_used; every evidence_used item must have a unique evidence_id and sourceDocument. Do not emit EVIDENCE without resolvable evidence_ids. Return valid JSON only with all required sections.'
  CHAT_BODY=$(node -e 'process.stdout.write(JSON.stringify({message:process.argv[1],mode:"chat",sessionId:"astra-next-05-metodo360-control-v1",attachments:[],reset:true}))' "$CAMPAIGN_PROMPT")
  rm -f /tmp/campaign360.sync.json /tmp/campaign360.normalized.json /tmp/astra_next_adjudication.json

  START_MS=$(date +%s%3N)
  if [ -n "$DEV_API_KEY" ]; then
    HTTP_CODE=$(curl -sS --max-time 600 -o /tmp/campaign360.sync.json -w '%{http_code}' -X POST http://127.0.0.1:3001/api/v1/workspace/astra-next/chat -H "Authorization: Bearer ${DEV_API_KEY}" -H 'Content-Type: application/json' --data "$CHAT_BODY" || true)
  else
    HTTP_CODE=000
  fi
  END_MS=$(date +%s%3N); DURATION_MS=$((END_MS-START_MS))

  if [ -s /tmp/campaign360.sync.json ]; then
    node - /tmp/campaign360.sync.json "$HTTP_CODE" "$DURATION_MS" <<'NODE'
const fs=require('fs');
const p=process.argv[2], http=process.argv[3], duration=Number(process.argv[4]);
const result=JSON.parse(fs.readFileSync(p,'utf8'));
const text=typeof result.textResponse==='string'?result.textResponse:'';
const sources=Array.isArray(result.sources)?result.sources:[];
const errors=result.error?[String(result.error)]:[];
const metrics=result.metrics||{};
const uniq=[...new Set(sources.map(x=>x?.title||x?.source||x?.chunkSource||x?.docSource||x?.sourceDocument).filter(Boolean))];
const normalized=text
  .replace(/^\s*<think>[\s\S]*?<\/think>\s*/i,'')
  .replace(/^```json\s*/i,'')
  .replace(/\s*```\s*$/,'')
  .trim();
let parsed=null; try{parsed=JSON.parse(normalized)}catch{}
if(parsed) fs.writeFileSync('/tmp/campaign360.normalized.json', JSON.stringify(parsed, null, 2));
const sections=['canonical_brief','business_context','market_customer','icp','positioning','offer','funnel','creative_strategy','paid_media_strategy','whatsapp_sales','measurement','final_synthesis','unknowns','evidence_used'];
const present=parsed?sections.filter(k=>Object.prototype.hasOwnProperty.call(parsed,k)):[];
console.log(`[ASTRA_NEXT_CAMPAIGN360] mode=sync-api http=${http} duration_ms=${duration} chars=${text.length} normalized_chars=${normalized.length} sources=${uniq.length} json_valid=${!!parsed} sections=${present.length}/${sections.length} errors=${errors.length}`);
console.log(`[ASTRA_NEXT_CAMPAIGN360] source_names=${JSON.stringify(uniq)}`);
console.log(`[ASTRA_NEXT_CAMPAIGN360] errors=${JSON.stringify(errors)}`);
console.log(`[ASTRA_NEXT_CAMPAIGN360_METRICS] ${JSON.stringify(metrics)}`);
const b64=Buffer.from(normalized,'utf8').toString('base64'); const size=2800; const n=Math.max(1,Math.ceil(b64.length/size));
for(let i=0;i<n;i++) console.log(`[ASTRA_NEXT_CAMPAIGN360_RESULT_B64 ${i+1}/${n}] ${b64.slice(i*size,(i+1)*size)}`);
console.log(`[ASTRA_NEXT_CAMPAIGN360] status=${http==='200'&&normalized.length>0&&!!parsed&&present.length===sections.length&&!result.error?'PASS':'FAIL'}`);
NODE
  else
    log "ERROR campaign360_sync_api_failed http=${HTTP_CODE}"
  fi

  if [ -s /tmp/campaign360.normalized.json ]; then
    node /opt/astra-next-benchmark/adjudicate_campaign360.js /tmp/campaign360.normalized.json >/tmp/astra_next_adjudication.json
    node - /tmp/astra_next_adjudication.json <<'NODE'
const fs=require('fs');
const j=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
console.log(`[ASTRA_NEXT_ADJUDICATION] status=${j.status} brief_fidelity_pct=${j.brief_fidelity_pct} critical_hallucinations=${j.critical_hallucinations} knowledge_grounding_pct=${j.knowledge_grounding_pct} cross_node_contradictions=${j.cross_node_contradictions} claims=${j.claim_counts.total_classified_claims} groundable=${j.claim_counts.groundable_fact_or_evidence_claims} grounded=${j.claim_counts.grounded_fact_or_evidence_claims} unsupported=${j.claim_counts.unsupported_claims} evidence_registry_valid=${j.evidence_registry?.valid===true}`);
const b64=Buffer.from(JSON.stringify(j),'utf8').toString('base64');
const size=2800, n=Math.max(1,Math.ceil(b64.length/size));
for(let i=0;i<n;i++) console.log(`[ASTRA_NEXT_ADJUDICATION_B64 ${i+1}/${n}] ${b64.slice(i*size,(i+1)*size)}`);
NODE
  else
    log "ERROR adjudication_skipped normalized_result_missing"
  fi
else
  log "campaign360_skipped run=${RUN_CAMPAIGN360_POC:-false} kb_total=${KB_TOTAL} kb_fail=${KB_FAIL}"
fi

# ASTRA-NEXT-06 optional one-shot real Agent Flow invocation.
# Uses automatic native tool calling. No external API side effects are present in the flow.
if [ "${RUN_AGENT_FLOW_POC:-false}" = "true" ] && [ -n "$FLOW_UUID" ] && [ "$FLOW_ACTIVE" = "yes" ]; then
  log "agent_flow_execution_start gate=ASTRA-NEXT-06 uuid=${FLOW_UUID} mode=automatic"
  API_KEYS_JSON=$(curl -fsS http://127.0.0.1:3001/api/system/api-keys -H "$AUTH_HEADER" || true)
  DEV_API_KEY=$(printf '%s' "$API_KEYS_JSON" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);const k=(j.apiKeys||[]).find(x=>x.name==="astra-next-agent-flow-poc");process.stdout.write(k?.secret||"")}catch{}})')
  if [ -z "$DEV_API_KEY" ]; then
    API_KEY_JSON=$(curl -fsS -X POST http://127.0.0.1:3001/api/system/generate-api-key -H "$AUTH_HEADER" -H 'Content-Type: application/json' --data '{"name":"astra-next-agent-flow-poc"}' || true)
    DEV_API_KEY=$(printf '%s' "$API_KEY_JSON" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(j.apiKey?.secret||"")}catch{}})')
  fi

  HANDOFF_PAYLOAD='{"brief_id":"ASTRA_NEXT_POC_METODO360_V1","quality_gate":"PASS","brief_fidelity_pct":100,"knowledge_grounding_pct":100,"critical_hallucinations":0,"evidence_registry_valid":true}'
  AGENT_PROMPT=$(node -e 'process.stdout.write(`You MUST use the tool astra_next_campaign360_handoff exactly once. Pass campaign_json as this exact JSON string without changing any character: ${process.argv[1]}. Do not answer without calling the tool.`)' "$HANDOFF_PAYLOAD")
  AGENT_BODY=$(node -e 'process.stdout.write(JSON.stringify({message:process.argv[1],mode:"automatic",sessionId:"astra-next-06-agent-flow-handoff",attachments:[],reset:true}))' "$AGENT_PROMPT")
  rm -f /tmp/agent_flow_result.json
  START_MS=$(date +%s%3N)
  if [ -n "$DEV_API_KEY" ]; then
    FLOW_HTTP=$(curl -sS --max-time 180 -o /tmp/agent_flow_result.json -w '%{http_code}' -X POST http://127.0.0.1:3001/api/v1/workspace/astra-next/chat -H "Authorization: Bearer ${DEV_API_KEY}" -H 'Content-Type: application/json' --data "$AGENT_BODY" || true)
  else
    FLOW_HTTP=000
  fi
  END_MS=$(date +%s%3N); FLOW_DURATION_MS=$((END_MS-START_MS))
  FLOW_CHECK=$(node - /tmp/agent_flow_result.json "$HANDOFF_PAYLOAD" <<'NODE'
const fs=require('fs');
const path=process.argv[2], expected=process.argv[3];
let out={ok:false,textLength:0,error:null};
try {
  const r=JSON.parse(fs.readFileSync(path,'utf8'));
  const text=typeof r.textResponse==='string'?r.textResponse:'';
  out.textLength=text.length; out.error=r.error||null;
  let parsed=null; try{parsed=JSON.parse(text)}catch{}
  if(parsed?.campaign_json===expected) out.ok=true;
  if(parsed?.directOutput?.campaign_json===expected) out.ok=true;
  if(parsed?.variables?.campaign_json===expected) out.ok=true;
  if(text.includes(expected)) out.ok=true;
} catch(e) { out.error=e.message; }
process.stdout.write(JSON.stringify(out));
NODE
)
  FLOW_MATCH=$(printf '%s' "$FLOW_CHECK" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);process.stdout.write(j.ok?"true":"false")})')
  FLOW_TEXT_LEN=$(printf '%s' "$FLOW_CHECK" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);process.stdout.write(String(j.textLength||0))})')
  FLOW_ERR=$(printf '%s' "$FLOW_CHECK" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);process.stdout.write(j.error?String(j.error):"")})')
  if [ "$FLOW_HTTP" = "200" ] && [ "$FLOW_MATCH" = "true" ] && [ -z "$FLOW_ERR" ]; then
    log "agent_flow_execution status=PASS http=${FLOW_HTTP} duration_ms=${FLOW_DURATION_MS} exact_payload_preserved=true response_chars=${FLOW_TEXT_LEN} side_effects=0"
  else
    log "ERROR agent_flow_execution status=FAIL http=${FLOW_HTTP} duration_ms=${FLOW_DURATION_MS} exact_payload_preserved=${FLOW_MATCH} response_chars=${FLOW_TEXT_LEN} error=${FLOW_ERR:-none}"
  fi
else
  log "agent_flow_execution_skipped run=${RUN_AGENT_FLOW_POC:-false} uuid=${FLOW_UUID:-missing} active=${FLOW_ACTIVE:-no}"
fi

log "bootstrap_complete"
wait "$APP_PID"
