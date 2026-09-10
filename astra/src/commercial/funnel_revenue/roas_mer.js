'use strict';
// [ASTRA-11J §R] ROAS vs MER — never interchangeable. ROAS = attributed revenue / ad spend
// and MUST carry its attribution basis. MER = total revenue / total media spend. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

// computeROAS({ attributedRevenue, adSpend, attribution })
function computeROAS({ attributed_revenue = null, ad_spend = null, attribution = null }) {
  const basis = attribution && attribution.basis ? attribution.basis : 'UNKNOWN';
  let status, value = null, reason = null;
  if (basis === 'UNKNOWN') { status = 'UNKNOWN'; reason = 'MISSING_ATTRIBUTION_BASIS'; }
  else if (attributed_revenue == null || ad_spend == null) { status = 'UNKNOWN'; reason = attributed_revenue == null ? 'MISSING_ATTRIBUTED_REVENUE' : 'MISSING_AD_SPEND'; }
  else if (ad_spend <= 0) { status = 'UNKNOWN'; reason = 'ZERO_AD_SPEND'; }
  else { status = 'COMPUTED'; value = Number((attributed_revenue / ad_spend).toFixed(4)); }
  return mk('ROAS', { status, value, attribution_basis: basis, numerator: 'attributed_revenue', denominator: 'ad_spend', reason, causal: false, note: 'ROAS is attributed (reported) revenue over ad spend — attribution basis is required and is NOT causal' });
}

// computeMER({ totalRevenue, totalMediaSpend })
function computeMER({ total_revenue = null, total_media_spend = null }) {
  let status, value = null, reason = null;
  if (total_revenue == null || total_media_spend == null) { status = 'UNKNOWN'; reason = total_revenue == null ? 'MISSING_TOTAL_REVENUE' : 'MISSING_MEDIA_SPEND'; }
  else if (total_media_spend <= 0) { status = 'UNKNOWN'; reason = 'ZERO_MEDIA_SPEND'; }
  else { status = 'COMPUTED'; value = Number((total_revenue / total_media_spend).toFixed(4)); }
  return mk('MER', { status, value, numerator: 'total_revenue', denominator: 'total_media_spend', reason, note: 'MER (blended) is total revenue over total media spend — no attribution, not comparable to ROAS' });
}

function mk(metric, body) {
  const b = { schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'AdEfficiencyMetric', metric, ...body, interchangeable_with_the_other: false, generated_by: 'deterministic:ucdm/funnel_revenue' };
  b.metric_id = (metric === 'ROAS' ? 'roas_' : 'mer_') + sha256Hex(canonicalize({ ...b, metric_id: undefined }));
  return deepFreeze(b);
}

function validateAdEfficiency(m) {
  const errors = [];
  if (!['ROAS', 'MER'].includes(m.metric)) errors.push(`bad ad-efficiency metric "${m.metric}"`);
  if (m.metric === 'ROAS' && m.status === 'COMPUTED' && (!m.attribution_basis || m.attribution_basis === 'UNKNOWN')) errors.push('a computed ROAS must carry a non-UNKNOWN attribution basis');
  if (m.interchangeable_with_the_other !== false) errors.push('ROAS and MER are not interchangeable');
  if (m.status === 'COMPUTED' && m.value == null) errors.push('a computed metric needs a value');
  return { valid: errors.length === 0, errors };
}

module.exports = { computeROAS, computeMER, validateAdEfficiency };
