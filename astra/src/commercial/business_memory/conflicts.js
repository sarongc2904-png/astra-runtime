'use strict';
// [ASTRA-11L §9] Conflict detection. Two memories conflict ONLY when their scope AND metric
// are comparable and their claims are opposed. A scope difference is NOT a global conflict.
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { compareScope } = require('./scope');

const CONFLICT_TYPE = Object.freeze(['DIRECT_CONFLICT', 'SCOPE_CONDITIONAL_DIFFERENCE', 'TEMPORAL_CHANGE', 'NO_CONFLICT', 'UNRESOLVED_CONFLICT']);

// two claims are "opposed" when they assert an opposite ordering / direction about the same
// comparison target. The caller supplies a structured comparison where possible.
function opposed(a, b) {
  const ca = a.comparison || parseComparison(a.normalized_claim);
  const cb = b.comparison || parseComparison(b.normalized_claim);
  if (!ca || !cb) return null; // cannot determine
  if (ca.target !== cb.target) return false;
  if (ca.direction && cb.direction) return ca.direction !== cb.direction;
  if (ca.winner && cb.winner) return ca.winner !== cb.winner && ca.loser === cb.winner;
  return null;
}
function parseComparison(claim) {
  const m = /(.+?)\s*(>|<|beats|better than|mejor que)\s*(.+)/i.exec(String(claim || ''));
  if (m) {
    const gt = /(>|beats|better than|mejor que)/i.test(m[2]);
    return { target: normTarget(m[1]) + '__vs__' + normTarget(m[3]), winner: gt ? normTarget(m[1]) : normTarget(m[3]), loser: gt ? normTarget(m[3]) : normTarget(m[1]) };
  }
  const d = /(increase[sd]?|decrease[sd]?|improve[sd]?|worsen[sd]?|sube|baja|mejora|empeora)/i.exec(String(claim || ''));
  if (d) return { target: 'direction', direction: /(increase|improve|sube|mejora)/i.test(d[1]) ? 'UP' : 'DOWN' };
  return null;
}
function normTarget(s) { return String(s).trim().toLowerCase().replace(/\s+/g, '_'); }

// detectConflict(memA, memB) -> frozen ConflictAssessment
function detectConflict(a, b, { referenceTime = null } = {}) {
  const scope = compareScope(a.scope, b.scope);
  const metricComparable = (a.metric || a.semantic_target || null) && (a.metric || a.semantic_target) === (b.metric || b.semantic_target);
  const opp = opposed(a, b);

  let type;
  if (opp === true && scope.status === 'SCOPE_MATCH' && metricComparable) {
    // check whether they merely reflect a change over time
    const ta = a.observed_at ? Date.parse(a.observed_at) : NaN;
    const tb = b.observed_at ? Date.parse(b.observed_at) : NaN;
    const bothDated = Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb;
    type = bothDated && Math.abs(ta - tb) > 90 * 86400000 ? 'TEMPORAL_CHANGE' : 'DIRECT_CONFLICT';
  } else if (opp === true && (scope.status === 'SCOPE_PARTIAL' || scope.status === 'SCOPE_UNKNOWN')) {
    type = 'UNRESOLVED_CONFLICT';
  } else if (opp === true && scope.status === 'SCOPE_MISMATCH') {
    type = 'SCOPE_CONDITIONAL_DIFFERENCE';
  } else if (opp === null && (a.metric || a.semantic_target) && metricComparable && scope.status === 'SCOPE_MATCH' && a.normalized_claim !== b.normalized_claim) {
    type = 'UNRESOLVED_CONFLICT';
  } else {
    type = 'NO_CONFLICT';
  }

  const body = {
    schema_version: 'ucdm-business-memory-1.0.0', kind: 'ConflictAssessment',
    memory_a: a.memory_id || null, memory_b: b.memory_id || null,
    conflict_type: type,
    scope_comparison: scope,
    metric_comparable: !!metricComparable,
    claims_opposed: opp,
    global_conflict_declared: type === 'DIRECT_CONFLICT',
    note: type === 'SCOPE_CONDITIONAL_DIFFERENCE' ? 'opposite claims but different scope — a conditional difference, NOT a global conflict'
      : type === 'DIRECT_CONFLICT' ? 'opposite claims on the same comparable scope + metric'
        : type === 'TEMPORAL_CHANGE' ? 'opposite claims on the same scope but far apart in time — likely a change over time'
          : type === 'UNRESOLVED_CONFLICT' ? 'incompatible claims but scope/metric comparability is incomplete — unresolved'
            : 'no conflict',
    generated_by: 'deterministic:ucdm/business_memory',
  };
  body.conflict_id = 'bmcf_' + sha256Hex(canonicalize({ ...body, conflict_id: undefined }));
  return deepFreeze(body);
}

// detectAllConflicts(memories) -> [ConflictAssessment] (non-NO_CONFLICT only)
function detectAllConflicts(memories, opts) {
  const out = [];
  for (let i = 0; i < memories.length; i++) for (let j = i + 1; j < memories.length; j++) {
    if (memories[i].memory_type !== memories[j].memory_type) continue;
    if (memories[i].business_id !== memories[j].business_id) continue;
    const c = detectConflict(memories[i], memories[j], opts);
    if (c.conflict_type !== 'NO_CONFLICT') out.push(c);
  }
  return out;
}

function validateConflict(c) {
  const errors = [];
  if (!CONFLICT_TYPE.includes(c.conflict_type)) errors.push(`bad conflict_type "${c.conflict_type}"`);
  if (c.conflict_type === 'SCOPE_CONDITIONAL_DIFFERENCE' && c.global_conflict_declared) errors.push('a scope difference must not be declared a global conflict');
  if (c.conflict_type === 'DIRECT_CONFLICT' && c.scope_comparison.status !== 'SCOPE_MATCH') errors.push('a DIRECT_CONFLICT requires SCOPE_MATCH');
  return { valid: errors.length === 0, errors };
}

module.exports = { CONFLICT_TYPE, detectConflict, detectAllConflicts, validateConflict, parseComparison };
