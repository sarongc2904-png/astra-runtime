FROM mintplexlabs/anythingllm:latest

USER root

# POC-only compatibility patch: bound OpenRouter output reservations, emit usage,
# and register the ASTRA NEXT protected creative gateway before AnythingLLM's UI catch-all.
RUN node - <<'NODE'
const fs = require('fs');
const p = '/app/server/utils/AiProviders/openRouter/index.js';
let s = fs.readFileSync(p, 'utf8');
const needle = 'temperature,\n          // This is an OpenRouter specific option';
const replacement = 'temperature,\n          max_tokens: Number(process.env.OPENROUTER_MAX_TOKENS || 8192),\n          // This is an OpenRouter specific option';
if (!s.includes(needle)) throw new Error('OpenRouter non-stream patch target not found');
s = s.replace(needle, replacement);
const streamNeedle = 'temperature,\n        // This is an OpenRouter specific option';
const streamReplacement = 'temperature,\n        max_tokens: Number(process.env.OPENROUTER_MAX_TOKENS || 8192),\n        // This is an OpenRouter specific option';
if (!s.includes(streamNeedle)) throw new Error('OpenRouter stream patch target not found');
s = s.replace(streamNeedle, streamReplacement);
const syncMetricsNeedle = `total_tokens: result.output.usage.total_tokens || 0,\n        outputTps:`;
const syncMetricsReplacement = `total_tokens: result.output.usage.total_tokens || 0,\n        cost: typeof result.output.usage.cost === "number" ? result.output.usage.cost : null,\n        cost_details: result.output.usage.cost_details || null,\n        outputTps:`;
if (!s.includes(syncMetricsNeedle)) throw new Error('OpenRouter sync usage telemetry patch target not found');
s = s.replace(syncMetricsNeedle, syncMetricsReplacement);
const usageNeedle = `usage = {\n              prompt_tokens: chunk.usage.prompt_tokens,\n              completion_tokens: chunk.usage.completion_tokens,\n              total_tokens: chunk.usage.total_tokens,\n            };`;
const usageReplacement = `usage = {\n              prompt_tokens: chunk.usage.prompt_tokens || 0,\n              completion_tokens: chunk.usage.completion_tokens || 0,\n              total_tokens: chunk.usage.total_tokens || 0,\n              cost: typeof chunk.usage.cost === "number" ? chunk.usage.cost : null,\n              cost_details: chunk.usage.cost_details || null,\n            };\n            console.log("[ASTRA_NEXT_OPENROUTER_USAGE] " + JSON.stringify(usage));`;
if (!s.includes(usageNeedle)) throw new Error('OpenRouter stream usage telemetry patch target not found');
s = s.replace(usageNeedle, usageReplacement);
fs.writeFileSync(p, s);

const agentPath = '/app/server/utils/agents/aibitat/providers/openrouter.js';
let a = fs.readFileSync(agentPath, 'utf8');
const agentNeedle = '{ provider: this, serviceTier: this.serviceTier }';
const occurrences = a.split(agentNeedle).length - 1;
if (occurrences !== 2) throw new Error(`OpenRouter agent patch expected 2 targets, found ${occurrences}`);
a = a.split(agentNeedle).join('{ provider: this, serviceTier: this.serviceTier, maxTokens: Number(process.env.OPENROUTER_AGENT_MAX_TOKENS || 4096) }');
fs.writeFileSync(agentPath, a);

const serverPath = '/app/server/index.js';
let server = fs.readFileSync(serverPath, 'utf8');
const routeMarker = 'browserExtensionEndpoints(apiRouter);\n\nif (process.env.NODE_ENV !== "development") {';
const routeInsert = 'browserExtensionEndpoints(apiRouter);\n\n// ASTRA-NEXT-11: protected creative entrypoint. This route performs mandatory\n// knowledge preflight before any creative generation and is registered before\n// the production UI catch-all.\nconst { handleCreativeGateway } = require("/opt/astra-next-poc/runtime/creative_http_handler.js");\napp.post("/astra-next/creative", handleCreativeGateway);\n\nif (process.env.NODE_ENV !== "development") {';
if (!server.includes(routeMarker)) throw new Error('AnythingLLM server route patch target not found');
server = server.replace(routeMarker, routeInsert);
fs.writeFileSync(serverPath, server);
NODE

