'use strict';
// [ASTRA-11J §L §M] Canonical RevenueObservation + AOV / ARPU / ARPA. Net revenue is NEVER
// derived without its required components. AOV/ARPU/ARPA are never substituted for one
// another. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { SOURCE_CLASSES } = require('../provenance/provenance');
const { normalizePeriod } = require('./time_window');

const REVENUE_TYPES = Object.freeze(['GROSS', 'NET', 'RECURRING', 'ONE_TIME', 'EXPANSION', 'REFUND', 'DISCOUNT', 'TAX']);
const REVENUE_STATUS = Object.freeze(['OBSERVED', 'USER_PROVIDED', 'COMPUTED', 'UNKNOWN']);

function makeRevenueObservation(x) {
  const revenue_type = REVENUE_TYPES.includes(String(x.revenue_type).toUpperCase()) ? String(x.revenue_type).toUpperCase() : 'GROSS';
  const status = REVENUE_STATUS.includes(x.status) ? x.status : (x.amount == null ? 'UNKNOWN' : 'USER_PROVIDED');
  const body = {
    schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'RevenueObservation',
    revenue_type,
    amount: x.amount == null || Number.isNaN(Number(x.amount)) ? null : Number(x.amount),
    currency: x.currency == null ? null : String(x.currency),
    status,
    source_class: SOURCE_CLASSES.includes(x.source_class) ? x.source_class : (status === 'COMPUTED' ? 'COMPUTED' : 'USER_PROVIDED'),
    period: normalizePeriod(x.period),
    cohort: x.cohort == null ? null : String(x.cohort),
    order_count: numOrNull(x.order_count),
    customer_count: numOrNull(x.customer_count),
    account_count: numOrNull(x.account_count),
    user_count: numOrNull(x.user_count),
    segment: x.segment == null ? null : String(x.segment),
    channel: x.channel == null ? null : String(x.channel),
    evidence_refs: [...new Set((x.evidence_refs || []).map(String))].sort(),
    generated_by: 'deterministic:ucdm/funnel_revenue',
  };
  body.revenue_id = 'rv_' + sha256Hex(canonicalize({ ...body, revenue_id: undefined }));
  return deepFreeze(body);
}
function numOrNull(v) { return v == null || Number.isNaN(Number(v)) ? null : Number(v); }

// deriveNetRevenue({ gross, refund, discount, tax }) -> only when gross + all supplied adjustments present
function deriveNetRevenue(components) {
  const g = components.gross;
  if (g == null) return { status: 'UNKNOWN', reason: 'MISSING_GROSS' };
  // net = gross - refunds - discounts - taxes ; every adjustment that the business *says exists*
  // must be supplied. If the caller marks an adjustment as "applicable but unknown" -> UNKNOWN.
  for (const k of ['refund', 'discount', 'tax']) {
    if (components[`${k}_applicable`] && components[k] == null) return { status: 'UNKNOWN', reason: `MISSING_${k.toUpperCase()}` };
  }
  const net = g - (components.refund || 0) - (components.discount || 0) - (components.tax || 0);
  return { status: 'COMPUTED', value: Number(net.toFixed(4)), formula: 'gross - refund - discount - tax', components };
}

// AOV / ARPU / ARPA — each requires its OWN correct denominator
function aov(revenueAmount, orderCount) {
  if (revenueAmount == null || orderCount == null || orderCount <= 0) return { status: 'UNKNOWN', reason: orderCount == null ? 'MISSING_ORDER_COUNT' : orderCount <= 0 ? 'ZERO_ORDER_COUNT' : 'MISSING_REVENUE' };
  return { status: 'COMPUTED', metric: 'AOV', value: Number((revenueAmount / orderCount).toFixed(4)), denominator: 'order_count', denominator_value: orderCount };
}
function arpu(revenueAmount, userCount) {
  if (revenueAmount == null || userCount == null || userCount <= 0) return { status: 'UNKNOWN', reason: userCount == null ? 'MISSING_USER_COUNT' : userCount <= 0 ? 'ZERO_USER_COUNT' : 'MISSING_REVENUE' };
  return { status: 'COMPUTED', metric: 'ARPU', value: Number((revenueAmount / userCount).toFixed(4)), denominator: 'user_count', denominator_value: userCount };
}
function arpa(revenueAmount, accountCount) {
  if (revenueAmount == null || accountCount == null || accountCount <= 0) return { status: 'UNKNOWN', reason: accountCount == null ? 'MISSING_ACCOUNT_COUNT' : accountCount <= 0 ? 'ZERO_ACCOUNT_COUNT' : 'MISSING_REVENUE' };
  return { status: 'COMPUTED', metric: 'ARPA', value: Number((revenueAmount / accountCount).toFixed(4)), denominator: 'account_count', denominator_value: accountCount };
}

function validateRevenueObservation(r) {
  const errors = [];
  if (!REVENUE_TYPES.includes(r.revenue_type)) errors.push(`bad revenue_type "${r.revenue_type}"`);
  if (r.status !== 'UNKNOWN' && r.amount == null) errors.push('a non-UNKNOWN revenue observation needs an amount');
  if (r.revenue_type === 'NET' && r.source_class === 'COMPUTED' && !r.derivation) errors.push('a COMPUTED net revenue must record its derivation components');
  return { valid: errors.length === 0, errors };
}

module.exports = { REVENUE_TYPES, REVENUE_STATUS, makeRevenueObservation, deriveNetRevenue, aov, arpu, arpa, validateRevenueObservation };
