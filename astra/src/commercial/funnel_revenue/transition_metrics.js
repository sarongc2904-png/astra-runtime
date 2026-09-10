'use strict';
// [ASTRA-11J §C §D] Deterministic transition metrics. conversion_rate = downstream / upstream
// ONLY where numerator/denominator are scope-compatible and the denominator is > 0. Otherwise
// UNKNOWN with a precise reason. Drop-off is NOT described as causality. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { compareScope, denominatorState } = require('./scope_validation');

const METRIC_STATUS = Object.freeze(['VALID', 'UNKNOWN', 'INVALID_DENOMINATOR', 'SCOPE_MISMATCH', 'MISSING_COUNT']);

// computeTransition(upstream, downstream, { requireSameCohort, requireSamePeriod }) -> frozen
function computeTransition(upstream, downstream, opts = {}) {
  const base = {
    schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'FunnelTransitionMetric',
    from_stage: upstream ? upstream.stage_key : null,
    to_stage: downstream ? downstream.stage_key : null,
    upstream_count: upstream ? upstream.count : null,
    downstream_count: downstream ? downstream.count : null,
    upstream_ref: upstream ? upstream.observation_id : null,
    downstream_ref: downstream ? downstream.observation_id : null,
    evidence_refs: [...new Set([...(upstream ? upstream.evidence_refs : []), ...(downstream ? downstream.evidence_refs : [])])].sort(),
    generated_by: 'deterministic:ucdm/funnel_revenue',
  };

  if (!upstream || !downstream || upstream.count == null || downstream.count == null) {
    return freeze({ ...base, status: 'MISSING_COUNT', conversion_rate: null, drop_off_count: null, drop_off_rate: null, reason: !upstream || !downstream ? 'MISSING_OBSERVATION' : 'MISSING_COUNT', denominator_note: 'a conversion rate needs both an upstream and a downstream count' });
  }

  const scope = compareScope(upstream, downstream, opts);
  if (!scope.same_scope) {
    return freeze({ ...base, status: 'SCOPE_MISMATCH', conversion_rate: null, drop_off_count: null, drop_off_rate: null, reason: 'SCOPE_MISMATCH', scope_mismatches: scope.mismatches, denominator_note: 'upstream and downstream are not on the same scope — no valid ratio' });
  }

  const den = denominatorState(upstream.count);
  if (den !== 'VALID') {
    return freeze({ ...base, status: 'INVALID_DENOMINATOR', conversion_rate: null, drop_off_count: null, drop_off_rate: null, reason: den, denominator_note: den === 'ZERO' ? 'upstream count is 0 — conversion rate is undefined' : 'upstream count missing/invalid' });
  }

  const conv = Number((downstream.count / upstream.count).toFixed(6));
  const dropCount = upstream.count - downstream.count;
  const overflow = downstream.count > upstream.count;
  return freeze({
    ...base,
    status: 'VALID',
    conversion_rate: conv,
    drop_off_count: overflow ? 0 : dropCount,
    drop_off_rate: overflow ? 0 : Number((1 - conv).toFixed(6)),
    overflow_flag: overflow,
    scope: 'MATCHED',
    causal_claim: false,
    denominator_note: `downstream ${downstream.count} / upstream ${upstream.count} on matched scope`,
    note: overflow ? 'downstream exceeds upstream — likely a scope or double-count issue; drop-off clamped to 0' : 'drop-off is a count difference, NOT a causal statement',
  });
}

function freeze(x) { x.metric_id = 'ftm_' + sha256Hex(canonicalize({ ...x, metric_id: undefined })); return deepFreeze(x); }

function validateTransitionMetric(m) {
  const errors = [];
  if (!METRIC_STATUS.includes(m.status)) errors.push(`bad metric status "${m.status}"`);
  if (m.status === 'VALID' && (m.conversion_rate == null || m.conversion_rate < 0)) errors.push('a VALID transition metric needs a non-negative conversion rate');
  if (m.status !== 'VALID' && m.conversion_rate != null) errors.push('a non-VALID transition metric must not carry a conversion rate');
  if (m.causal_claim === true) errors.push('a transition metric never makes a causal claim');
  return { valid: errors.length === 0, errors };
}

module.exports = { METRIC_STATUS, computeTransition, validateTransitionMetric };
