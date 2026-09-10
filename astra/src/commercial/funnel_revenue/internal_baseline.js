'use strict';
// [ASTRA-11J §X] Internal baselines. Comparisons against previous period / cohort / channel /
// segment / offer / creative / location / salesperson / experiment variant — ONLY after
// validating comparability. No external "industry benchmark" is ever used unless the business
// supplies it as evidence. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { compareScope } = require('./scope_validation');
const { computeDelta } = require('./delta');

const BASELINE_KINDS = Object.freeze([
  'PREVIOUS_PERIOD', 'PREVIOUS_COHORT', 'CHANNEL', 'SEGMENT', 'OFFER', 'CREATIVE', 'LOCATION',
  'SALESPERSON', 'EXPERIMENT_VARIANT', 'USER_PROVIDED_EXTERNAL',
]);

// compareToBaseline({ current, baseline, kind, is_rate }) -> frozen BaselineComparison
function compareToBaseline({ current, baseline, kind = 'PREVIOUS_PERIOD', is_rate = false, currentObs = null, baselineObs = null }) {
  const k = BASELINE_KINDS.includes(String(kind).toUpperCase()) ? String(kind).toUpperCase() : 'PREVIOUS_PERIOD';
  let comparability = { comparable: true, reason: 'ASSUMED_COMPARABLE' };
  if (currentObs && baselineObs) {
    // for a PREVIOUS_PERIOD baseline we deliberately do NOT require samePeriod
    const scope = compareScope(currentObs, baselineObs, { requireSamePeriod: k !== 'PREVIOUS_PERIOD' && k !== 'PREVIOUS_COHORT' });
    comparability = { comparable: scope.same_scope, reason: scope.same_scope ? 'SCOPE_MATCHED' : 'SCOPE_MISMATCH', mismatches: scope.mismatches };
  }
  const delta = computeDelta(baseline, current, { is_rate, comparability });
  const body = {
    schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'BaselineComparison',
    baseline_kind: k,
    current_value: current, baseline_value: baseline,
    comparability,
    delta: { absolute: delta.absolute_delta, relative: delta.relative_delta, percentage_point: delta.percentage_point_delta },
    change_declared: comparability.comparable && delta.absolute_delta != null,
    uses_external_industry_benchmark: k === 'USER_PROVIDED_EXTERNAL',
    note: k === 'USER_PROVIDED_EXTERNAL'
      ? 'external benchmark used ONLY because the business supplied it as evidence'
      : comparability.comparable ? 'comparable internal baseline' : 'baseline not comparable — no change declared',
    generated_by: 'deterministic:ucdm/funnel_revenue',
  };
  body.comparison_id = 'bc_' + sha256Hex(canonicalize({ ...body, comparison_id: undefined }));
  return deepFreeze(body);
}

function validateBaselineComparison(c) {
  const errors = [];
  if (!BASELINE_KINDS.includes(c.baseline_kind)) errors.push(`bad baseline_kind "${c.baseline_kind}"`);
  if (c.change_declared && !c.comparability.comparable) errors.push('a change cannot be declared against a non-comparable baseline');
  if (c.uses_external_industry_benchmark && c.baseline_kind !== 'USER_PROVIDED_EXTERNAL') errors.push('an external benchmark must be USER_PROVIDED_EXTERNAL');
  return { valid: errors.length === 0, errors };
}

module.exports = { BASELINE_KINDS, compareToBaseline, validateBaselineComparison };
