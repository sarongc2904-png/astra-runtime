'use strict';
// [ASTRA-11J §Q] CAC payback — computed ONLY where a contribution margin (or margin-adjusted
// revenue cadence) permits a valid calculation. Unknown inputs -> UNKNOWN. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

// computePayback({ cac, monthlyContributionMargin }) OR ({ cac, monthlyRevenue, contributionMarginRatio })
function computePayback(x) {
  const cac = num(x.cac);
  let monthlyMargin = num(x.monthly_contribution_margin);
  let basis = 'monthly_contribution_margin';
  if (monthlyMargin == null && x.monthly_revenue != null && x.contribution_margin_ratio != null) {
    const mr = num(x.monthly_revenue), cmr = num(x.contribution_margin_ratio);
    if (mr != null && cmr != null && cmr > 0 && cmr <= 1) { monthlyMargin = Number((mr * cmr).toFixed(4)); basis = 'monthly_revenue * contribution_margin_ratio'; }
  }
  let status, months = null, reason = null;
  if (cac == null) { status = 'UNKNOWN'; reason = 'MISSING_CAC'; }
  else if (x.cac_is_lower_bound) { status = 'UNKNOWN'; reason = 'CAC_IS_LOWER_BOUND — payback needs a complete CAC'; }
  else if (monthlyMargin == null) { status = 'UNKNOWN'; reason = 'MISSING_CONTRIBUTION_MARGIN_CADENCE'; }
  else if (monthlyMargin <= 0) { status = 'UNKNOWN'; reason = 'NON_POSITIVE_CONTRIBUTION_MARGIN'; }
  else { status = 'COMPUTED'; months = Number((cac / monthlyMargin).toFixed(2)); }

  const body = {
    schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'CACPayback',
    status, payback_months: months, cac, monthly_contribution_margin: monthlyMargin, basis: months == null ? null : basis, reason,
    note: 'CAC payback requires a complete CAC and a valid contribution-margin cadence; gross revenue alone is not sufficient',
    generated_by: 'deterministic:ucdm/funnel_revenue',
  };
  body.payback_id = 'pb_' + sha256Hex(canonicalize({ ...body, payback_id: undefined }));
  return deepFreeze(body);
}
function num(v) { return v == null || Number.isNaN(Number(v)) ? null : Number(v); }

function validatePayback(p) {
  const errors = [];
  if (!['COMPUTED', 'UNKNOWN'].includes(p.status)) errors.push(`bad payback status "${p.status}"`);
  if (p.status === 'COMPUTED' && (p.payback_months == null || p.monthly_contribution_margin == null)) errors.push('a computed payback needs months + a contribution-margin cadence');
  return { valid: errors.length === 0, errors };
}

module.exports = { computePayback, validatePayback };
