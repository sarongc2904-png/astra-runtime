'use strict';
// [ASTRA-11K §13-prep] Outcome evaluation. Reads a SUPPLIED experiment outcome against the
// primary metric + guardrails. A descriptive difference is never presented as causal. An
// incomplete outcome -> INCOMPLETE. No fabricated results. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const EVAL_STATUS = Object.freeze(['EVALUATION_VALID', 'OUTCOME_INCOMPLETE', 'EVALUATION_NOT_PERMITTED', 'EVIDENCE_INSUFFICIENT']);
const PRIMARY_MOVEMENT = Object.freeze(['IMPROVED', 'WORSENED', 'NO_MATERIAL_CHANGE', 'UNKNOWN']);

// evaluateOutcome({ metricContract, design, baseline, guardrailEval, statistics, causal,
//                   outcomes: { primary: { before, after, direction_hint }, ... },
//                   sample: { control_n, treatment_n, events_observed }, min_events })
function evaluateOutcome(x) {
  const mc = x.metricContract || {};
  const o = (x.outcomes && x.outcomes.primary) || null;
  const design = x.design || null;

  const stub = { difference_type: 'DESCRIPTIVE_DIFFERENCE', descriptive_only: true, causal_interpretation_permitted: false, guardrail_breach: !!(x.guardrailEval && x.guardrailEval.status === 'PRIMARY_METRIC_IMPROVED_GUARDRAIL_BREACH'), guardrail_breaches: x.guardrailEval ? x.guardrailEval.breaches : [], statistical_status: x.statistics ? x.statistics.status : 'STATISTICAL_TEST_NOT_AVAILABLE', sample: x.sample || null, fabricated_result: false };
  if (!mc.primary_metric || mc.status !== 'METRIC_CONTRACT_VALID') {
    return freeze({ status: 'EVALUATION_NOT_PERMITTED', reason: 'no valid metric contract', primary_metric: mc.primary_metric || null, primary_before: null, primary_after: null, primary_relative_change: null, primary_percentage_point_change: null, primary_movement: 'UNKNOWN', ...stub });
  }
  if (!o || o.before == null || o.after == null) {
    return freeze({ status: 'OUTCOME_INCOMPLETE', reason: 'primary metric before/after not supplied', primary_metric: mc.primary_metric, primary_before: null, primary_after: null, primary_relative_change: null, primary_percentage_point_change: null, primary_movement: 'UNKNOWN', ...stub });
  }

  const before = Number(o.before), after = Number(o.after);
  const rel = before !== 0 ? (after - before) / Math.abs(before) : (after === 0 ? 0 : after > 0 ? 1 : -1);
  const threshold = x.material_change_threshold != null ? Number(x.material_change_threshold) : 0.02;
  let movement;
  if (Math.abs(rel) <= threshold) movement = 'NO_MATERIAL_CHANGE';
  else {
    const improvingUp = (x.expected_direction || 'INCREASE') === 'INCREASE';
    movement = (rel > 0) === improvingUp ? 'IMPROVED' : 'WORSENED';
  }

  // evidence sufficiency (structural only — no statistical test computed here)
  const minEvents = x.min_events != null ? Number(x.min_events) : null;
  const events = x.sample && x.sample.events_observed != null ? Number(x.sample.events_observed) : null;
  const insufficient = (minEvents != null && events != null && events < minEvents) ||
    (x.sample && ((x.sample.control_n != null && x.sample.control_n < 1) || (x.sample.treatment_n != null && x.sample.treatment_n < 1)));

  let status;
  if (insufficient) status = 'EVIDENCE_INSUFFICIENT';
  else status = 'EVALUATION_VALID';

  const causalPermitted = status === 'EVALUATION_VALID' && x.causal && x.causal.policy === 'CAUSAL_CLAIM_PERMITTED';
  const guardrailBreach = x.guardrailEval && x.guardrailEval.status === 'PRIMARY_METRIC_IMPROVED_GUARDRAIL_BREACH';

  return freeze({
    status,
    reason: status === 'EVIDENCE_INSUFFICIENT' ? 'observed events / sample below the supplied minimum' : null,
    primary_metric: mc.primary_metric,
    primary_before: before, primary_after: after,
    primary_relative_change: Number(rel.toFixed(6)),
    primary_percentage_point_change: /rate|ratio/.test(mc.primary_metric) ? Number(((after - before) * 100).toFixed(6)) : null,
    primary_movement: movement,
    difference_type: 'DESCRIPTIVE_DIFFERENCE',
    descriptive_only: !causalPermitted,
    causal_interpretation_permitted: !!causalPermitted,
    guardrail_breach: !!guardrailBreach,
    guardrail_breaches: x.guardrailEval ? x.guardrailEval.breaches : [],
    statistical_status: x.statistics ? x.statistics.status : 'STATISTICAL_TEST_NOT_AVAILABLE',
    sample: x.sample || null,
    fabricated_result: false,
    note: causalPermitted ? 'primary metric change is observed; causal interpretation is permitted by policy but is not asserted here without an explicit claim in the decision step' : 'primary metric change is a DESCRIPTIVE difference only — not a causal effect',
  });
}

function freeze(x) {
  const b = { schema_version: 'ucdm-experiment-1.0.0', kind: 'ExperimentEvaluation', ...x, generated_by: 'deterministic:ucdm/experiment' };
  b.evaluation_id = 'exev_' + sha256Hex(canonicalize({ ...b, evaluation_id: undefined }));
  return deepFreeze(b);
}

function validateEvaluation(e) {
  const errors = [];
  if (!EVAL_STATUS.includes(e.status)) errors.push(`bad evaluation status "${e.status}"`);
  if (!PRIMARY_MOVEMENT.includes(e.primary_movement)) errors.push(`bad primary_movement "${e.primary_movement}"`);
  if (e.fabricated_result !== false) errors.push('no fabricated result');
  if (e.difference_type && e.difference_type !== 'DESCRIPTIVE_DIFFERENCE') errors.push('a difference is always described as DESCRIPTIVE');
  if (e.causal_interpretation_permitted && e.status === 'EVIDENCE_INSUFFICIENT') errors.push('causal interpretation cannot be permitted with insufficient evidence');
  return { valid: errors.length === 0, errors };
}

module.exports = { EVAL_STATUS, PRIMARY_MOVEMENT, evaluateOutcome, validateEvaluation };
