'use strict';
// [ASTRA-11M §15] Decision policy. Deterministic rules over an assembled candidate. Produces a
// policy verdict + directives; it never executes anything. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const C = require('./contracts');

const VERDICTS = Object.freeze(['ALLOW', 'ALLOW_WITH_CONDITIONS', 'DOWNRANK', 'HOLD', 'BLOCK', 'INVESTIGATE_FIRST']);

function applyDecisionPolicy(cand, ctx) {
  const rules = [];
  const rev = ctx.current_revenue_state || {};
  const fs = ctx.current_funnel_state || {};
  const cap = ctx.operational_capacity || {};
  const acquisitionish = /scal|acqui|traffic|ads|leads|volume|spend/.test(String(cand.target.metric || '') + String(cand.target.funnel_transition || ''));
  const weakEvidence = cand.evidence_strength === 'EVIDENCE_WEAK' || cand.evidence_strength === 'EVIDENCE_NONE';

  let verdict = 'ALLOW';
  const set = (v, rule) => { rules.push(rule); if (C.ordinalIndex(VERDICTS, v) > C.ordinalIndex(VERDICTS, verdict)) verdict = v; };

  if (cand.constraints.length) set('BLOCK', `critical constraint(s): ${cand.constraints.join(',')} -> BLOCK`);
  if (cand.reject_code === 'DECISION_EVIDENCE_INSUFFICIENT' || cand.evidence_strength === 'EVIDENCE_NONE') set('INVESTIGATE_FIRST', 'evidence insufficient -> INVESTIGATE / MEASURE');
  if (cand.memory_status === 'DECISION_MEMORY_CONFLICT') set('BLOCK', 'active memory contradicts the opportunity -> BLOCK (DECISION_MEMORY_CONFLICT)');
  if (cand.memory_status === 'REPEAT_DECISION_REQUIRES_JUSTIFICATION') set('HOLD', 'memory shows repeated failure -> do not repeat without new evidence (VALIDATE first)');
  if (cand.memory_status === 'MEMORY_NOT_GENERALIZABLE') set('ALLOW_WITH_CONDITIONS', 'supporting memory is from another scope -> not generalizable, validate in-scope');

  if ((cand.reversibility === 'HARD_TO_REVERSE') && weakEvidence) set('HOLD', 'high opportunity + hard-to-reverse + weak evidence -> HOLD / VALIDATE FIRST');

  if (acquisitionish && fs.downstream_bottleneck) set('DOWNRANK', `downstream bottleneck (${fs.downstream_bottleneck}) -> no automatic acquisition scaling`);
  if (acquisitionish && (rev.margin_state === 'NEGATIVE' || (rev.margin != null && Number(rev.margin) < 0)) && !cand.economics_fix_justification) set('DOWNRANK', 'margins negative -> growth action cannot outrank an economics fix unless explicitly justified');
  if (acquisitionish && (cap.state === 'SATURATED' || cap.sales_state === 'SATURATED')) set('DOWNRANK', 'capacity saturated -> acquisition expansion cannot be priority');

  if (cand.expected_impact === 'IMPACT_HIGH' && cand.risk === 'RISK_LOW' && (cand.time_to_signal === 'IMMEDIATE' || cand.time_to_signal === 'SHORT')) rules.push('high opportunity + low risk + fast signal -> strong priority candidate');

  const body = {
    schema_version: C.DECISION_SCHEMA_VERSION, kind: 'PolicyEvaluation',
    decision_id: cand.decision_id,
    verdict, rules: rules.sort(),
    generated_by: 'deterministic:ucdm/decision_orchestrator/policy',
  };
  body.policy_id = 'dpo_' + sha256Hex(canonicalize({ ...body, policy_id: undefined })).slice(0, 40);
  return deepFreeze(body);
}

function validatePolicy(p) {
  const errors = [];
  if (!VERDICTS.includes(p.verdict)) errors.push(`bad policy verdict "${p.verdict}"`);
  return { valid: errors.length === 0, errors };
}

module.exports = { VERDICTS, applyDecisionPolicy, validatePolicy };
