'use strict';
// [ASTRA-11L §2] Memory types. Explicit, controlled — ASTRA never auto-converts between
// types. A HYPOTHESIS is never a FACT; a RESULT only becomes a LEARNING via the strict
// promotion policy; a DECISION does not imply success; an OBSERVATION does not imply
// causality. Pure data. No LLM, no I/O.
const BUSINESS_MEMORY_SCHEMA_VERSION = 'ucdm-business-memory-1.0.0';

const MEMORY_TYPES = Object.freeze([
  'FACT', 'OBSERVATION', 'DIAGNOSIS', 'HYPOTHESIS', 'DECISION', 'EXPERIMENT', 'RESULT',
  'LEARNING', 'CONSTRAINT', 'PREFERENCE', 'OFFER', 'SEGMENT', 'CHANNEL', 'FUNNEL_STATE',
  'UNIT_ECONOMICS', 'PRIORITY',
]);

// types that may ONLY be created via a controlled promotion path (never directly from a
// weaker type or without meeting the policy).
const PROMOTION_GATED = Object.freeze(['LEARNING']);

// types that carry no causal or truth implication by construction.
const NON_CAUSAL_TYPES = Object.freeze(['OBSERVATION', 'DIAGNOSIS', 'HYPOTHESIS', 'DECISION', 'PRIORITY']);

// types that assert something as true (subject to evidence + scope discipline).
const ASSERTIVE_TYPES = Object.freeze(['FACT', 'LEARNING', 'CONSTRAINT', 'UNIT_ECONOMICS', 'FUNNEL_STATE']);

// forbidden automatic transitions (source_type -> target_type)
const FORBIDDEN_AUTO_TRANSITIONS = Object.freeze([
  ['HYPOTHESIS', 'FACT'], ['HYPOTHESIS', 'LEARNING'], ['OBSERVATION', 'FACT'],
  ['DIAGNOSIS', 'FACT'], ['DECISION', 'LEARNING'], ['RESULT', 'FACT'],
  ['PREFERENCE', 'FACT'], ['PRIORITY', 'FACT'],
]);

function isType(t) { return MEMORY_TYPES.includes(String(t)); }
function isForbiddenAutoTransition(from, to) {
  return FORBIDDEN_AUTO_TRANSITIONS.some(([a, b]) => a === String(from) && b === String(to));
}

module.exports = {
  BUSINESS_MEMORY_SCHEMA_VERSION, MEMORY_TYPES, PROMOTION_GATED, NON_CAUSAL_TYPES,
  ASSERTIVE_TYPES, FORBIDDEN_AUTO_TRANSITIONS, isType, isForbiddenAutoTransition,
};
