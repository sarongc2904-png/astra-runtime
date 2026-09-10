'use strict';
// [ASTRA-11L §3] Evidence binding. NO MEMORY WITHOUT EVIDENCE. A non-VALID evidence status
// blocks strong promotions (FACT / LEARNING). No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const EVIDENCE_STATUS = Object.freeze(['EVIDENCE_VALID', 'EVIDENCE_PARTIAL', 'EVIDENCE_MISSING', 'EVIDENCE_INVALID', 'EVIDENCE_SUPERSEDED']);

// bindEvidence({ evidence_refs[], source_engine, source_report_id, source_entity_id,
//                known_valid_refs?: Set|Array, invalidated_refs?, superseded_refs? })
function bindEvidence(x) {
  const refs = [...new Set((x.evidence_refs || []).map(String))].sort();
  const validSet = x.known_valid_refs ? new Set([...x.known_valid_refs].map(String)) : null;
  const invalid = new Set((x.invalidated_refs || []).map(String));
  const superseded = new Set((x.superseded_refs || []).map(String));

  let status;
  if (refs.length === 0) status = 'EVIDENCE_MISSING';
  else if (refs.every(r => invalid.has(r))) status = 'EVIDENCE_INVALID';
  else if (refs.some(r => invalid.has(r))) status = 'EVIDENCE_PARTIAL';
  else if (refs.every(r => superseded.has(r))) status = 'EVIDENCE_SUPERSEDED';
  else if (validSet && refs.some(r => !validSet.has(r))) status = 'EVIDENCE_PARTIAL';
  else status = 'EVIDENCE_VALID';

  const body = {
    schema_version: 'ucdm-business-memory-1.0.0', kind: 'EvidenceBinding',
    evidence_refs: refs,
    source_engine: x.source_engine == null ? null : String(x.source_engine),
    source_report_id: x.source_report_id == null ? null : String(x.source_report_id),
    source_entity_id: x.source_entity_id == null ? null : String(x.source_entity_id),
    evidence_status: status,
    valid_refs: validSet ? refs.filter(r => validSet.has(r) && !invalid.has(r)) : refs.filter(r => !invalid.has(r) && !superseded.has(r)),
    invalid_refs: refs.filter(r => invalid.has(r)),
    superseded_refs: refs.filter(r => superseded.has(r)),
    permits_strong_promotion: status === 'EVIDENCE_VALID',
    note: status === 'EVIDENCE_VALID' ? 'all evidence refs resolve and are current'
      : status === 'EVIDENCE_MISSING' ? 'no evidence supplied — MEMORY_EVIDENCE_REQUIRED'
        : 'evidence is not fully valid — strong promotions (FACT/LEARNING) are blocked',
    generated_by: 'deterministic:ucdm/business_memory',
  };
  body.evidence_binding_id = 'bme_' + sha256Hex(canonicalize({ ...body, evidence_binding_id: undefined }));
  return deepFreeze(body);
}

function validateEvidenceBinding(e) {
  const errors = [];
  if (!EVIDENCE_STATUS.includes(e.evidence_status)) errors.push(`bad evidence_status "${e.evidence_status}"`);
  if (e.evidence_status === 'EVIDENCE_VALID' && e.evidence_refs.length === 0) errors.push('EVIDENCE_VALID requires at least one evidence ref');
  if (e.permits_strong_promotion && e.evidence_status !== 'EVIDENCE_VALID') errors.push('only EVIDENCE_VALID may permit a strong promotion');
  return { valid: errors.length === 0, errors };
}

module.exports = { EVIDENCE_STATUS, bindEvidence, validateEvidenceBinding };
