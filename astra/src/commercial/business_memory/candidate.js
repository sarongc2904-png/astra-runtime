'use strict';
// [ASTRA-11L §1] MemoryCandidate contract. Rejects a candidate missing business_id,
// memory_type, claim, source_engine or evidence_refs. Preserves the causal / statistical
// limitations that arrive with it. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze, nfcLF } = require('../validation/canonical');
const { isType } = require('./types');

const REQUIRED = Object.freeze(['business_id', 'memory_type', 'claim', 'source_engine', 'evidence_refs']);
const CANDIDATE_STATUS = Object.freeze(['CANDIDATE_VALID', 'CANDIDATE_MALFORMED']);

// normalizeClaim — deterministic identity input: NFC + LF, collapse whitespace, lowercase
function normalizeClaim(c) { return nfcLF(String(c == null ? '' : c)).replace(/\s+/g, ' ').trim().toLowerCase(); }

function makeCandidate(x) {
  const evidence_refs = [...new Set((x.evidence_refs || []).map(String))].sort();
  const missing = [];
  if (!x.business_id) missing.push('business_id');
  if (!isType(x.memory_type)) missing.push('memory_type');
  if (x.claim == null || String(x.claim).trim() === '') missing.push('claim');
  if (!x.source_engine) missing.push('source_engine');
  if (evidence_refs.length === 0) missing.push('evidence_refs');

  const body = {
    schema_version: 'ucdm-business-memory-1.0.0', kind: 'MemoryCandidate',
    business_id: x.business_id == null ? null : String(x.business_id),
    memory_type: isType(x.memory_type) ? String(x.memory_type) : null,
    claim: x.claim == null ? null : String(x.claim),
    normalized_claim: normalizeClaim(x.claim),
    source_engine: x.source_engine == null ? null : String(x.source_engine),
    source_report_id: x.source_report_id == null ? null : String(x.source_report_id),
    source_entity_id: x.source_entity_id == null ? null : String(x.source_entity_id),
    evidence_refs,
    created_at: x.created_at == null ? null : String(x.created_at),
    observed_at: x.observed_at == null ? null : String(x.observed_at),
    valid_from: x.valid_from == null ? null : String(x.valid_from),
    valid_until: x.valid_until == null ? null : String(x.valid_until),
    scope: x.scope || {},
    confidence_status: x.confidence_status == null ? null : String(x.confidence_status),
    causal_status: x.causal_status == null ? 'UNKNOWN' : String(x.causal_status),
    statistical_status: x.statistical_status == null ? 'UNKNOWN' : String(x.statistical_status),
    semantic_target: x.semantic_target == null ? null : String(x.semantic_target),
    metadata: x.metadata || {},
    missing_fields: missing.sort(),
    status: missing.length === 0 ? 'CANDIDATE_VALID' : 'CANDIDATE_MALFORMED',
    reject_code: missing.length === 0 ? null : (evidence_refs.length === 0 ? 'MEMORY_EVIDENCE_REQUIRED' : 'CANDIDATE_MALFORMED'),
    generated_by: 'deterministic:ucdm/business_memory',
  };
  body.candidate_id = 'bmc_' + sha256Hex(canonicalize({ ...body, candidate_id: undefined }));
  return deepFreeze(body);
}

function validateCandidate(c) {
  const errors = [];
  if (!CANDIDATE_STATUS.includes(c.status)) errors.push(`bad candidate status "${c.status}"`);
  if (c.status === 'CANDIDATE_VALID' && c.missing_fields.length > 0) errors.push('a CANDIDATE_VALID has no missing fields');
  if (c.evidence_refs.length === 0 && c.status === 'CANDIDATE_VALID') errors.push('no memory without evidence');
  return { valid: errors.length === 0, errors };
}

module.exports = { REQUIRED, CANDIDATE_STATUS, normalizeClaim, makeCandidate, validateCandidate };
