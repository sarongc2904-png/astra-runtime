'use strict';
// [ASTRA-11H §B §C] Controlled, versioned journey-stage taxonomy. Journeys are NEVER forced
// linear and NEVER required to contain every stage. Loops / regressions / skips / re-entry /
// simultaneous journeys are all valid. Pure data. No LLM, no I/O.
const STAGE_TAXONOMY_VERSION = 'cm-journey-stage-v1';

const JOURNEY_STAGES = Object.freeze([
  'PROBLEM_EMERGENCE', 'PROBLEM_RECOGNITION', 'INFORMATION_SEEKING', 'SOLUTION_EXPLORATION',
  'ALTERNATIVE_COMPARISON', 'VENDOR_EVALUATION', 'PURCHASE_INTENT', 'PURCHASE_DECISION',
  'PURCHASE', 'ONBOARDING', 'ACTIVATION', 'ADOPTION', 'VALUE_REALIZATION', 'RETENTION',
  'EXPANSION', 'ADVOCACY', 'CHURN_RISK', 'CHURN', 'WIN_BACK', 'UNKNOWN',
]);

// Phase grouping (analytical convenience only — never used to fabricate a missing stage).
const PRE_PURCHASE = Object.freeze(['PROBLEM_EMERGENCE', 'PROBLEM_RECOGNITION', 'INFORMATION_SEEKING', 'SOLUTION_EXPLORATION', 'ALTERNATIVE_COMPARISON', 'VENDOR_EVALUATION', 'PURCHASE_INTENT', 'PURCHASE_DECISION']);
const PURCHASE = Object.freeze(['PURCHASE']);
const POST_PURCHASE = Object.freeze(['ONBOARDING', 'ACTIVATION', 'ADOPTION', 'VALUE_REALIZATION', 'RETENTION', 'EXPANSION', 'ADVOCACY', 'CHURN_RISK', 'CHURN', 'WIN_BACK']);

function isStage(s) { return JOURNEY_STAGES.includes(String(s)); }
function phaseOf(stage) {
  if (PRE_PURCHASE.includes(stage)) return 'PRE_PURCHASE';
  if (PURCHASE.includes(stage)) return 'PURCHASE';
  if (POST_PURCHASE.includes(stage)) return 'POST_PURCHASE';
  return 'UNKNOWN';
}

// A conventional ordering used ONLY to describe an observed transition as "forward" or
// "regression"/"loop" — it never implies the journey must follow this order.
const CONVENTIONAL_ORDER = Object.freeze(Object.fromEntries(JOURNEY_STAGES.map((s, i) => [s, i])));
function relation(from, to) {
  if (from === to) return 'REPEAT';
  const a = CONVENTIONAL_ORDER[from], b = CONVENTIONAL_ORDER[to];
  if (a == null || b == null || from === 'UNKNOWN' || to === 'UNKNOWN') return 'UNKNOWN';
  return b > a ? 'FORWARD' : 'REGRESSION';
}

module.exports = {
  STAGE_TAXONOMY_VERSION, JOURNEY_STAGES, PRE_PURCHASE, PURCHASE, POST_PURCHASE,
  isStage, phaseOf, CONVENTIONAL_ORDER, relation,
};
