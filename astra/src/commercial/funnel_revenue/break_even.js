'use strict';
// [ASTRA-11J §O] Break-even logic — deterministic, ONLY when the required margin economics
// are supplied. Unknown inputs -> UNKNOWN. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

// computeBreakEven({ avgOrderValue OR firstOrderRevenue, contributionMarginRatio, targetRoasFloor?, ltvContributionForCac? })
function computeBreakEven(x) {
  const rev = num(x.first_order_revenue != null ? x.first_order_revenue : x.avg_order_value);
  const cmr = num(x.contribution_margin_ratio);
  const out = {
    schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'BreakEvenAssessment',
    break_even_cac: null, break_even_roas: null, allowable_acquisition_cost: null,
    inputs: { revenue_basis: rev, contribution_margin_ratio: cmr, ltv_contribution: num(x.ltv_contribution) },
    status: 'UNKNOWN', reason: null,
    note: 'break-even needs a USER_PROVIDED contribution-margin ratio and a revenue basis; no cost is assumed',
    generated_by: 'deterministic:ucdm/funnel_revenue',
  };
  if (rev == null || cmr == null || cmr <= 0 || cmr > 1) {
    out.reason = rev == null ? 'MISSING_REVENUE_BASIS' : 'MISSING_OR_INVALID_CONTRIBUTION_MARGIN_RATIO';
  } else {
    // break-even on the first transaction: acquisition cost == contribution
    const contribution = Number((rev * cmr).toFixed(4));
    out.break_even_cac = contribution;
    out.break_even_roas = Number((1 / cmr).toFixed(4)); // revenue must be >= spend / cmr
    // allowable CAC can extend to lifetime contribution when an LTV contribution is supplied
    out.allowable_acquisition_cost = x.ltv_contribution != null ? num(x.ltv_contribution) : contribution;
    out.status = 'COMPUTED';
    out.note = 'break-even CAC = first-order contribution; break-even ROAS = 1 / contribution-margin ratio; allowable CAC uses lifetime contribution only when supplied';
  }
  out.break_even_id = 'be_' + sha256Hex(canonicalize({ ...out, break_even_id: undefined }));
  return deepFreeze(out);
}
function num(v) { return v == null || Number.isNaN(Number(v)) ? null : Number(v); }

function validateBreakEven(b) {
  const errors = [];
  if (!['COMPUTED', 'UNKNOWN'].includes(b.status)) errors.push(`bad break-even status "${b.status}"`);
  if (b.status === 'COMPUTED' && (b.break_even_cac == null || b.break_even_roas == null || b.inputs.contribution_margin_ratio == null)) errors.push('a computed break-even needs a supplied contribution-margin ratio + revenue basis');
  return { valid: errors.length === 0, errors };
}

module.exports = { computeBreakEven, validateBreakEven };
