FROM mintplexlabs/anythingllm:latest

USER root

# POC-only compatibility patch: AnythingLLM's OpenRouter chat adapter currently omits
# max_tokens, which makes OpenRouter reserve the model's full output ceiling.
# Inject a bounded max_tokens value while keeping the same provider/model.
# Also emit exact OpenRouter usage for benchmark telemetry.
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

// Agent-mode OpenRouter uses the shared tooled helper. The helper supports an
// explicit maxTokens option, but the OpenRouter provider does not pass it.
// Bound only the agent output budget so low-credit accounts do not reserve the
// model's full 65k output ceiling before a tool call can execute.
const agentPath = '/app/server/utils/agents/aibitat/providers/openrouter.js';
let a = fs.readFileSync(agentPath, 'utf8');
const agentNeedle = '{ provider: this, serviceTier: this.serviceTier }';
const occurrences = a.split(agentNeedle).length - 1;
if (occurrences !== 2) throw new Error(`OpenRouter agent patch expected 2 targets, found ${occurrences}`);
a = a.split(agentNeedle).join('{ provider: this, serviceTier: this.serviceTier, maxTokens: Number(process.env.OPENROUTER_AGENT_MAX_TOKENS || 4096) }');
fs.writeFileSync(agentPath, a);
NODE

COPY astra-next-poc/deployment/bootstrap.sh /usr/local/bin/astra-next-bootstrap.sh
RUN chmod +x /usr/local/bin/astra-next-bootstrap.sh

RUN mkdir -p /opt/astra-next-kb /opt/astra-next-benchmark
COPY astra-next-poc/benchmark/adjudicate_campaign360.js /opt/astra-next-benchmark/adjudicate_campaign360.js
COPY astra-next-poc/benchmark/run_campaign360_sync.js /opt/astra-next-benchmark/run_campaign360_sync.js
COPY astra/methods/registry.json /opt/astra-next-kb/01-method-registry.json
COPY astra/ASTRA_03_KNOWLEDGE_METHOD_DISCOVERY_REPORT.md /opt/astra-next-kb/02-knowledge-method-discovery.md
COPY astra/ASTRA_03B_MULTI_DOMAIN_KNOWLEDGE_SOURCE_INGESTION_REPORT.md /opt/astra-next-kb/03-multi-domain-ingestion-report.md
COPY astra/src/router/knowledge_query_planner.js /opt/astra-next-kb/04-knowledge-query-planner.js
COPY astra/src/creative/creative_knowledge.js /opt/astra-next-kb/05-creative-knowledge.js
COPY astra/ASTRA_08A_DESIGN_KNOWLEDGE_COVERAGE_AUDIT_REPORT.md /opt/astra-next-kb/06-design-knowledge-audit.md
COPY astra/knowledge_gap_ingestion/extraction_qa.json /opt/astra-next-kb/07-meta-ads-extraction-qa.json
RUN chown -R anythingllm:anythingllm /opt/astra-next-kb /opt/astra-next-benchmark && chmod -R a+rX /opt/astra-next-kb /opt/astra-next-benchmark

ENV STORAGE_DIR=/app/server/storage
EXPOSE 3001

USER anythingllm
ENTRYPOINT ["/usr/local/bin/astra-next-bootstrap.sh"]
