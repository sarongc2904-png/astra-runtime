'use strict';
// [ASTRA-11L §12] Memory invalidation. Never a physical delete from the logical model.
// Preserves invalidation_reason / invalidated_at / invalidated_by. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const INVALIDATION_REASONS = Object.freeze([
  'SOURCE_EVIDENCE_INVALIDATED', 'INPUT_CORRECTED', 'SCOPE_DISCOVERED_INCORRECT',
  'EXPERIMENT_INVALIDATED', 'REPORT_REVOKED', 'MANUAL_ADJUDICATION',
]);

// applyInvalidations(memories, invalidations[]) -> { memories (with invalidation records), applied[] }
//   invalidation: { memory_id?, memory_ids?, evidence_ref?, reason, invalidated_at, invalidated_by, note }
function applyInvalidations(memories, invalidations = []) {
  const byId = Object.fromEntries(memories.map(m => [m.memory_id, m]));
  const applied = [];
  const invalidatedIds = new Set();

  for (const inv of invalidations) {
    const reason = INVALIDATION_REASONS.includes(String(inv.reason).toUpperCase()) ? String(inv.reason).toUpperCase() : 'MANUAL_ADJUDICATION';
    const targets = new Set();
    for (const id of [inv.memory_id, ...(inv.memory_ids || [])].filter(Boolean)) if (byId[id]) targets.add(id);
    if (inv.evidence_ref) for (const m of memories) if (m.evidence_refs.includes(String(inv.evidence_ref))) targets.add(m.memory_id);
    for (const id of targets) {
      invalidatedIds.add(id);
      applied.push(deepFreeze({
        schema_version: 'ucdm-business-memory-1.0.0', kind: 'MemoryInvalidation',
        memory_id: id, invalidation_reason: reason,
        invalidated_at: inv.invalidated_at || null,
        invalidated_by: inv.invalidated_by || 'unspecified',
        via_evidence_ref: inv.evidence_ref || null,
        note: inv.note || null,
        physically_deleted: false,
        invalidation_id: 'bmiv_' + sha256Hex(canonicalize({ memory_id: id, reason, at: inv.invalidated_at || null, by: inv.invalidated_by || null, ev: inv.evidence_ref || null })),
      }));
    }
  }
  return { invalidated_ids: [...invalidatedIds].sort(), records: applied.sort((a, b) => (a.invalidation_id < b.invalidation_id ? -1 : 1)) };
}

function validateInvalidation(r) {
  const errors = [];
  if (!INVALIDATION_REASONS.includes(r.invalidation_reason)) errors.push(`bad invalidation_reason "${r.invalidation_reason}"`);
  if (r.physically_deleted !== false) errors.push('an invalidated memory is never physically deleted');
  return { valid: errors.length === 0, errors };
}

module.exports = { INVALIDATION_REASONS, applyInvalidations, validateInvalidation };
