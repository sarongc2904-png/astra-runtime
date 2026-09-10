'use strict';
// [ASTRA-11M §14] Decision conflict detection between candidates. Archetypes: mutually
// exclusive, memory-vs-evidence, short-vs-long-term, revenue-vs-margin, growth-vs-capacity,
// acquisition-vs-retention, experimentation-vs-cash-urgency. Deterministic. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const C = require('./contracts');

function classOf(cand) {
  const s = String(cand.target.metric || '') + ' ' + String(cand.target.funnel_transition || '');
  if (/acqui|traffic|leads|ads|spend|new customer/i.test(s)) return 'ACQUISITION';
  if (/retention|churn|repeat|renew|ltv|loyalty/i.test(s)) return 'RETENTION';
  if (/margin|cost|economics|cac|payback/i.test(s)) return 'MARGIN';
  if (/revenue|sales|bookings|gmv/i.test(s)) return 'REVENUE';
  return 'OTHER';
}

function detectPair(a, b, ctx) {
  const kinds = [];
  const ca = classOf(a), cb = classOf(b);

  // mutually exclusive: explicit or same target + opposite action intent
  if ((a.mutually_exclusive_with || []).includes(b.decision_id) || (b.mutually_exclusive_with || []).includes(a.decision_id)) kinds.push('MUTUALLY_EXCLUSIVE');
  const sameTarget = canonicalize(a.target) === canonicalize(b.target);
  if (sameTarget && a.action_type !== b.action_type &&
      ((a.action_type === 'STOP' && b.action_type === 'TEST') || (b.action_type === 'STOP' && a.action_type === 'TEST') ||
       (a.action_type === 'DO_NOT_SCALE' && /TEST|ITERATE/.test(b.action_type)) || (b.action_type === 'DO_NOT_SCALE' && /TEST|ITERATE/.test(a.action_type)))) kinds.push('MUTUALLY_EXCLUSIVE');

  if ((ca === 'ACQUISITION' && cb === 'RETENTION') || (cb === 'ACQUISITION' && ca === 'RETENTION')) kinds.push('ACQUISITION_VS_RETENTION');
  if ((ca === 'REVENUE' && cb === 'MARGIN') || (cb === 'REVENUE' && ca === 'MARGIN')) kinds.push('REVENUE_VS_MARGIN');

  // growth vs capacity
  const cap = ctx.operational_capacity || {};
  if ((ca === 'ACQUISITION' || cb === 'ACQUISITION') && (cap.state === 'SATURATED' || cap.sales_state === 'SATURATED')) kinds.push('GROWTH_VS_CAPACITY');

  // short vs long term
  const shortA = a.time_to_signal === 'IMMEDIATE' || a.time_to_signal === 'SHORT';
  const shortB = b.time_to_signal === 'IMMEDIATE' || b.time_to_signal === 'SHORT';
  if (shortA !== shortB && (a.urgency === 'URGENCY_CRITICAL' || b.urgency === 'URGENCY_CRITICAL')) kinds.push('SHORT_VS_LONG_TERM');

  // experimentation vs cash urgency
  const rev = ctx.current_revenue_state || {};
  const critCash = (ctx.cash_urgency === 'CRITICAL') || (rev.runway_months != null && Number(rev.runway_months) <= 2) ||
    ((ctx.cash_urgency && typeof ctx.cash_urgency === 'object' && ctx.cash_urgency.runway_months != null) && Number(ctx.cash_urgency.runway_months) <= 2);
  if (critCash && (a.action_type === 'TEST' || b.action_type === 'TEST') && (a.time_to_signal === 'LONG' || b.time_to_signal === 'LONG' || a.time_to_signal === 'MEDIUM' || b.time_to_signal === 'MEDIUM')) kinds.push('EXPERIMENTATION_VS_CASH_URGENCY');

  // memory vs evidence
  if (a.memory_status === 'DECISION_MEMORY_CONFLICT' || b.memory_status === 'DECISION_MEMORY_CONFLICT') kinds.push('MEMORY_VS_EVIDENCE');

  if (kinds.length === 0) return null;

  const uniq = [...new Set(kinds)].sort();
  // resolution status
  let status;
  if (uniq.includes('MEMORY_VS_EVIDENCE')) status = 'BLOCKING_CONFLICT';
  else if (uniq.includes('MUTUALLY_EXCLUSIVE')) {
    // resolvable if the two candidates have a clear priority-vector difference — decided by caller via ranking;
    // here we mark UNRESOLVED unless one is clearly blocked/deferred
    const oneOut = ['CANDIDATE_BLOCKED', 'CANDIDATE_DEFERRED', 'CANDIDATE_REJECTED'].includes(a.status) !== ['CANDIDATE_BLOCKED', 'CANDIDATE_DEFERRED', 'CANDIDATE_REJECTED'].includes(b.status);
    status = oneOut ? 'RESOLVABLE_CONFLICT' : 'UNRESOLVED_CONFLICT';
  } else status = 'RESOLVABLE_CONFLICT';

  const body = {
    schema_version: C.DECISION_SCHEMA_VERSION, kind: 'DecisionConflict',
    decision_a: [a.decision_id, b.decision_id].sort()[0],
    decision_b: [a.decision_id, b.decision_id].sort()[1],
    kinds: uniq, status,
    generated_by: 'deterministic:ucdm/decision_orchestrator/conflicts',
  };
  body.conflict_id = 'dcf_' + sha256Hex(canonicalize({ ...body, conflict_id: undefined })).slice(0, 40);
  return deepFreeze(body);
}

function detectDecisionConflicts(candidates, ctx) {
  const out = [];
  for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
    const c = detectPair(candidates[i], candidates[j], ctx || {});
    if (c) out.push(c);
  }
  return out.sort((a, b) => a.conflict_id.localeCompare(b.conflict_id));
}

function validateConflict(c) {
  const errors = [];
  if (!C.DECISION_CONFLICT_STATUS.includes(c.status)) errors.push(`bad conflict status "${c.status}"`);
  if (!c.kinds.every(k => C.CONFLICT_KINDS.includes(k))) errors.push('unknown conflict kind');
  return { valid: errors.length === 0, errors };
}

module.exports = { classOf, detectDecisionConflicts, validateConflict };