COPY astra-next-poc/deployment/bootstrap.sh /usr/local/bin/astra-next-bootstrap.sh
COPY astra-next-poc/deployment/entrypoint.sh /usr/local/bin/astra-next-entrypoint.sh
RUN chmod +x /usr/local/bin/astra-next-bootstrap.sh /usr/local/bin/astra-next-entrypoint.sh

# ASTRA-NEXT-07 persistent KB gate. Keep the source bootstrap unchanged while
# making runtime ingestion idempotent across redeploys. The marker lives inside
# STORAGE_DIR, so it survives instance replacement on the Render persistent disk.
RUN python3 - <<'PY'
from pathlib import Path
p = Path('/usr/local/bin/astra-next-bootstrap.sh')
s = p.read_text()
old = '''KB_DIR=/opt/astra-next-kb
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
    if [ "$OK" = "yes" ]; then KB_PASS=$((KB_PASS+1)); log "kb_ingest_pass file=${BASE}"; else KB_FAIL=$((KB_FAIL+1)); BODY=$(tr '\\n' ' ' < "$TMP" | head -c 300); log "ERROR kb_ingest_fail file=${BASE} http=${HTTP_CODE} body=${BODY}"; fi
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
'''
new = '''KB_DIR=/opt/astra-next-kb
KB_MANIFEST=ASTRA_NEXT_POC_KB_V1
KB_MARKER_DIR="${STORAGE_DIR:-/app/server/storage}/astra-next-state"
KB_MARKER_FILE="${KB_MARKER_DIR}/${KB_MANIFEST}.sha256"
KB_TOTAL=0; KB_PASS=0; KB_FAIL=0
if [ -n "${OPENROUTER_API_KEY:-}" ] && [ -d "$KB_DIR" ]; then
  KB_TOTAL=$(find "$KB_DIR" -maxdepth 1 -type f | wc -l | tr -d ' ')
  KB_FINGERPRINT=$(find "$KB_DIR" -maxdepth 1 -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')
  INSTALLED_FINGERPRINT=""
  [ -f "$KB_MARKER_FILE" ] && INSTALLED_FINGERPRINT=$(tr -d '\\r\\n' < "$KB_MARKER_FILE")
  if [ "$KB_TOTAL" -eq 7 ] && [ -n "$KB_FINGERPRINT" ] && [ "$INSTALLED_FINGERPRINT" = "$KB_FINGERPRINT" ]; then
    KB_PASS=$KB_TOTAL
    log "kb_manifest_match manifest=${KB_MANIFEST} fingerprint=${KB_FINGERPRINT}"
    log "kb_ingestion_skipped reason=manifest_unchanged manifest=${KB_MANIFEST} total=${KB_TOTAL}"
  else
    log "kb_ingestion_start manifest=${KB_MANIFEST} workspace=astra-next fingerprint=${KB_FINGERPRINT}"
    KB_PASS=0; KB_FAIL=0
    for FILE in "$KB_DIR"/*; do
      [ -f "$FILE" ] || continue
      BASE=$(basename "$FILE"); TMP=$(mktemp)
      HTTP_CODE=$(curl -sS -o "$TMP" -w '%{http_code}' -X POST http://127.0.0.1:3001/api/workspace/astra-next/upload-and-embed -H "$AUTH_HEADER" -F "file=@${FILE}" || true)
      OK=no
      if [ "$HTTP_CODE" = "200" ]; then
        OK=$(node - "$TMP" <<'NODE'
const fs=require('fs'); try{const j=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));process.stdout.write(j.success===true?'yes':'no')}catch{process.stdout.write('no')}
NODE
)
      fi
      if [ "$OK" = "yes" ]; then KB_PASS=$((KB_PASS+1)); log "kb_ingest_pass file=${BASE}"; else KB_FAIL=$((KB_FAIL+1)); BODY=$(tr '\\n' ' ' < "$TMP" | head -c 300); log "ERROR kb_ingest_fail file=${BASE} http=${HTTP_CODE} body=${BODY}"; fi
      rm -f "$TMP"
    done
    if [ "$KB_TOTAL" -eq 7 ] && [ "$KB_PASS" -eq 7 ] && [ "$KB_FAIL" -eq 0 ]; then
      mkdir -p "$KB_MARKER_DIR"
      printf '%s\\n' "$KB_FINGERPRINT" > "$KB_MARKER_FILE"
      log "kb_ingestion_complete status=PASS manifest=${KB_MANIFEST} total=${KB_TOTAL} passed=${KB_PASS} failed=${KB_FAIL} marker_saved=true"
    else
      log "ERROR kb_ingestion_complete status=FAIL manifest=${KB_MANIFEST} total=${KB_TOTAL} passed=${KB_PASS} failed=${KB_FAIL} marker_saved=false"
    fi
  fi
else
  log "ERROR kb_ingestion_skipped reason=openrouter_or_kb_dir_missing"
fi
'''
if old not in s:
    raise SystemExit('ASTRA-NEXT-07 bootstrap KB block not found')
