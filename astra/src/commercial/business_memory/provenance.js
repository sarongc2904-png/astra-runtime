'use strict';
// [ASTRA-11L §5] Provenance. Every memory is traceable to its origin WITHOUT free text.
// Answers "why does ASTRA remember this?" structurally. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { scopeHash } = require('./scope');

// buildProvenance({ source_engine, source_report_id, source_entity_id, source_timestamp,
//                   source_content?, evidence_refs[], input_scope })
function buildProvenance(x) {
  const src = x.source_content == null ? null : (typeof x.source_content === 'string' ? x.source_content : canonicalize(x.source_content));
  const body = {
    schema_version: 'ucdm-business-memory-1.0.0', kind: 'MemoryProvenance',
    source_engine: x.source_engine == null ? null : String(x.source_engine),
    source_report_id: x.source_report_id == null ? null : String(x.source_report_id),
    source_entity_id: x.source_entity_id == null ? null : String(x.source_entity_id),
    source_timestamp: x.source_timestamp == null ? null : String(x.source_timestamp),
    source_hash: src == null ? null : 'srch_' + sha256Hex(src),
    evidence_refs: [...new Set((x.evidence_refs || []).map(String))].sort(),
    input_scope_hash: x.input_scope ? scopeHash(x.input_scope) : null,
    complete: false,
    missing: [],
    generated_by: 'deterministic:ucdm/business_memory',
  };
  const req = ['source_engine', 'source_report_id', 'source_entity_id'];
  body.missing = req.filter(k => !body[k]).concat(body.evidence_refs.length === 0 ? ['evidence_refs'] : []).sort();
  body.complete = body.missing.length === 0;
  body.provenance_id = 'bmp_' + sha256Hex(canonicalize({ ...body, provenance_id: undefined }));
  return deepFreeze(body);
}

function validateProvenance(p, { requireComplete = false } = {}) {
  const errors = [];
  if (requireComplete && !p.complete) errors.push(`provenance incomplete (missing: ${p.missing.join(', ')})`);
  if (p.evidence_refs.length === 0) errors.push('provenance must carry at least one evidence ref');
  return { valid: errors.length === 0, errors };
}

module.exports = { buildProvenance, validateProvenance };
