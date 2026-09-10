'use strict';
// [ASTRA-11J §Y §Z] Change / delta. absolute vs relative vs percentage-point delta are
// distinguished and never confused. ASTRA-11J NEVER declares statistical significance —
// observed deltas are not causal effects. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

// computeDelta(before, after, { is_rate }) -> frozen
function computeDelta(before, after, { is_rate = false, comparability = null } = {}) {
  const b = num(before), a = num(after);
  const body = {
    schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'MetricDelta',
    before: b, after: a, is_rate,
    absolute_delta: null, relative_delta: null, percentage_point_delta: null,
    comparability: comparability || { comparable: b != null && a != null, reason: b == null || a == null ? 'MISSING_VALUE' : 'ASSUMED_COMPARABLE' },
    statistical_significance: 'NOT_ASSESSED',
    causal: false,
    note: 'absolute, relative and (for rates) percentage-point deltas are distinct; e.g. 10% -> 15% is +5 pp = +50% relative. No causal or significance claim.',
    generated_by: 'deterministic:ucdm/funnel_revenue',
  };
  if (b != null && a != null && (!comparability || comparability.comparable !== false)) {
    body.absolute_delta = Number((a - b).toFixed(6));
    body.relative_delta = b !== 0 ? Number(((a - b) / b).toFixed(6)) : null;
    if (is_rate) body.percentage_point_delta = Number(((a - b) * 100).toFixed(6));
  } else if (comparability && comparability.comparable === false) {
    body.note = `not comparable (${comparability.reason}) — no delta computed`;
  }
  body.delta_id = 'dl_' + sha256Hex(canonicalize({ ...body, delta_id: undefined }));
  return deepFreeze(body);
}
function num(v) { return v == null || Number.isNaN(Number(v)) ? null : Number(v); }

function validateDelta(d) {
  const errors = [];
  if (d.statistical_significance !== 'NOT_ASSESSED') errors.push('ASTRA-11J must not assess statistical significance');
  if (d.causal !== false) errors.push('a delta is never causal');
  if (d.is_rate && d.absolute_delta != null && d.percentage_point_delta == null) errors.push('a rate delta must expose percentage_point_delta');
  return { valid: errors.length === 0, errors };
}

module.exports = { computeDelta, validateDelta };
