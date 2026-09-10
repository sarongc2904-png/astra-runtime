'use strict';
// [ASTRA-11M §5] Constraint engine. Evaluates cash / budget / time / team / operational /
// legal / offer / channel / data-quality / measurement / dependency readiness against an
// opportunity. A high-opportunity option with a critical constraint => BLOCKED_BY_CONSTRAINT.
// Deterministic. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const C = require('./contracts');

const CONSTRAINT_TYPES = Object.freeze([
  'cash', 'budget', 'time', 'team_capacity', 'operational_capacity', 'legal_compliance',
  'offer_availability', 'channel_availability', 'data_quality', 'measurement_readiness', 'dependency_readiness',
]);

function evaluateConstraints(opp, ctx) {
  const list = ctx.current_constraints || [];
  const res = ctx.available_resources || {};
  const cap = ctx.operational_capacity || {};
  const req = (opp.resource_requirements && typeof opp.resource_requirements === 'object') ? opp.resource_requirements : {};
  const evals = [];

  const push = (type, severity, note) => evals.push({ type, severity, note });

  // explicit critical flags from the context
  for (const c of list) {
    if (!c || !c.type) continue;
    if (c.severity === 'CRITICAL' || c.blocking === true) push(c.type, 'CRITICAL', c.note || `${c.type} critical`);
    else if (c.severity === 'TIGHT') push(c.type, 'TIGHT', c.note || `${c.type} tight`);
  }

  // derived: budget
  if (req.budget != null) {
    if (res.budget == null) push('budget', 'UNKNOWN', 'budget requirement stated but no ledger');
    else if (Number(res.budget) < Number(req.budget)) push('budget', 'CRITICAL', 'required budget exceeds available');
    else if (Number(res.budget) < Number(req.budget) * 1.5) push('budget', 'TIGHT', 'budget available but thin');
  }
  // derived: team capacity
  if (req.team != null) {
    if (cap.team_available == null && cap.state == null) push('team_capacity', 'UNKNOWN', 'team requirement stated but no capacity data');
    else if ((cap.team_available != null && Number(cap.team_available) < Number(req.team)) || cap.state === 'SATURATED') push('team_capacity', 'CRITICAL', 'team capacity insufficient / saturated');
  }
  // derived: measurement readiness
  const fs = ctx.current_funnel_state || {};
  if (fs.tracking_status && String(fs.tracking_status).toUpperCase() !== 'VALID' && (opp.affected_metric || opp.experiment_ref)) {
    push('measurement_readiness', 'CRITICAL', 'tracking not valid — a measurable action cannot be prioritised');
  }
  // derived: negative margin economics
  const rev = ctx.current_revenue_state || {};
  if ((rev.margin_state === 'NEGATIVE' || (rev.margin != null && Number(rev.margin) < 0)) && opp.affected_metric && /acqui|traffic|volume|scal|ads|leads/i.test(opp.affected_metric)) {
    push('cash', 'TIGHT', 'negative margin — growth actions cannot outrank an economics fix unless justified');
  }

  const hasCritical = evals.some(e => e.severity === 'CRITICAL');
  const hasTight = evals.some(e => e.severity === 'TIGHT');
  const hasUnknown = evals.some(e => e.severity === 'UNKNOWN');
  const status = hasCritical ? 'BLOCKED_BY_CONSTRAINT' : hasTight ? 'CONSTRAINT_TIGHT' : hasUnknown && evals.length === evals.filter(e => e.severity === 'UNKNOWN').length && evals.length ? 'CONSTRAINT_UNKNOWN' : 'CONSTRAINT_CLEAR';

  const body = {
    schema_version: C.DECISION_SCHEMA_VERSION, kind: 'ConstraintEvaluation',
    opportunity_id: opp.opportunity_id,
    status,
    evaluations: evals.sort((a, b) => (a.type + a.severity).localeCompare(b.type + b.severity)),
    critical_types: evals.filter(e => e.severity === 'CRITICAL').map(e => e.type).sort(),
    generated_by: 'deterministic:ucdm/decision_orchestrator/constraints',
  };
  body.evaluation_id = 'dce_' + sha256Hex(canonicalize({ ...body, evaluation_id: undefined })).slice(0, 40);
  return deepFreeze(body);
}

function validateConstraintEvaluation(e) {
  const errors = [];
  if (!C.CONSTRAINT_STATUS.includes(e.status)) errors.push(`bad constraint status "${e.status}"`);
  if (e.status === 'BLOCKED_BY_CONSTRAINT' && e.critical_types.length === 0) errors.push('blocked without a critical constraint');
  return { valid: errors.length === 0, errors };
}

module.exports = { CONSTRAINT_TYPES, evaluateConstraints, validateConstraintEvaluation };
