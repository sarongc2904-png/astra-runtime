'use strict';
// [ASTRA-11K §8] Statistical discipline. ASTRA-11K NEVER declares statistical significance
// automatically and NEVER invents p-values / CIs / power / sample size / MDE. Externally
// supplied statistics are validated STRUCTURALLY only. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const STAT_STATUS = Object.freeze([
  'DESCRIPTIVE_DIFFERENCE', 'STATISTICAL_TEST_NOT_AVAILABLE', 'STATISTICAL_EVIDENCE_INSUFFICIENT',
  'STATISTICAL_CLAIM_NOT_PERMITTED', 'STATISTICAL_EVALUATION_VALID',
]);

// assessStatistics({ design, outcomes, supplied_statistics })
//   supplied_statistics (optional, externally computed): { test_name, p_value, alpha, confidence_interval,
//     sample_size_control, sample_size_treatment, power, mde, computed_by }
function assessStatistics({ design = null, outcomes = {}, supplied_statistics = null }) {
  const causalPossible = design && design.conclusion_permitted && design.conclusion_permitted.causal_evaluation;
  const hasOutcome = outcomes && outcomes.primary && outcomes.primary.before != null && outcomes.primary.after != null;

  let status, reason = null;
  const structural_check = { supplied: !!supplied_statistics, valid_structure: null, issues: [] };

  if (supplied_statistics) {
    const s = supplied_statistics;
    const issues = [];
    if (!s.computed_by) issues.push('MISSING_COMPUTED_BY (who/what produced these statistics)');
    if (!s.test_name) issues.push('MISSING_TEST_NAME');
    if (s.p_value != null && (Number(s.p_value) < 0 || Number(s.p_value) > 1)) issues.push('P_VALUE_OUT_OF_RANGE');
    if (s.alpha != null && (Number(s.alpha) <= 0 || Number(s.alpha) >= 1)) issues.push('ALPHA_OUT_OF_RANGE');
    if (s.sample_size_control != null && Number(s.sample_size_control) <= 0) issues.push('NON_POSITIVE_CONTROL_N');
    if (s.sample_size_treatment != null && Number(s.sample_size_treatment) <= 0) issues.push('NON_POSITIVE_TREATMENT_N');
    if (Array.isArray(s.confidence_interval) && s.confidence_interval.length === 2 && Number(s.confidence_interval[0]) > Number(s.confidence_interval[1])) issues.push('CI_BOUNDS_INVERTED');
    structural_check.issues = issues;
    structural_check.valid_structure = issues.length === 0;
    if (issues.length === 0 && causalPossible) status = 'STATISTICAL_EVALUATION_VALID';
    else if (issues.length === 0 && !causalPossible) { status = 'STATISTICAL_CLAIM_NOT_PERMITTED'; reason = 'design does not permit a causal/inferential claim'; }
    else { status = 'STATISTICAL_EVIDENCE_INSUFFICIENT'; reason = 'supplied statistics failed structural validation'; }
  } else if (!hasOutcome) {
    status = 'STATISTICAL_TEST_NOT_AVAILABLE'; reason = 'no primary-metric outcome data';
  } else if (!causalPossible) {
    status = 'STATISTICAL_CLAIM_NOT_PERMITTED'; reason = 'design permits descriptive comparison only';
  } else {
    // outcome exists, causal-capable design, but NO externally supplied test -> descriptive only
    status = 'DESCRIPTIVE_DIFFERENCE'; reason = 'a difference is observed; no valid statistical test was supplied — ASTRA-11K does not compute one';
  }

  const body = {
    schema_version: 'ucdm-experiment-1.0.0', kind: 'StatisticalAssessment',
    status, reason,
    structural_check,
    fabricated_p_value: null, fabricated_confidence_interval: null, fabricated_power: null,
    fabricated_sample_size: null, fabricated_mde: null,
    significance_declared_by_astra: false,
    note: 'ASTRA-11K never computes or declares significance; supplied statistics are only structurally validated',
    generated_by: 'deterministic:ucdm/experiment',
  };
  body.statistics_id = 'exst_' + sha256Hex(canonicalize({ ...body, statistics_id: undefined }));
  return deepFreeze(body);
}

function validateStatistics(s) {
  const errors = [];
  if (!STAT_STATUS.includes(s.status)) errors.push(`bad statistical status "${s.status}"`);
  if (s.significance_declared_by_astra !== false) errors.push('ASTRA-11K must never declare significance');
  for (const k of ['fabricated_p_value', 'fabricated_confidence_interval', 'fabricated_power', 'fabricated_sample_size', 'fabricated_mde']) if (s[k] !== null) errors.push(`${k} must be null (never fabricated)`);
  if (s.status === 'STATISTICAL_EVALUATION_VALID' && (!s.structural_check.supplied || !s.structural_check.valid_structure)) errors.push('STATISTICAL_EVALUATION_VALID requires structurally valid supplied statistics');
  return { valid: errors.length === 0, errors };
}

module.exports = { STAT_STATUS, assessStatistics, validateStatistics };
