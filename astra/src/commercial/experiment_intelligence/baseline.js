'use strict';
// [ASTRA-11K §4] Baseline validation. A valid comparison is impossible without a compatible
// baseline when the design requires one. Reuses ASTRA-11J scope/period/cohort primitives —
// no parallel system. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { samePeriod } = require('../funnel_revenue/time_window');
const { cohortComparable } = require('../funnel_revenue/cohort');
const { channelsComparable } = require('../funnel_revenue/channel');

const BASELINE_STATUS = Object.freeze([
  'BASELINE_VALID', 'BASELINE_MISSING', 'BASELINE_SCOPE_MISMATCH', 'BASELINE_PERIOD_MISMATCH',
  'BASELINE_COHORT_MISMATCH', 'BASELINE_METRIC_MISMATCH',
]);

// validateBaseline({ baseline, treatmentScope, metricDefinition, required }) -> frozen
//   baseline: { value?, metric_definition?, scope:{ period, cohort_basis, cohort, channel, segment, offer, geography, currency } }
function validateBaseline({ baseline = null, treatmentScope = {}, metricDefinition = null, required = true }) {
  const mismatches = [];
  let status;
  if (!baseline || (baseline.value == null && baseline.ref == null)) {
    status = required ? 'BASELINE_MISSING' : 'BASELINE_MISSING';
  } else {
    const b = baseline.scope || {};
    if (metricDefinition && baseline.metric_definition && String(baseline.metric_definition) !== String(metricDefinition)) { mismatches.push('metric_definition'); status = 'BASELINE_METRIC_MISMATCH'; }
    if (!status && b.period && treatmentScope.period && !samePeriod(b.period, treatmentScope.period)) { mismatches.push('period'); status = 'BASELINE_PERIOD_MISMATCH'; }
    if (!status) {
      const cc = cohortComparable({ cohort_basis: b.cohort_basis, cohort: b.cohort }, { cohort_basis: treatmentScope.cohort_basis, cohort: treatmentScope.cohort });
      if (!cc.comparable) { mismatches.push('cohort'); status = 'BASELINE_COHORT_MISMATCH'; }
    }
    if (!status) {
      for (const f of ['channel', 'segment', 'offer', 'geography', 'currency']) {
        if (f === 'channel') { const chc = channelsComparable(b.channel, treatmentScope.channel); if (!chc.comparable && chc.reason !== 'UNKNOWN_CHANNEL') mismatches.push('channel'); }
        else if ((b[f] || null) !== (treatmentScope[f] || null) && (b[f] || treatmentScope[f])) mismatches.push(f);
      }
      status = mismatches.length ? 'BASELINE_SCOPE_MISMATCH' : 'BASELINE_VALID';
    }
  }

  const body = {
    schema_version: 'ucdm-experiment-1.0.0', kind: 'BaselineValidation',
    status, required, mismatches: [...new Set(mismatches)].sort(),
    baseline_value: baseline && baseline.value != null ? Number(baseline.value) : null,
    baseline_ref: baseline && baseline.ref ? String(baseline.ref) : null,
    comparison_permitted: status === 'BASELINE_VALID' || !required,
    note: status === 'BASELINE_VALID' ? 'baseline compatible on period, cohort basis, and filter scope'
      : status === 'BASELINE_MISSING' && !required ? 'no baseline supplied — permitted only for a non-comparative design'
        : 'baseline not compatible — a comparative claim is not permitted',
    generated_by: 'deterministic:ucdm/experiment',
  };
  body.baseline_id = 'exbl_' + sha256Hex(canonicalize({ ...body, baseline_id: undefined }));
  return deepFreeze(body);
}

function validateBaselineValidation(b) {
  const errors = [];
  if (!BASELINE_STATUS.includes(b.status)) errors.push(`bad baseline status "${b.status}"`);
  if (b.required && b.status !== 'BASELINE_VALID' && b.comparison_permitted) errors.push('a required baseline that is not VALID must not permit comparison');
  return { valid: errors.length === 0, errors };
}

module.exports = { BASELINE_STATUS, validateBaseline, validateBaselineValidation };
