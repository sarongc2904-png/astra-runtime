'use strict';
// [ASTRA-11M §4] Memory reconciliation. Consults ASTRA-11L memory for each opportunity:
// active learnings, previous decisions, failed approaches, superseded tactics, unresolved
// conflicts, stale knowledge, active constraints. A previously invalidated strategy is never
// silently repeated. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze, nfcLF } = require('../validation/canonical');
const C = require('./contracts');
const { scopesCompatible } = require('./opportunities');

function norm(s) { return nfcLF(String(s == null ? '' : s)).replace(/\s+/g, ' ').trim().toLowerCase(); }

// does memory m talk about the same target as opportunity opp?
function targets(m, opp) {
  const t = norm(m.semantic_target || m.claim || '');
  const a = norm(opp.affected_metric || '');
  const b = norm(opp.affected_funnel_transition || '');
  return (a && t.includes(a)) || (b && t.includes(b)) ||
    (m.affected_metric && norm(m.affected_metric) === a) ||
    (m.affected_funnel_transition && norm(m.affected_funnel_transition) === b);
}

function reconcile(opp, memories, opts) {
  memories = memories || [];
  opts = opts || {};
  const related = memories.filter(m => m && targets(m, opp));
  const notes = [];
  let status = related.length === 0 ? 'NO_APPLICABLE_MEMORY' : 'MEMORY_ALIGNED';

  const aligned = [], conflicting = [], failed = [], superseded = [], notGeneralizable = [], stale = [];

  for (const m of related) {
    const mScope = m.scope || {};
    const compatible = scopesCompatible(mScope, opp.scope);
    const temporal = m.temporal_status || 'ACTIVE';

    if (temporal === 'INVALIDATED') { continue; } // invalidated memory does not constrain, but see repeat check below
    if (temporal === 'SUPERSEDED') { superseded.push(m.memory_id); continue; }
    if (temporal === 'STALE' || m.staleness_class === 'STALE') stale.push(m.memory_id);

    // memory says a tactic failed / was rejected in a comparable scope
    const isFailure = (m.memory_type === 'LEARNING' && m.is_positive_learning === false) ||
      (m.memory_type === 'DECISION' && /reject|do_not|abandon|stop/i.test(String(m.claim || m.decision || ''))) ||
      m.outcome === 'FAILED';
    if (isFailure) {
      if (compatible) { failed.push(m.memory_id); }
      else { notGeneralizable.push(m.memory_id); }
      continue;
    }

    // memory positively supports or directly contradicts the opportunity's direction
    const contradicts = m.contradicts_direction === true ||
      (m.claim && opp.affected_metric && /\bno\b|not|sin efecto|no mueve|did not move/i.test(String(m.claim)) && compatible);
    if (contradicts && compatible) { conflicting.push(m.memory_id); }
    else if (m.memory_type === 'LEARNING' && m.is_positive_learning === true) {
      if (compatible) aligned.push(m.memory_id);
      else notGeneralizable.push(m.memory_id);
    } else {
      aligned.push(m.memory_id);
    }
  }

  // repeat-of-invalidated check: opportunity explicitly re-proposes something memory invalidated
  const invalidatedTactics = related.filter(m => (m.temporal_status === 'INVALIDATED') && targets(m, opp) && scopesCompatible(m.scope || {}, opp.scope));
  const repeatJustified = opts.repeatJustifications && opts.repeatJustifications[opp.opportunity_id] === true;

  if (conflicting.length) { status = 'DECISION_MEMORY_CONFLICT'; notes.push(`opportunity contradicts active memory: ${conflicting.join(',')}`); }
  else if (failed.length && !repeatJustified) { status = 'REPEAT_DECISION_REQUIRES_JUSTIFICATION'; notes.push(`memory records this approach failed in a comparable scope: ${failed.join(',')}`); }
  else if (invalidatedTactics.length && !repeatJustified) { status = 'REPEAT_DECISION_REQUIRES_JUSTIFICATION'; notes.push(`memory invalidated this tactic: ${invalidatedTactics.map(m => m.memory_id).join(',')}`); }
  else if (notGeneralizable.length && aligned.length === 0) { status = 'MEMORY_NOT_GENERALIZABLE'; notes.push(`supporting memory is from an incompatible scope: ${notGeneralizable.join(',')}`); }
  else if (aligned.length) { status = 'MEMORY_ALIGNED'; }

  const body = {
    schema_version: C.DECISION_SCHEMA_VERSION, kind: 'MemoryReconciliation',
    opportunity_id: opp.opportunity_id,
    status,
    aligned_memories: aligned.sort(),
    conflicting_memories: conflicting.sort(),
    failed_approach_memories: failed.sort(),
    superseded_tactic_memories: superseded.sort(),
    not_generalizable_memories: notGeneralizable.sort(),
    stale_memories: stale.sort(),
    invalidated_tactic_memories: invalidatedTactics.map(m => m.memory_id).sort(),
    repeat_justified: repeatJustified === true,
    notes: notes.sort(),
    generated_by: 'deterministic:ucdm/decision_orchestrator/memory_reconcile',
  };
  body.reconciliation_id = 'dmr_' + sha256Hex(canonicalize({ ...body, reconciliation_id: undefined })).slice(0, 40);
  return deepFreeze(body);
}

function validateReconciliation(r) {
  const errors = [];
  if (!C.MEMORY_RECONCILE_STATUS.includes(r.status)) errors.push(`bad reconciliation status "${r.status}"`);
  if (r.status === 'DECISION_MEMORY_CONFLICT' && r.conflicting_memories.length === 0) errors.push('conflict status without conflicting memories');
  return { valid: errors.length === 0, errors };
}

module.exports = { reconcile, validateReconciliation };
