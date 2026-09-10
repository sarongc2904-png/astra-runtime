'use strict';
// [ASTRA-11M §1] DecisionContext contract. Assembles the current state of the business from
// validated ASTRA-11J / 11K / 11L inputs + explicit business constraints. Missing fields are
// left explicitly null — never invented. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze, nfcLF } = require('../validation/canonical');
const C = require('./contracts');

const CONTEXT_FIELDS = Object.freeze([
  'business_id', 'decision_timestamp', 'scope',
  'current_funnel_state', 'current_revenue_state', 'current_constraints', 'current_priorities',
  'candidate_opportunities', 'candidate_experiments', 'applicable_memories',
  'active_conflicts', 'stale_memories', 'invalidated_memories',
  'available_resources', 'cash_urgency', 'decision_horizon', 'risk_tolerance', 'operational_capacity',
]);

// fields whose absence downgrades the context
const CORE_FIELDS = Object.freeze(['business_id', 'decision_timestamp', 'scope', 'current_funnel_state']);
const SUPPORT_FIELDS = Object.freeze([
  'current_revenue_state', 'current_constraints', 'candidate_opportunities',
  'applicable_memories', 'available_resources', 'operational_capacity',
]);

function arr(v) { return Array.isArray(v) ? v.slice() : []; }
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? { ...v } : {}; }

function makeDecisionContext(x) {
  x = x || {};
  const missing = [];
  const body = {
    schema_version: C.DECISION_SCHEMA_VERSION, kind: 'DecisionContext',
    business_id: x.business_id == null ? null : String(x.business_id),
    decision_timestamp: x.decision_timestamp == null ? null : String(x.decision_timestamp),
    scope: obj(x.scope),
    current_funnel_state: x.current_funnel_state == null ? null : obj(x.current_funnel_state),
    current_revenue_state: x.current_revenue_state == null ? null : obj(x.current_revenue_state),
    current_constraints: arr(x.current_constraints),
    current_priorities: arr(x.current_priorities),
    candidate_opportunities: arr(x.candidate_opportunities),
    candidate_experiments: arr(x.candidate_experiments),
    applicable_memories: arr(x.applicable_memories),
    active_conflicts: arr(x.active_conflicts),
    stale_memories: arr(x.stale_memories),
    invalidated_memories: arr(x.invalidated_memories),
    available_resources: x.available_resources == null ? null : obj(x.available_resources),
    cash_urgency: x.cash_urgency == null ? null : String(x.cash_urgency),
    decision_horizon: x.decision_horizon == null ? null : String(x.decision_horizon),
    risk_tolerance: x.risk_tolerance == null ? null : String(x.risk_tolerance),
    operational_capacity: x.operational_capacity == null ? null : obj(x.operational_capacity),
    generated_by: 'deterministic:ucdm/decision_orchestrator/context',
  };

  for (const f of CORE_FIELDS) {
    const v = body[f];
    if (v == null || (typeof v === 'object' && Object.keys(v).length === 0)) missing.push(f);
  }
  const supportMissing = SUPPORT_FIELDS.filter(f => {
    const v = body[f];
    return v == null || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
  });

  body.missing_core_fields = missing.sort();
  body.missing_support_fields = supportMissing.sort();
  body.status = missing.length > 0
    ? 'CONTEXT_INSUFFICIENT'
    : (supportMissing.length >= 3 || body.candidate_opportunities.length === 0 ? 'CONTEXT_PARTIAL' : 'CONTEXT_VALID');
  body.context_id = 'dctx_' + sha256Hex(canonicalize({ ...body, context_id: undefined }));
  return deepFreeze(body);
}

function validateDecisionContext(ctx) {
  const errors = [];
  if (!C.CONTEXT_STATUS.includes(ctx.status)) errors.push(`bad context status "${ctx.status}"`);
  if (ctx.status === 'CONTEXT_VALID' && ctx.missing_core_fields.length) errors.push('CONTEXT_VALID with missing core fields');
  if (!ctx.business_id && ctx.status !== 'CONTEXT_INSUFFICIENT') errors.push('no business_id but not INSUFFICIENT');
  return { valid: errors.length === 0, errors };
}

module.exports = { CONTEXT_FIELDS, CORE_FIELDS, SUPPORT_FIELDS, makeDecisionContext, validateDecisionContext };
