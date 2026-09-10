'use strict';
// [ASTRA-11J §AF] Deterministic FunnelRevenueCompletion. An LLM can NEVER mark completion.
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const COMPLETION_STATUS = Object.freeze(['COMPLETE_FOR_SCOPE', 'PARTIAL', 'INSUFFICIENT', 'BLOCKED']);
const REASON_CODES = Object.freeze([
  'LOW_FUNNEL_COVERAGE', 'MISSING_DENOMINATOR', 'TIME_WINDOW_MISMATCH', 'COHORT_MISMATCH',
  'CHANNEL_SCOPE_MISMATCH', 'MISSING_COST_DATA', 'MISSING_REVENUE_DATA', 'MISSING_MARGIN_DATA',
  'MISSING_CUSTOMER_COUNT', 'UNKNOWN_ATTRIBUTION', 'LOW_RETENTION_COVERAGE', 'MISSING_LTV_BASIS',
  'MISSING_PAYBACK_BASIS', 'DATA_CONFLICT', 'SOURCE_FAILURE',
]);

function assessCompletion(x) {
  const {
    funnel, observations = [], transitions = [], costs = [], revenues = [], margins = null,
    unitEconomics = {}, ltv = [], payback = null, attribution = null, retention = null,
    dataConflicts = [], businessInput = {},
  } = x;
  const reasons = [];

  const inScope = new Set(funnel ? funnel.in_scope_stages : []);
  const observedKeys = new Set(observations.filter(o => o.count != null).map(o => o.stage_key));
  const covered = [...inScope].filter(k => observedKeys.has(k)).length;
  if (inScope.size > 0 && covered / inScope.size < 0.6) reasons.push('LOW_FUNNEL_COVERAGE');

  if (transitions.some(t => t.status === 'INVALID_DENOMINATOR' || t.status === 'MISSING_COUNT')) reasons.push('MISSING_DENOMINATOR');
  if (transitions.some(t => t.status === 'SCOPE_MISMATCH' && (t.scope_mismatches || []).some(m => m.field === 'period'))) reasons.push('TIME_WINDOW_MISMATCH');
  if (transitions.some(t => t.status === 'SCOPE_MISMATCH' && (t.scope_mismatches || []).some(m => m.field === 'cohort'))) reasons.push('COHORT_MISMATCH');
  if (transitions.some(t => t.status === 'SCOPE_MISMATCH' && (t.scope_mismatches || []).some(m => m.field === 'channel'))) reasons.push('CHANNEL_SCOPE_MISMATCH');

  if (costs.filter(c => c.amount != null).length === 0) reasons.push('MISSING_COST_DATA');
  if (revenues.filter(r => r.amount != null).length === 0) reasons.push('MISSING_REVENUE_DATA');
  if (!margins || (margins.gross_margin.status !== 'COMPUTED' && margins.contribution_margin.status !== 'COMPUTED')) reasons.push('MISSING_MARGIN_DATA');
  if (!revenues.some(r => r.customer_count != null || r.account_count != null || r.user_count != null) && !(businessInput.new_customers != null)) reasons.push('MISSING_CUSTOMER_COUNT');
  if (!attribution || attribution.basis === 'UNKNOWN') reasons.push('UNKNOWN_ATTRIBUTION');
  if (!retention || Object.values(retention.rates).every(r => r.status !== 'VALID')) reasons.push('LOW_RETENTION_COVERAGE');
  if (ltv.length === 0 || ltv.every(l => l.status === 'UNKNOWN')) reasons.push('MISSING_LTV_BASIS');
  if (!payback || payback.status !== 'COMPUTED') reasons.push('MISSING_PAYBACK_BASIS');
  if (dataConflicts.length > 0) reasons.push('DATA_CONFLICT');
  const failed = (businessInput.source_failures || []).length;
  if (failed > 0) reasons.push('SOURCE_FAILURE');

  let status;
  if (!funnel || observations.filter(o => o.count != null).length === 0) status = 'BLOCKED';
  else if (transitions.filter(t => t.status === 'VALID').length === 0 && covered < 2) status = 'INSUFFICIENT';
  else if (reasons.length > 0) status = 'PARTIAL';
  else status = 'COMPLETE_FOR_SCOPE';

  const body = {
    schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'FunnelRevenueCompletion',
    status, reason_codes: [...new Set(reasons)].sort(),
    generated_by: 'deterministic:ucdm/funnel_revenue/completion',
    note: 'an LLM may never mark the funnel/revenue model complete',
  };
  body.completion_id = 'frcmp_' + sha256Hex(canonicalize({ ...body, completion_id: undefined }));
  return deepFreeze(body);
}

module.exports = { COMPLETION_STATUS, REASON_CODES, assessCompletion };
