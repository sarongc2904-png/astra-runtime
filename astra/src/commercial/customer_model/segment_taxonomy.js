'use strict';
// [ASTRA-11G §C] Controlled SegmentDimension taxonomy. No uncontrolled / LLM-created
// canonical dimensions. UNKNOWN is always allowed. Pure data. No I/O, no LLM.
const SEGMENT_DIMENSION_TAXONOMY_VERSION = 'cm-segment-dimension-v1';

const SEGMENT_DIMENSIONS = Object.freeze([
  'problem', 'desired_outcome', 'urgency', 'awareness', 'solution_usage', 'alternative_used',
  'budget_signal', 'purchase_readiness', 'decision_criterion', 'customer_lifecycle',
  'business_maturity', 'industry', 'company_size', 'role', 'geography', 'channel', 'offer_fit',
  'UNKNOWN',
]);

// Controlled value sets for the closed-vocabulary dimensions. Open dimensions
// (problem / desired_outcome / decision_criterion / industry / geography / channel) carry
// evidence-grounded free values but the DIMENSION name itself is still controlled.
const DIMENSION_VALUE_SETS = Object.freeze({
  urgency: ['LOW', 'MEDIUM', 'HIGH', 'MIXED', 'UNKNOWN'],
  awareness: ['UNAWARE', 'PROBLEM_AWARE', 'SOLUTION_AWARE', 'PRODUCT_AWARE', 'MOST_AWARE', 'MIXED', 'UNKNOWN'],
  budget_signal: ['BUDGET_DECLARED', 'PRICE_SENSITIVE', 'FINANCING_REQUIRED', 'BUDGET_FLEXIBLE', 'NO_BUDGET_SIGNAL', 'UNKNOWN'],
  purchase_readiness: ['RESEARCHING', 'COMPARING', 'READY', 'DEFERRED', 'UNKNOWN'],
  solution_usage: ['NONE', 'DIY', 'MANUAL', 'COMPETITOR', 'FORMER_SOLUTION', 'UNKNOWN'],
  customer_lifecycle: ['PROSPECT', 'NEW_CUSTOMER', 'ACTIVE_CUSTOMER', 'FORMER_CUSTOMER', 'UNKNOWN'],
  business_maturity: ['PRE_REVENUE', 'EARLY', 'GROWTH', 'ESTABLISHED', 'UNKNOWN'],
  company_size: ['SOLO', 'MICRO', 'SMALL', 'MID', 'LARGE', 'ENTERPRISE', 'UNKNOWN'],
  offer_fit: ['STRONG', 'PARTIAL', 'WEAK', 'UNKNOWN'],
});

const OPEN_DIMENSIONS = Object.freeze(['problem', 'desired_outcome', 'alternative_used', 'decision_criterion', 'industry', 'geography', 'channel', 'role']);

function isDimension(name) { return SEGMENT_DIMENSIONS.includes(String(name)); }

// Validate/normalize a (dimension, value) pair. Closed dims must use their vocabulary
// (or UNKNOWN); open dims accept any non-empty grounded string; unknown dim => UNKNOWN.
function normalizeDimensionValue(dimension, value) {
  if (!isDimension(dimension)) return { dimension: 'UNKNOWN', value: 'UNKNOWN', ok: false, reason: 'uncontrolled dimension' };
  const v = value == null ? 'UNKNOWN' : String(value);
  if (DIMENSION_VALUE_SETS[dimension]) {
    const up = v.toUpperCase();
    if (DIMENSION_VALUE_SETS[dimension].includes(up)) return { dimension, value: up, ok: true };
    return { dimension, value: 'UNKNOWN', ok: false, reason: `value "${v}" not in controlled set for ${dimension}` };
  }
  return { dimension, value: v.trim() || 'UNKNOWN', ok: !!v.trim() };
}

module.exports = {
  SEGMENT_DIMENSION_TAXONOMY_VERSION, SEGMENT_DIMENSIONS, DIMENSION_VALUE_SETS, OPEN_DIMENSIONS,
  isDimension, normalizeDimensionValue,
};
