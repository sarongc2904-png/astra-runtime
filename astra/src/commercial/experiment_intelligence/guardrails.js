'use strict';
// [ASTRA-11K §6] Guardrail evaluation. Detects when a primary-metric improvement destroys
// another part of the system -> PRIMARY_METRIC_IMPROVED_GUARDRAIL_BREACH. NO automatic
// winner declaration. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const GUARDRAIL_STATUS = Object.freeze([
  'GUARDRAILS_OK', 'PRIMARY_METRIC_IMPROVED_GUARDRAIL_BREACH', 'GUARDRAIL_DATA_MISSING', 'NO_GUARDRAILS_DEFINED',
]);

// "worse" direction per guardrail metric family
const HIGHER_IS_WORSE = /(cac|cpl|cpa|cost|refund|cancellation|churn|no_show|complaint|return)/i;
const LOWER_IS_WORSE = /(margin|contribution|retention|show_rate|activation|ltv|arpu|arpa|aov|roas|mer)/i;

// evaluateGuardrails({ guardrailMetrics[], primaryImproved, outcomes: { <metric>: { before, after } }, threshold })
function evaluateGuardrails({ guardrailMetrics = [], primaryImproved = null, outcomes = {}, relative_threshold = 0.02 }) {
  if (guardrailMetrics.length === 0) {
    return freeze({ status: 'NO_GUARDRAILS_DEFINED', breaches: [], checked: [], note: 'no guardrail metrics were defined for this experiment' });
  }
  const breaches = []; const checked = []; const missing = [];
  for (const g of guardrailMetrics) {
    const o = outcomes[g];
    if (!o || o.before == null || o.after == null) { missing.push(g); continue; }
    const before = Number(o.before), after = Number(o.after);
    const rel = before !== 0 ? (after - before) / Math.abs(before) : (after === 0 ? 0 : after > 0 ? 1 : -1);
    let worsened = false;
    if (HIGHER_IS_WORSE.test(g)) worsened = rel > relative_threshold;
    else if (LOWER_IS_WORSE.test(g)) worsened = rel < -relative_threshold;
    else worsened = Math.abs(rel) > relative_threshold * 3; // unknown-direction guardrail: any large move is flagged
    checked.push({ metric: g, before, after, relative_change: Number(rel.toFixed(6)), worsened, direction_known: HIGHER_IS_WORSE.test(g) || LOWER_IS_WORSE.test(g) });
    if (worsened) breaches.push(g);
  }
  let status;
  if (missing.length && checked.length === 0) status = 'GUARDRAIL_DATA_MISSING';
  else if (breaches.length && primaryImproved === true) status = 'PRIMARY_METRIC_IMPROVED_GUARDRAIL_BREACH';
  else if (breaches.length) status = 'PRIMARY_METRIC_IMPROVED_GUARDRAIL_BREACH'; // any breach blocks an automatic win
  else status = 'GUARDRAILS_OK';

  return freeze({
    status, breaches: breaches.sort(), checked, missing_data: missing.sort(),
    automatic_winner_declared: false,
    note: status === 'PRIMARY_METRIC_IMPROVED_GUARDRAIL_BREACH' ? 'a guardrail deteriorated — no winner may be declared automatically' : status === 'GUARDRAILS_OK' ? 'no guardrail breach detected' : 'guardrail outcome data missing',
  });
}

function freeze(x) {
  const b = { schema_version: 'ucdm-experiment-1.0.0', kind: 'GuardrailEvaluation', ...x, generated_by: 'deterministic:ucdm/experiment' };
  b.guardrail_eval_id = 'exgr_' + sha256Hex(canonicalize({ ...b, guardrail_eval_id: undefined }));
  return deepFreeze(b);
}

function validateGuardrailEvaluation(g) {
  const errors = [];
  if (!GUARDRAIL_STATUS.includes(g.status)) errors.push(`bad guardrail status "${g.status}"`);
  if (g.automatic_winner_declared !== false) errors.push('a guardrail evaluation never declares an automatic winner');
  if (g.status === 'GUARDRAILS_OK' && g.breaches.length > 0) errors.push('GUARDRAILS_OK cannot carry breaches');
  return { valid: errors.length === 0, errors };
}

module.exports = { GUARDRAIL_STATUS, evaluateGuardrails, validateGuardrailEvaluation };
