'use strict';
// [ASTRA-11J §P] LTV — several EXPLICIT methodologies. ASTRA does NOT silently compute
// ARPU/churn LTV. A modelled LTV is labelled MODELLED, never OBSERVED. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const LTV_METHODOLOGIES = Object.freeze(['OBSERVED_COHORT_LTV', 'HISTORICAL_AVERAGE_LTV', 'MODELLED_LTV', 'USER_PROVIDED_LTV']);
const LTV_STATUS = Object.freeze(['OBSERVED', 'COMPUTED', 'MODELLED', 'USER_PROVIDED', 'UNKNOWN']);

// buildLTV(ltvInputs) -> [LTVEstimate]
//   Each input: { methodology, value?, currency?, cohort?, assumptions?, input_refs?,
//                 observed_cohort?: { customers, cumulative_revenue, window_days },
//                 arpu_churn?: { arpu, churn_rate, authorized:true } }
function buildLTV(ltvInputs = []) {
  const out = [];
  for (const inp of ltvInputs) {
    const methodology = LTV_METHODOLOGIES.includes(String(inp.methodology).toUpperCase()) ? String(inp.methodology).toUpperCase() : null;
    if (!methodology) { out.push(freeze({ methodology: 'UNKNOWN', status: 'UNKNOWN', reason: 'UNRECOGNIZED_METHODOLOGY' })); continue; }

    if (methodology === 'USER_PROVIDED_LTV') {
      out.push(freeze({ methodology, status: inp.value != null ? 'USER_PROVIDED' : 'UNKNOWN', value: numOrNull(inp.value), currency: inp.currency || null, cohort: inp.cohort || null, assumptions: inp.assumptions || null, input_refs: refs(inp), note: 'value supplied by the business' }));
      continue;
    }
    if (methodology === 'OBSERVED_COHORT_LTV') {
      const c = inp.observed_cohort || {};
      if (c.customers == null || c.cumulative_revenue == null || c.customers <= 0) {
        out.push(freeze({ methodology, status: 'UNKNOWN', reason: 'MISSING_COHORT_INPUTS', input_refs: refs(inp) }));
      } else {
        out.push(freeze({ methodology, status: 'OBSERVED', value: round(c.cumulative_revenue / c.customers), currency: inp.currency || null, cohort: inp.cohort || null, window_days: c.window_days || null, note: `observed cumulative revenue per cohort customer over ${c.window_days || '?'} days — a floor, not a lifetime projection`, input_refs: refs(inp) }));
      }
      continue;
    }
    if (methodology === 'HISTORICAL_AVERAGE_LTV') {
      const h = inp.historical || {};
      if (h.total_revenue == null || h.total_customers == null || h.total_customers <= 0) {
        out.push(freeze({ methodology, status: 'UNKNOWN', reason: 'MISSING_HISTORICAL_INPUTS', input_refs: refs(inp) }));
      } else {
        out.push(freeze({ methodology, status: 'COMPUTED', value: round(h.total_revenue / h.total_customers), currency: inp.currency || null, note: 'historical average revenue per customer to date — not a forward projection', input_refs: refs(inp) }));
      }
      continue;
    }
    if (methodology === 'MODELLED_LTV') {
      const m = inp.arpu_churn || inp.model || {};
      if (!m.authorized) {
        out.push(freeze({ methodology, status: 'UNKNOWN', reason: 'MODEL_NOT_AUTHORIZED', note: 'an ARPU/churn or other LTV model is only computed when its assumptions are explicitly authorized', input_refs: refs(inp) }));
      } else if (m.arpu == null || m.churn_rate == null || m.churn_rate <= 0 || m.churn_rate > 1) {
        out.push(freeze({ methodology, status: 'UNKNOWN', reason: 'INVALID_MODEL_INPUTS', input_refs: refs(inp) }));
      } else {
        out.push(freeze({ methodology, status: 'MODELLED', value: round(m.arpu / m.churn_rate), currency: inp.currency || null, model: 'ARPU / churn_rate', assumptions: { arpu: m.arpu, churn_rate: m.churn_rate, authorized: true, ...(inp.assumptions || {}) }, is_modelled: true, note: 'MODELLED LTV — an authorized projection, NOT an observed value', input_refs: refs(inp) }));
      }
      continue;
    }
  }
  return out;
}

function freeze(x) {
  const b = { schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'LTVEstimate', is_modelled: x.is_modelled === true, ...x, generated_by: 'deterministic:ucdm/funnel_revenue' };
  b.ltv_id = 'ltv_' + sha256Hex(canonicalize({ ...b, ltv_id: undefined }));
  return deepFreeze(b);
}
function numOrNull(v) { return v == null || Number.isNaN(Number(v)) ? null : Number(v); }
function round(x) { return Number(Number(x).toFixed(4)); }
function refs(inp) { return [...new Set(inp.input_refs || [])].sort(); }

function validateLTV(l) {
  const errors = [];
  if (!['OBSERVED_COHORT_LTV', 'HISTORICAL_AVERAGE_LTV', 'MODELLED_LTV', 'USER_PROVIDED_LTV', 'UNKNOWN'].includes(l.methodology)) errors.push(`bad LTV methodology "${l.methodology}"`);
  if (!LTV_STATUS.includes(l.status)) errors.push(`bad LTV status "${l.status}"`);
  if (l.methodology === 'MODELLED_LTV' && l.status !== 'UNKNOWN' && (l.status !== 'MODELLED' || l.is_modelled !== true)) errors.push('a modelled LTV must be labelled MODELLED / is_modelled:true');
  if (l.status === 'OBSERVED' && l.methodology !== 'OBSERVED_COHORT_LTV') errors.push('only OBSERVED_COHORT_LTV may be OBSERVED');
  return { valid: errors.length === 0, errors };
}

module.exports = { LTV_METHODOLOGIES, LTV_STATUS, buildLTV, validateLTV };
