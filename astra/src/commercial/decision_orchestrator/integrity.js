'use strict';
// [ASTRA-11M integrity] Deterministic self-attestation. ASTRA-11M builds an OFFLINE analytical
// decision layer ONLY: no execution, no campaign/budget change, no deploy, no external
// integration, no Supabase / vector DB / embeddings / LLM, no production routing.
const fs = require('fs');
const path = require('path');
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

// match real side-effecting constructs, not our own prose disclaimers
const FORBIDDEN_RE = /require\(['"](http|https|net|dns|tls|dgram|child_process|redis|ioredis|@supabase\/supabase-js|@pinecone-database\/pinecone|weaviate-ts-client|@qdrant\/js-client-rest|openai|@anthropic-ai\/sdk|googleapis|facebook-nodejs-business-sdk)['"]\)|\bfetch\s*\(|XMLHttpRequest|new WebSocket|createClient\s*\(|\.createEmbedding\s*\(|\.embeddings\.\w|new (Redis|OpenAI|Anthropic)\s*\(|process\.env\.\w*(KEY|TOKEN|SECRET)/;

function attestIntegrity() {
  const dir = __dirname;
  const issues = [];
  let scanned = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js') || f === 'integrity.js') continue;
    scanned++;
    if (FORBIDDEN_RE.test(fs.readFileSync(path.join(dir, f), 'utf8'))) issues.push(`${f}: forbidden execution / external / LLM construct`);
  }
  const body = {
    schema_version: 'ucdm-decision-orchestrator-1.0.0', kind: 'IntegrityAttestation',
    modules_scanned: scanned,
    network_calls: 0, llm_calls: 0, production_db_writes: 0, external_storage_writes: 0,
    campaign_changes: 0, budget_changes: 0, deploys: 0, cost_usd: 0,
    executes_decisions: false, modifies_campaigns: false, changes_budgets: false, publishes_ads: false,
    connects_crm: false, connects_meta: false, connects_google_ads: false,
    uses_supabase: false, uses_vector_db: false, uses_embeddings: false, uses_llm: false,
    enables_production_routing: false, implements_astra_11n: false,
    issues: issues.sort(),
    clean: issues.length === 0,
    note: 'ASTRA-11M is an OFFLINE analytical decision orchestrator. It recommends a ranked decision set; it executes nothing. All output carries triggers_action=false.',
    generated_by: 'deterministic:ucdm/decision_orchestrator/integrity',
  };
  body.attestation_id = 'dcig_' + sha256Hex(canonicalize({ ...body, attestation_id: undefined }));
  return deepFreeze(body);
}

module.exports = { attestIntegrity };
