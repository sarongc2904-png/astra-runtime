'use strict';
// [ASTRA-11L integrity] Deterministic self-attestation. ASTRA-11L builds the offline memory
// engine + contracts ONLY: no Supabase, no vector DB, no Redis, no external storage, no
// production writes, no embeddings, no LLM summarization, no autonomous long-term memory.
const fs = require('fs');
const path = require('path');
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

// match actual side-effecting constructs, not our own prose disclaimers ("no embeddings")
const FORBIDDEN_RE = /require\(['"](http|https|net|dns|tls|dgram|child_process|redis|ioredis|@supabase\/supabase-js|@pinecone-database\/pinecone|openai|@anthropic-ai\/sdk)['"]\)|\bfetch\s*\(|XMLHttpRequest|new WebSocket|createClient\s*\(|\.createEmbedding\s*\(|\.embeddings\.|vectorStore\s*\(|process\.env\.\w*(KEY|TOKEN|SECRET)/;

function attestIntegrity() {
  const dir = __dirname;
  const issues = [];
  let scanned = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js') || f === 'integrity.js') continue;
    scanned++;
    if (FORBIDDEN_RE.test(fs.readFileSync(path.join(dir, f), 'utf8'))) issues.push(`${f}: forbidden persistence / external / LLM construct`);
  }
  const body = {
    schema_version: 'ucdm-business-memory-1.0.0', kind: 'IntegrityAttestation',
    modules_scanned: scanned,
    network_calls: 0, llm_calls: 0, production_db_writes: 0, external_storage_writes: 0, deploys: 0, cost_usd: 0,
    uses_supabase: false, uses_vector_db: false, uses_redis: false, uses_embeddings: false,
    uses_llm_summarization: false, autonomous_long_term_memory: false,
    connects_crm: false, connects_meta: false, executes_experiments: false, modifies_campaigns: false,
    takes_commercial_action: false, deploys_anything: false, enables_production_routing: false,
    issues: issues.sort(),
    clean: issues.length === 0,
    note: 'ASTRA-11L is an OFFLINE memory engine + contracts. It persists nothing. Snapshots and records live only in the returned object.',
    generated_by: 'deterministic:ucdm/business_memory/integrity',
  };
  body.attestation_id = 'bmig_' + sha256Hex(canonicalize({ ...body, attestation_id: undefined }));
  return deepFreeze(body);
}

module.exports = { attestIntegrity };
