'use strict';
// [ASTRA-11K §13] Decision engine. Never forces a winner/loser. INCONCLUSIVE /
// INSUFFICIENT_EVIDENCE are valid results. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const DECISIONS = Object.freeze(['ADOPT', 'REJECT', 'ITERATE', 'RETEST', 'HOLD', 'INSUFFICIENT_EVIDENCE', 'INCONCLUSIVE']);

// decide({ evaluation, guardrailEval, causal, baseline, statistics, variableMap })
function decide(x) {
  const ev = x.evaluation || {};
  const reasons = [];
  let decision;

  if (!ev.status || ev.status === 'EVALUATION_NOT_PERMITTED') { decision = 'INSUFFICIENT_EVIDENCE'; reasons.push('NO_VALID_EVALUATION'); }
  else if (ev.status === 'OUTCOME_INCOMPLETE') { decision = 'INSUFFICIENT_EVIDENCE'; reasons.push('OUTCOME_INCOMPLETE'); }
  else if (ev.status === 'EVIDENCE_INSUFFICIENT') { decision = 'INSUFFICIENT_EVIDENCE'; reasons.push('SAMPLE_OR_EVENTS_BELOW_MINIMUM'); }
  else {
    const contaminated = x.variableMap && x.variableMap.contamination_status === 'MULTI_VARIABLE_CONTAMINATION';
    const guardrailBreach = ev.guardrail_breach === true;
    const baselineBad = x.baseline && x.baseline.required && x.baseline.status !== 'BASELINE_VALID';

    if (ev.primary_movement === 'NO_MATERIAL_CHANGE') { decision = 'INCONCLUSIVE'; reasons.push('NO_MATERIAL_PRIMARY_CHANGE'); }
    else if (ev.primary_movement === 'WORSENED') { decision = 'REJECT'; reasons.push('PRIMARY_METRIC_WORSENED'); }
    else if (ev.primary_movement === 'IMPROVED') {
      if (guardrailBreach) { decision = 'HOLD'; reasons.push('PRIMARY_IMPROVED_BUT_GUARDRAIL_BREACH'); }
      else if (contaminated) { decision = 'ITERATE'; reasons.push('PRIMARY_IMPROVED_BUT_CAUSAL_ATTRIBUTION_NOT_IDENTIFIABLE'); }
      else if (baselineBad) { decision = 'RETEST'; reasons.push('PRIMARY_IMPROVED_BUT_BASELINE_INVALID'); }
      else if (ev.descriptive_only && !ev.causal_interpretation_permitted) { decision = 'ITERATE'; reasons.push('DESCRIPTIVE_IMPROVEMENT_ONLY_DESIGN_NOT_CAUSAL'); }
      else { decision = 'ADOPT'; reasons.push('PRIMARY_IMPROVED_NO_GUARDRAIL_BREACH_CAUSAL_BASIS_PERMITTED'); }
    } else { decision = 'INCONCLUSIVE'; reasons.push('PRIMARY_MOVEMENT_UNKNOWN'); }
  }

  const body = {
    schema_version: 'ucdm-experiment-1.0.0', kind: 'ExperimentDecision',
    decision,
    reason_codes: [...new Set(reasons)].sort(),
    winner_forced: false,
    causal_claim_made: decision === 'ADOPT' && x.causal && x.causal.policy === 'CAUSAL_CLAIM_PERMITTED',
    causal_claim_basis: (decision === 'ADOPT' && x.causal && x.causal.policy === 'CAUSAL_CLAIM_PERMITTED') ? 'controlled design, isolated variable, valid baseline, permitted inferential basis' : null,
    reversible_recommendation: null,
    triggers_action: false, autonomous: false,
    note: decision === 'ADOPT' ? 'structured decision: adoption is supported by the evidence — this does NOT execute any change'
      : decision === 'INCONCLUSIVE' ? 'a valid outcome — the experiment did not produce a material or interpretable result'
        : decision === 'INSUFFICIENT_EVIDENCE' ? 'not enough valid evidence to decide' : 'structured decision — analytical only',
    generated_by: 'deterministic:ucdm/experiment',
  };
  body.decision_id = 'exdc_' + sha256Hex(canonicalize({ ...body, decision_id: undefined }));
  return deepFreeze(body);
}

function validateDecision(d) {
  const errors = [];
  if (!DECISIONS.includes(d.decision)) errors.push(`bad decision "${d.decision}"`);
  if (d.winner_forced !== false) errors.push('a decision never forces a winner');
  if (d.triggers_action !== false || d.autonomous !== false) errors.push('a decision is analytical and non-autonomous');
  if (d.causal_claim_made === true && !d.causal_claim_basis) errors.push('a causal claim needs an explicit basis');
  return { valid: errors.length === 0, errors };
}

module.exports = { DECISIONS, decide, validateDecision };
