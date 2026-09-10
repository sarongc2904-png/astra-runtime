'use strict';
// [ASTRA-11J §J] Canonical CommercialCost. Preserves whether a cost is OBSERVED /
// USER_PROVIDED / COMPUTED / UNKNOWN. ASTRA never invents a cost. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { SOURCE_CLASSES } = require('../provenance/provenance');
const { normalizePeriod } = require('./time_window');
const { normalizeChannel } = require('./channel');

const COST_TYPES = Object.freeze([
  'MEDIA_SPEND', 'SALES_COST', 'FULFILLMENT_COST', 'SOFTWARE', 'AGENCY_FEE', 'COMMISSION',
  'DISCOUNT', 'PAYMENT_FEE', 'SUPPORT_COST', 'VARIABLE_COST', 'FIXED_COST', 'OTHER',
]);
const COST_STATUS = Object.freeze(['OBSERVED', 'USER_PROVIDED', 'COMPUTED', 'UNKNOWN']);

// acquisition-related cost types (used to compute cost coverage for CPA/CAC)
const ACQUISITION_COST_TYPES = Object.freeze(['MEDIA_SPEND', 'SALES_COST', 'AGENCY_FEE', 'COMMISSION', 'SOFTWARE']);

function makeCost(x) {
  const cost_type = COST_TYPES.includes(String(x.cost_type).toUpperCase()) ? String(x.cost_type).toUpperCase() : 'OTHER';
  const status = COST_STATUS.includes(x.status) ? x.status : (x.amount == null ? 'UNKNOWN' : 'USER_PROVIDED');
  const body = {
    schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'CommercialCost',
    cost_type,
    amount: x.amount == null || Number.isNaN(Number(x.amount)) ? null : Number(x.amount),
    currency: x.currency == null ? null : String(x.currency),
    status,
    source_class: SOURCE_CLASSES.includes(x.source_class) ? x.source_class : (status === 'COMPUTED' ? 'COMPUTED' : 'USER_PROVIDED'),
    period: normalizePeriod(x.period),
    channel: x.channel == null ? null : normalizeChannel(x.channel),
    scope_note: x.scope_note == null ? null : String(x.scope_note),
    is_acquisition_cost: ACQUISITION_COST_TYPES.includes(cost_type),
    evidence_refs: [...new Set((x.evidence_refs || []).map(String))].sort(),
    generated_by: 'deterministic:ucdm/funnel_revenue',
  };
  body.cost_id = 'co_' + sha256Hex(canonicalize({ ...body, cost_id: undefined }));
  return deepFreeze(body);
}

// costCoverage(costs, { requiredTypes }) -> which acquisition cost components are present
function costCoverage(costs, { requiredTypes = ACQUISITION_COST_TYPES } = {}) {
  const present = new Set(costs.filter(c => c.amount != null).map(c => c.cost_type));
  const known = requiredTypes.filter(t => present.has(t));
  const missing = requiredTypes.filter(t => !present.has(t));
  return {
    present_types: [...present].sort(),
    covered_required: known.sort(),
    missing_required: missing.sort(),
    coverage_ratio: requiredTypes.length ? Number((known.length / requiredTypes.length).toFixed(4)) : 0,
    complete: missing.length === 0,
  };
}

function validateCost(c) {
  const errors = [];
  if (!COST_TYPES.includes(c.cost_type)) errors.push(`bad cost_type "${c.cost_type}"`);
  if (!COST_STATUS.includes(c.status)) errors.push(`bad cost status "${c.status}"`);
  if (c.status !== 'UNKNOWN' && c.amount == null) errors.push('a non-UNKNOWN cost needs an amount');
  if (c.amount != null && c.amount < 0) errors.push('a cost amount cannot be negative');
  return { valid: errors.length === 0, errors };
}

module.exports = { COST_TYPES, COST_STATUS, ACQUISITION_COST_TYPES, makeCost, costCoverage, validateCost };
