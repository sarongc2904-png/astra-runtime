'use strict';
// [ASTRA-11M §16] Decision selection + alternatives. Picks a primary analytical decision (or
// declines to), and partitions the rest into secondary / deferred / blocked / rejected with an
// explicit reason each. NO forced priority. Deterministic. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const C = require('./contracts');

function selectDecision({ candidates, priority, policyById, conflicts }) {
  const byId = Object.fromEntries(candidates.map(c => [c.decision_id, c]));
  const ordered = priority.ordering.map(id => byId[id]).filter(Boolean);

  const blocking = (conflicts || []).filter(c => c.status === 'BLOCKING_CONFLICT');
  const unresolved = (conflicts || []).filter(c => c.status === 'UNRESOLVED_CONFLICT');

  const reasonFor = (c) => {
    const pol = policyById[c.decision_id];
    if (c.status === 'CANDIDATE_MALFORMED') return 'malformed opportunity';
    if (c.status === 'CANDIDATE_REJECTED') return c.reject_code || 'rejected';
    if (c.status === 'CANDIDATE_BLOCKED') return c.reject_code || (pol && pol.verdict === 'BLOCK' ? (pol.rules[0] || 'policy BLOCK') : 'blocked');
    if (c.status === 'CANDIDATE_DEFERRED') return c.memory_status === 'REPEAT_DECISION_REQUIRES_JUSTIFICATION' ? 'REPEAT_DECISION_REQUIRES_JUSTIFICATION' : (c.applicability_status === 'CONDITIONALLY_APPLICABLE' ? 'conditionally applicable — preconditions unmet' : 'deferred');
    if (priority.rank[c.decision_id] === 'PRIORITY_UNRESOLVED') return 'PRIORITY_UNRESOLVED — cannot be ordered vs a peer with sufficient evidence';
    return null;
  };

  const rejected = ordered.filter(c => c.status === 'CANDIDATE_MALFORMED' || c.status === 'CANDIDATE_REJECTED')
    .map(c => ({ decision_id: c.decision_id, action_type: c.action_type, reason: reasonFor(c) }));
  const blocked = ordered.filter(c => c.status === 'CANDIDATE_BLOCKED' || (policyById[c.decision_id] && policyById[c.decision_id].verdict === 'BLOCK'))
    .map(c => ({ decision_id: c.decision_id, action_type: c.action_type, reason: reasonFor(c) || 'policy BLOCK' }));
  const blockedIds = new Set(blocked.map(b => b.decision_id));
  const deferred = ordered.filter(c => !blockedIds.has(c.decision_id) && (c.status === 'CANDIDATE_DEFERRED' || priority.rank[c.decision_id] === 'PRIORITY_UNRESOLVED'))
    .map(c => ({ decision_id: c.decision_id, action_type: c.action_type, reason: reasonFor(c) || 'deferred' }));
  const deferredIds = new Set(deferred.map(d => d.decision_id));

  const eligible = ordered.filter(c => c.status === 'CANDIDATE_READY' && !blockedIds.has(c.decision_id) && !deferredIds.has(c.decision_id)
    && priority.rank[c.decision_id] !== 'PRIORITY_UNRESOLVED');

  let status, primary = null, secondary = [];
  if (eligible.length === 0) {
    if (ordered.every(c => c.status === 'CANDIDATE_REJECTED' || c.status === 'CANDIDATE_MALFORMED')) status = 'DECISION_EVIDENCE_INSUFFICIENT';
    else if (blocked.length && blocked.length === ordered.length) status = 'ALL_OPTIONS_BLOCKED';
    else if (deferred.some(d => d.reason && d.reason.startsWith('PRIORITY_UNRESOLVED'))) status = 'PRIORITY_UNRESOLVED';
    else status = 'NO_VALID_PRIMARY_DECISION';
  } else {
    // blocking conflict involving the top candidate => cannot select it
    const top = eligible[0];
    const topInBlocking = blocking.some(bc => bc.decision_a === top.decision_id || bc.decision_b === top.decision_id);
    const topInUnresolved = unresolved.some(uc => uc.decision_a === top.decision_id || uc.decision_b === top.decision_id);
    if (topInBlocking) { status = 'NO_VALID_PRIMARY_DECISION'; deferred.push({ decision_id: top.decision_id, action_type: top.action_type, reason: 'blocked by a BLOCKING_CONFLICT' }); }
    else if (topInUnresolved && eligible.length >= 2) { status = 'PRIORITY_UNRESOLVED'; }
    else {
      status = 'PRIMARY_SELECTED';
      primary = { decision_id: top.decision_id, action_type: top.action_type, priority_rank: priority.rank[top.decision_id] };
      secondary = eligible.slice(1).map(c => ({ decision_id: c.decision_id, action_type: c.action_type, priority_rank: priority.rank[c.decision_id] }));
    }
  }

  const body = {
    schema_version: C.DECISION_SCHEMA_VERSION, kind: 'DecisionSelection',
    status,
    primary_decision: primary,
    secondary_decisions: secondary,
    deferred_decisions: deferred.sort((a, b) => a.decision_id.localeCompare(b.decision_id)),
    blocked_decisions: blocked.sort((a, b) => a.decision_id.localeCompare(b.decision_id)),
    rejected_decisions: rejected.sort((a, b) => a.decision_id.localeCompare(b.decision_id)),
    forced_priority: false, triggers_action: false,
    generated_by: 'deterministic:ucdm/decision_orchestrator/selection',
  };
  body.selection_id = 'dsel_' + sha256Hex(canonicalize({ ...body, selection_id: undefined })).slice(0, 44);
  return deepFreeze(body);
}

function validateSelection(s) {
  const errors = [];
  if (!C.SELECTION_STATUS.includes(s.status)) errors.push(`bad selection status "${s.status}"`);
  if (s.status === 'PRIMARY_SELECTED' && !s.primary_decision) errors.push('PRIMARY_SELECTED without a primary_decision');
  if (s.status !== 'PRIMARY_SELECTED' && s.primary_decision) errors.push('primary_decision set without PRIMARY_SELECTED');
  if (s.forced_priority !== false) errors.push('forced_priority must be false');
  if (s.triggers_action !== false) errors.push('triggers_action must be false');
  return { valid: errors.length === 0, errors };
}

module.exports = { selectDecision, validateSelection };
