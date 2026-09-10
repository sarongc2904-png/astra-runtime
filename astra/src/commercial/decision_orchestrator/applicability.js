'use strict';
// [ASTRA-11M §3] Applicability filter. Removes / downgrades opportunities that do not apply to
// the current DecisionContext: no budget, no capacity, retired offer, invalidating memory,
// incompatible experiment, unmet dependency, scope mismatch, stale evidence, invalidated
// source. Deterministic. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const C = require('./contracts');
const { scopesCompatible } = require('./opportunities');

function assessApplicability(opp, ctx) {
  const blockers = [];      // hard: NOT_APPLICABLE / BLOCKED
  const conditions = [];    // soft: CONDITIONALLY_APPLICABLE

  const scope = ctx.scope || {};
  const res = ctx.available_resources || {};
  const cap = ctx.operational_capacity || {};
  const invalidated = new Set((ctx.invalidated_memories || []).map(m => (m && m.memory_id) || m));
  const stale = new Set((ctx.stale_memories || []).map(m => (m && m.memory_id) || m));

  // scope mismatch
  if (!scopesCompatible(opp.scope, scope)) blockers.push('SCOPE_MISMATCH');

  // stale / invalidated source evidence
  const staleRefs = opp.evidence_refs.filter(r => stale.has(r));
  const invRefs = opp.evidence_refs.filter(r => invalidated.has(r));
  if (invRefs.length) blockers.push('INVALIDATED_SOURCE');
  else if (staleRefs.length) conditions.push('STALE_EVIDENCE');
  if (opp.evidence_strength === 'EVIDENCE_NONE') blockers.push('NO_EVIDENCE');

  // budget / resource availability (only when explicit requirement + explicit ledger)
  const req = opp.resource_requirements;
  if (req && typeof req === 'object') {
    if (req.budget != null && res.budget != null && Number(res.budget) < Number(req.budget)) blockers.push('BUDGET_UNAVAILABLE');
    else if (req.budget != null && res.budget == null) conditions.push('BUDGET_UNKNOWN');
    if (req.team != null && cap.team_available != null && Number(cap.team_available) < Number(req.team)) blockers.push('CAPACITY_SATURATED');
    else if (req.team != null && cap.team_available == null) conditions.push('CAPACITY_UNKNOWN');
  }
  if (cap.state === 'SATURATED' && (req && req.team != null)) blockers.push('CAPACITY_SATURATED');

  // retired offer
  const retired = new Set((ctx.current_constraints || []).filter(c => c && c.type === 'OFFER_RETIRED').map(c => c.offer));
  if (opp.scope.offer && retired.has(opp.scope.offer)) blockers.push('OFFER_RETIRED');

  // dependencies unmet
  const satisfiedDeps = new Set((ctx.current_constraints || []).filter(c => c && c.type === 'DEPENDENCY_READY').map(c => c.dependency));
  const declaredMissing = new Set((ctx.current_constraints || []).filter(c => c && c.type === 'DEPENDENCY_MISSING').map(c => c.dependency));
  for (const d of opp.dependencies) {
    if (declaredMissing.has(d)) blockers.push(`DEPENDENCY_UNMET:${d}`);
    else if (!satisfiedDeps.has(d)) conditions.push(`DEPENDENCY_UNVERIFIED:${d}`);
  }

  // memory invalidates the action
  const memConflict = (ctx.applicable_memories || []).find(m => m && m.blocks_action &&
    (m.blocks_action === opp.affected_metric || m.blocks_action === opp.affected_funnel_transition ||
     m.blocks_action === 'ANY'));
  if (memConflict) blockers.push('MEMORY_INVALIDATES_ACTION');

  // incompatible experiment
  if (opp.experiment_ref) {
    const exp = (ctx.candidate_experiments || []).find(e => (e && (e.experiment_id || e.id)) === opp.experiment_ref);
    if (exp && exp.status && !['READY', 'DESIGNED', 'VALID', 'REGISTERED'].includes(String(exp.status).toUpperCase())) {
      conditions.push('EXPERIMENT_NOT_READY');
    }
  }

  let status;
  if (blockers.length && (blockers.includes('MEMORY_INVALIDATES_ACTION') || blockers.includes('INVALIDATED_SOURCE') || blockers.includes('OFFER_RETIRED'))) status = 'BLOCKED';
  else if (blockers.length) status = 'NOT_APPLICABLE';
  else if (conditions.length) status = 'CONDITIONALLY_APPLICABLE';
  else status = 'APPLICABLE';

  const body = {
    schema_version: C.DECISION_SCHEMA_VERSION, kind: 'ApplicabilityAssessment',
    opportunity_id: opp.opportunity_id,
    status,
    blockers: blockers.sort(),
    conditions: conditions.sort(),
    generated_by: 'deterministic:ucdm/decision_orchestrator/applicability',
  };
  body.assessment_id = 'dapp_' + sha256Hex(canonicalize({ ...body, assessment_id: undefined })).slice(0, 40);
  return deepFreeze(body);
}

function validateApplicability(a) {
  const errors = [];
  if (!C.APPLICABILITY_STATUS.includes(a.status)) errors.push(`bad applicability status "${a.status}"`);
  if (a.status === 'APPLICABLE' && (a.blockers.length || a.conditions.length)) errors.push('APPLICABLE with blockers/conditions');
  if ((a.status === 'NOT_APPLICABLE' || a.status === 'BLOCKED') && a.blockers.length === 0) errors.push('blocked/not-applicable without a blocker');
  return { valid: errors.length === 0, errors };
}

module.exports = { assessApplicability, validateApplicability };
