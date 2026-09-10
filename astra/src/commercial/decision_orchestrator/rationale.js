'use strict';
// [ASTRA-11M §17] Decision rationale. Structured, evidence-anchored. Answers: why now, why
// this, why not the alternatives, what evidence supports it, what constraints apply, what
// memories matter, what could invalidate the decision. No persuasive unbacked prose.
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const C = require('./contracts');

function buildRationale({ selection, candidatesById, priority, policyById, reconcileById, conflicts, ctx }) {
  const prim = selection.primary_decision;
  const c = prim ? candidatesById[prim.decision_id] : null;

  const why_now = [];
  if (c) {
    if (c.urgency !== 'URGENCY_UNKNOWN' && c.urgency !== 'URGENCY_LOW') why_now.push(`urgency ${c.urgency}`);
    if (c.time_to_signal === 'IMMEDIATE' || c.time_to_signal === 'SHORT') why_now.push(`fast time-to-signal (${c.time_to_signal})`);
    if (why_now.length === 0) why_now.push('no elevated urgency — sequenced by evidence and impact, not time pressure');
  } else {
    why_now.push(`no primary decision selected: ${selection.status}`);
  }

  const why_this = c ? [
    `analytical action ${c.action_type} on ${c.target.metric || c.target.funnel_transition}`,
    `evidence strength ${c.evidence_strength}`,
    `expected impact ${c.expected_impact}`,
    `risk ${c.risk}`, `reversibility ${c.reversibility}`,
    `priority rank ${priority.rank[c.decision_id]}`,
    policyById[c.decision_id] ? `policy verdict ${policyById[c.decision_id].verdict}` : null,
  ].filter(Boolean) : [];

  const why_not_alternatives = [
    ...selection.secondary_decisions.map(s => `${s.decision_id} (${s.action_type}): lower priority rank ${s.priority_rank}`),
    ...selection.deferred_decisions.map(s => `${s.decision_id} (${s.action_type}): deferred — ${s.reason}`),
    ...selection.blocked_decisions.map(s => `${s.decision_id} (${s.action_type}): blocked — ${s.reason}`),
    ...selection.rejected_decisions.map(s => `${s.decision_id} (${s.action_type}): rejected — ${s.reason}`),
  ].sort();

  const supporting_evidence = c ? c.evidence_refs.slice().sort() : [];
  const applicable_constraints = c ? c.constraints.slice().sort() : [];
  const relevant_memories = c && reconcileById[c.decision_id] ? {
    aligned: reconcileById[c.decision_id].aligned_memories,
    conflicting: reconcileById[c.decision_id].conflicting_memories,
    failed_approaches: reconcileById[c.decision_id].failed_approach_memories,
    not_generalizable: reconcileById[c.decision_id].not_generalizable_memories,
  } : { aligned: [], conflicting: [], failed_approaches: [], not_generalizable: [] };

  const invalidators = [];
  if (c) {
    invalidators.push('a new ASTRA-11L invalidation of any supporting evidence ref');
    invalidators.push('a memory conflict emerging in the same scope');
    if (c.evidence_strength !== 'EVIDENCE_STRONG') invalidators.push('stronger contrary evidence at the same scope');
    if (c.time_to_signal === 'UNKNOWN') invalidators.push('an ASTRA-11K time-to-signal estimate longer than the decision horizon');
    if (c.constraints.length) invalidators.push('any listed constraint tightening further');
    if ((ctx.current_revenue_state || {}).trend === 'DECLINING_SHARP') invalidators.push('cash position deteriorating faster than expected');
  }

  const body = {
    schema_version: C.DECISION_SCHEMA_VERSION, kind: 'DecisionRationale',
    primary_decision_id: prim ? prim.decision_id : null,
    selection_status: selection.status,
    why_now: why_now.sort(),
    why_this: why_this,
    why_not_alternatives,
    supporting_evidence,
    applicable_constraints,
    relevant_memories,
    invalidators: invalidators.sort(),
    persuasive_unbacked_claims: false,
    generated_by: 'deterministic:ucdm/decision_orchestrator/rationale',
  };
  body.rationale_id = 'dra_' + sha256Hex(canonicalize({ ...body, rationale_id: undefined })).slice(0, 44);
  return deepFreeze(body);
}

function validateRationale(r) {
  const errors = [];
  if (r.persuasive_unbacked_claims !== false) errors.push('rationale must not contain unbacked persuasive claims');
  if (r.primary_decision_id && r.supporting_evidence.length === 0) errors.push('a primary decision must cite supporting evidence');
  return { valid: errors.length === 0, errors };
}

module.exports = { buildRationale, validateRationale };