p.write_text(s.replace(old, new, 1))
PY

RUN mkdir -p /opt/astra-next-kb /opt/astra-next-benchmark /opt/astra-next-creative /opt/astra-next-poc/runtime /opt/astra-next-poc/knowledge /opt/astra-next-poc/benchmark
COPY astra-next-poc/benchmark/adjudicate_campaign360.js /opt/astra-next-benchmark/adjudicate_campaign360.js
COPY astra-next-poc/benchmark/run_campaign360_sync.js /opt/astra-next-benchmark/run_campaign360_sync.js
COPY astra-next-poc/benchmark/run_knowledge_routing_audit.js /opt/astra-next-benchmark/run_knowledge_routing_audit.js
COPY astra-next-poc/benchmark/run_grounded_creative_output_qa.js /opt/astra-next-benchmark/run_grounded_creative_output_qa.js
COPY astra-next-poc/benchmark/run_creative_gateway_enforcement_qa.js /opt/astra-next-poc/benchmark/run_creative_gateway_enforcement_qa.js
COPY astra-next-poc/benchmark/run_creative_http_gateway_qa.js /opt/astra-next-poc/benchmark/run_creative_http_gateway_qa.js
COPY astra-next-poc/benchmark/run_creative_http_e2e_qa.js /opt/astra-next-poc/benchmark/run_creative_http_e2e_qa.js
COPY astra-next-poc/runtime/creative_gateway.js /opt/astra-next-poc/runtime/creative_gateway.js
COPY astra-next-poc/runtime/creative_http_handler.js /opt/astra-next-poc/runtime/creative_http_handler.js
COPY astra-next-poc/knowledge/creative_knowledge_router.js /opt/astra-next-poc/knowledge/creative_knowledge_router.js
COPY astra-next-poc/knowledge/creative_knowledge_router.js /opt/astra-next-creative/creative_knowledge_router.js
COPY astra-next-poc/knowledge/creative_source_manifest.json /opt/astra-next-creative/creative_source_manifest.json
COPY astra-next-poc/knowledge/META_ANDROMEDA_VERIFIED_2026.md /opt/astra-next-creative/META_ANDROMEDA_VERIFIED_2026.md
COPY astra/methods/registry.json /opt/astra-next-kb/01-method-registry.json
COPY astra/ASTRA_03_KNOWLEDGE_METHOD_DISCOVERY_REPORT.md /opt/astra-next-kb/02-knowledge-method-discovery.md
COPY astra/ASTRA_03B_MULTI_DOMAIN_KNOWLEDGE_SOURCE_INGESTION_REPORT.md /opt/astra-next-kb/03-multi-domain-ingestion-report.md
COPY astra/src/router/knowledge_query_planner.js /opt/astra-next-kb/04-knowledge-query-planner.js
COPY astra/src/creative/creative_knowledge.js /opt/astra-next-kb/05-creative-knowledge.js
COPY astra/ASTRA_08A_DESIGN_KNOWLEDGE_COVERAGE_AUDIT_REPORT.md /opt/astra-next-kb/06-design-knowledge-audit.md
COPY astra/knowledge_gap_ingestion/extraction_qa.json /opt/astra-next-kb/07-meta-ads-extraction-qa.json
RUN chown -R anythingllm:anythingllm /opt/astra-next-kb /opt/astra-next-benchmark /opt/astra-next-creative /opt/astra-next-poc && chmod -R a+rX /opt/astra-next-kb /opt/astra-next-benchmark /opt/astra-next-creative /opt/astra-next-poc

ENV ASTRA_NEXT_ANDROMEDA_SOURCE=/opt/astra-next-creative/META_ANDROMEDA_VERIFIED_2026.md
ENV STORAGE_DIR=/app/server/storage
EXPOSE 3001

USER anythingllm
ENTRYPOINT ["/usr/local/bin/astra-next-entrypoint.sh"]
