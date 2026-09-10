'use strict';
// [ASTRA-11L] MemoryRecord — an accepted memory. Assembles the candidate + evidence binding
// + provenance + temporal + staleness + identity into an immutable, content-addressed record.
// A record is never a free-text opinion. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { memoryId, semanticKey } = require('./identity');
const { ASSERTIVE_TYPES } = require('./types');

const RECORD_STATUS = Object.freeze(['ACCEPTED', 'REJECTED']);

// buildMemoryRecord({ candidate, evidenceBinding, provenance, temporal, staleness,
//                     identityClass, supersession, promotion, conflicts, referenceTime })
function buildMemoryRecord(x) {
  const c = x.candidate;
  const eb = x.evidenceBinding;
  const rejectReasons = [];

  if (c.status !== 'CANDIDATE_VALID') rejectReasons.push(c.reject_code || 'CANDIDATE_MALFORMED');
  if (eb.evidence_status === 'EVIDENCE_MISSING') rejectReasons.push('MEMORY_EVIDENCE_REQUIRED');
  if (eb.evidence_status === 'EVIDENCE_INVALID') rejectReasons.push('EVIDENCE_INVALID');
  if (ASSERTIVE_TYPES.includes(c.memory_type) && eb.evidence_status !== 'EVIDENCE_VALID' && c.memory_type !== 'FUNNEL_STATE') rejectReasons.push('ASSERTIVE_TYPE_REQUIRES_VALID_EVIDENCE');
  if (c.memory_type === 'LEARNING' && (!x.promotion || x.promotion.status !== 'LEARNING_PROMOTED')) rejectReasons.push('LEARNING_PROMOTION_NOT_PERMITTED');
  if (x.provenance && x.provenanceRequireComplete && !x.provenance.complete) rejectReasons.push('PROVENANCE_INCOMPLETE');

  const mid = memoryId({
    business_id: c.business_id, memory_type: c.memory_type, normalized_claim: c.normalized_claim,
    scope: c.scope, source_engine: c.source_engine, source_entity_id: c.source_entity_id, evidence_refs: c.evidence_refs,
  });
  const semKey = semanticKey({ business_id: c.business_id, memory_type: c.memory_type, semantic_target: c.semantic_target, normalized_claim: c.normalized_claim, scope: c.scope });

  const accepted = rejectReasons.length === 0;
  const body = {
    schema_version: 'ucdm-business-memory-1.0.0', kind: 'MemoryRecord',
    memory_id: mid,
    semantic_key: semKey,
    business_id: c.business_id,
    memory_type: c.memory_type,
    claim: c.claim,
    normalized_claim: c.normalized_claim,
    semantic_target: c.semantic_target,
    metric: (c.metadata && c.metadata.metric) || c.semantic_target || null,
    comparison: (c.metadata && c.metadata.comparison) || null,
    scope: c.scope || {},
    evidence_refs: c.evidence_refs,
    evidence_status: eb.evidence_status,
    evidence_binding_id: eb.evidence_binding_id,
    provenance_id: x.provenance ? x.provenance.provenance_id : null,
    provenance_complete: x.provenance ? x.provenance.complete : false,
    source_engine: c.source_engine,
    source_report_id: c.source_report_id,
    source_entity_id: c.source_entity_id,
    observed_at: c.observed_at,
    created_at: c.created_at,
    valid_from: c.valid_from,
    valid_until: c.valid_until,
    temporal_status: x.temporal ? x.temporal.status : 'ACTIVE',
    staleness_class: x.staleness ? x.staleness.staleness_class : 'UNKNOWN',
    identity_status: x.identityClass ? x.identityClass.status : 'NEW_MEMORY',
    identity_related_ids: (x.identityClass && (x.identityClass.related_ids || (x.identityClass.matched_id ? [x.identityClass.matched_id] : []))) || [],
    supersession_status: x.supersession ? x.supersession.status : 'NOT_SUPERSEDED',
    supersedes: x.supersession ? x.supersession.supersedes : [],
    superseded_by_memory_id: null,
    conflict_state: x.conflicts && x.conflicts.length ? x.conflicts[0].conflict_type : 'NO_CONFLICT',
    conflict_refs: (x.conflicts || []).map(c2 => c2.conflict_id).sort(),
    causal_status: c.causal_status,
    statistical_status: c.statistical_status,
    limitations: [...new Set((c.metadata && c.metadata.limitations) || [])].map(String).sort(),
    record_status: accepted ? 'ACCEPTED' : 'REJECTED',
    reject_reasons: [...new Set(rejectReasons)].sort(),
    is_opinion: false,
    generated_by: 'deterministic:ucdm/business_memory',
  };
  body.record_id = 'bmr_' + sha256Hex(canonicalize({ ...body, record_id: undefined }));
  return deepFreeze(body);
}

function validateMemoryRecord(m) {
  const errors = [];
  if (!RECORD_STATUS.includes(m.record_status)) errors.push(`bad record status "${m.record_status}"`);
  if (m.is_opinion !== false) errors.push('a memory record is never a free-text opinion');
  if (m.record_status === 'ACCEPTED' && m.evidence_refs.length === 0) errors.push('an ACCEPTED memory needs evidence');
  if (m.record_status === 'ACCEPTED' && ASSERTIVE_TYPES.includes(m.memory_type) && m.memory_type !== 'FUNNEL_STATE' && m.evidence_status !== 'EVIDENCE_VALID') errors.push('an accepted assertive memory needs EVIDENCE_VALID');
  if (m.memory_type === 'LEARNING' && m.record_status === 'ACCEPTED' && m.reject_reasons.includes('LEARNING_PROMOTION_NOT_PERMITTED')) errors.push('a LEARNING cannot be accepted without a permitted promotion');
  return { valid: errors.length === 0, errors };
}

module.exports = { RECORD_STATUS, buildMemoryRecord, validateMemoryRecord };
