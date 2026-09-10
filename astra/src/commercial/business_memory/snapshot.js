'use strict';
// [ASTRA-11L §15] BusinessMemorySnapshot — the currently-valid knowledge of the business at
// a moment. NOT absolute truth. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

function buildSnapshot({ businessId, memories = [], conflicts = [], supersessions = [], invalidatedIds = [], referenceTime = null }) {
  const accepted = memories.filter(m => m.record_status === 'ACCEPTED' && m.business_id === String(businessId));
  const active = accepted.filter(m => m.temporal_status === 'ACTIVE');
  const stale = accepted.filter(m => m.temporal_status === 'STALE');
  const superseded = accepted.filter(m => m.temporal_status === 'SUPERSEDED' || m.supersession_status === 'SUPERSEDED');
  const invalidated = accepted.filter(m => m.temporal_status === 'INVALIDATED' || invalidatedIds.includes(m.memory_id));

  const byType = (t, list = active) => list.filter(m => m.memory_type === t).map(m => ({ memory_id: m.memory_id, claim: m.claim, scope: m.scope, staleness: m.staleness_class }));

  const body = {
    schema_version: 'ucdm-business-memory-1.0.0', kind: 'BusinessMemorySnapshot',
    business_id: String(businessId),
    as_of: referenceTime,
    current_facts: byType('FACT'),
    current_diagnoses: byType('DIAGNOSIS'),
    current_constraints: byType('CONSTRAINT'),
    active_offers: byType('OFFER'),
    active_segments: byType('SEGMENT'),
    active_channels: byType('CHANNEL'),
    active_funnel_states: byType('FUNNEL_STATE'),
    current_unit_economics: byType('UNIT_ECONOMICS'),
    active_learnings: byType('LEARNING'),
    unresolved_hypotheses: byType('HYPOTHESIS'),
    active_experiments: byType('EXPERIMENT'),
    recent_decisions: byType('DECISION'),
    active_priorities: byType('PRIORITY'),
    stale_memories: stale.map(m => ({ memory_id: m.memory_id, memory_type: m.memory_type, staleness: m.staleness_class })),
    conflicts: conflicts.filter(c => c.conflict_type !== 'NO_CONFLICT').map(c => ({ conflict_id: c.conflict_id, type: c.conflict_type, memory_a: c.memory_a, memory_b: c.memory_b })),
    superseded_history: superseded.map(m => ({ memory_id: m.memory_id, superseded_by: m.superseded_by_memory_id, supersedes: m.supersedes })),
    invalidated_history: invalidated.map(m => ({ memory_id: m.memory_id })),
    counts: { active: active.length, stale: stale.length, superseded: superseded.length, invalidated: invalidated.length, conflicts: conflicts.filter(c => c.conflict_type !== 'NO_CONFLICT').length },
    is_absolute_truth: false,
    note: 'a snapshot of currently-valid, evidence-backed memory — NOT absolute truth; stale, superseded and conflicting memory are shown explicitly',
    generated_by: 'deterministic:ucdm/business_memory',
  };
  body.snapshot_id = 'bmsn_' + sha256Hex(canonicalize({ ...body, snapshot_id: undefined }));
  return deepFreeze(body);
}

function validateSnapshot(s) {
  const errors = [];
  if (s.is_absolute_truth !== false) errors.push('a snapshot is never absolute truth');
  return { valid: errors.length === 0, errors };
}

module.exports = { buildSnapshot, validateSnapshot };
