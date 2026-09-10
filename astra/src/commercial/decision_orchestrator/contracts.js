'use strict';
// [ASTRA-11M] Commercial Decision Orchestrator — controlled vocabularies + guards.
// Deterministic. No LLM, no I/O, no network. ASTRA-11M recommends; it never executes.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const DECISION_SCHEMA_VERSION = 'ucdm-decision-orchestrator-1.0.0';

// §12 — analytical action types ONLY. None of these executes anything.
const ACTION_TYPES = Object.freeze([
  'INVESTIGATE', 'MEASURE', 'FIX_PROCESS', 'TEST', 'HOLD', 'STOP', 'ITERATE',
  'REPRIORITIZE', 'VALIDATE', 'DO_NOT_SCALE',
]);

const CONTEXT_STATUS = Object.freeze(['CONTEXT_VALID', 'CONTEXT_PARTIAL', 'CONTEXT_INSUFFICIENT']);
const OPPORTUNITY_STATUS = Object.freeze(['OPPORTUNITY_NORMALIZED', 'OPPORTUNITY_MALFORMED']);
const APPLICABILITY_STATUS = Object.freeze(['APPLICABLE', 'CONDITIONALLY_APPLICABLE', 'NOT_APPLICABLE', 'BLOCKED']);
const MEMORY_RECONCILE_STATUS = Object.freeze([
  'MEMORY_ALIGNED', 'DECISION_MEMORY_CONFLICT', 'REPEAT_DECISION_REQUIRES_JUSTIFICATION',
  'MEMORY_NOT_GENERALIZABLE', 'NO_APPLICABLE_MEMORY',
]);
const CONSTRAINT_STATUS = Object.freeze(['CONSTRAINT_CLEAR', 'CONSTRAINT_TIGHT', 'BLOCKED_BY_CONSTRAINT', 'CONSTRAINT_UNKNOWN']);
const URGENCY = Object.freeze(['URGENCY_CRITICAL', 'URGENCY_HIGH', 'URGENCY_MEDIUM', 'URGENCY_LOW', 'URGENCY_UNKNOWN']);
const IMPACT = Object.freeze(['IMPACT_HIGH', 'IMPACT_MEDIUM', 'IMPACT_LOW', 'IMPACT_UNKNOWN']);
const TIME_TO_SIGNAL = Object.freeze(['IMMEDIATE', 'SHORT', 'MEDIUM', 'LONG', 'UNKNOWN']);
const REVERSIBILITY = Object.freeze(['EASILY_REVERSIBLE', 'REVERSIBLE', 'PARTIALLY_REVERSIBLE', 'HARD_TO_REVERSE', 'UNKNOWN']);
const RISK_DIMENSIONS = Object.freeze([
  'financial', 'operational', 'customer_experience', 'measurement', 'brand',
  'dependency', 'implementation', 'reversibility',
]);
const RISK_LEVELS = Object.freeze(['RISK_HIGH', 'RISK_MEDIUM', 'RISK_LOW', 'RISK_UNKNOWN']);
const DEPENDENCY_STATUS = Object.freeze(['DEPENDENCY_SATISFIED', 'DEPENDENCY_MISSING', 'DEPENDENCY_BLOCKED', 'DEPENDENCY_UNKNOWN']);
const CANDIDATE_STATUS = Object.freeze([
  'CANDIDATE_READY', 'CANDIDATE_BLOCKED', 'CANDIDATE_DEFERRED', 'CANDIDATE_REJECTED', 'CANDIDATE_MALFORMED',
]);
const PRIORITY_RANK = Object.freeze(['PRIORITY_1', 'PRIORITY_2', 'PRIORITY_3', 'PRIORITY_UNRESOLVED']);
const DECISION_CONFLICT_STATUS = Object.freeze(['NO_CONFLICT', 'RESOLVABLE_CONFLICT', 'UNRESOLVED_CONFLICT', 'BLOCKING_CONFLICT']);
const SELECTION_STATUS = Object.freeze([
  'PRIMARY_SELECTED', 'DECISION_EVIDENCE_INSUFFICIENT', 'PRIORITY_UNRESOLVED',
  'ALL_OPTIONS_BLOCKED', 'NO_VALID_PRIMARY_DECISION',
]);

// evidence-strength ordinal shared with 11K vocabulary
const EVIDENCE_STRENGTH = Object.freeze(['EVIDENCE_STRONG', 'EVIDENCE_MODERATE', 'EVIDENCE_WEAK', 'EVIDENCE_NONE']);
// conflict archetypes (§14)
const CONFLICT_KINDS = Object.freeze([
  'MUTUALLY_EXCLUSIVE', 'MEMORY_VS_EVIDENCE', 'SHORT_VS_LONG_TERM', 'REVENUE_VS_MARGIN',
  'GROWTH_VS_CAPACITY', 'ACQUISITION_VS_RETENTION', 'EXPERIMENTATION_VS_CASH_URGENCY',
]);

function isActionType(t) { return ACTION_TYPES.includes(t); }
function ordinalIndex(list, v) { const i = list.indexOf(v); return i < 0 ? list.length : i; }

// stable id helper: prefix + sha256 of a canonical body (id field excluded by caller)
function idOf(prefix, body, len) { return prefix + sha256Hex(canonicalize(body)).slice(0, len || 48); }

module.exports = deepFreeze({
  DECISION_SCHEMA_VERSION,
  ACTION_TYPES, CONTEXT_STATUS, OPPORTUNITY_STATUS, APPLICABILITY_STATUS, MEMORY_RECONCILE_STATUS,
  CONSTRAINT_STATUS, URGENCY, IMPACT, TIME_TO_SIGNAL, REVERSIBILITY, RISK_DIMENSIONS, RISK_LEVELS,
  DEPENDENCY_STATUS, CANDIDATE_STATUS, PRIORITY_RANK, DECISION_CONFLICT_STATUS, SELECTION_STATUS,
  EVIDENCE_STRENGTH, CONFLICT_KINDS,
  isActionType, ordinalIndex, idOf,
});
