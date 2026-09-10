'use strict';
// [ASTRA-11J §V] Retention / expansion. Activation, repeat purchase, renewal, retention,
// churn, upsell, cross-sell, expansion revenue — cohort basis preserved. No churn probability
// is invented. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { computeTransition } = require('./transition_metrics');

// buildRetention({ obsByKey, expansionRevenue, opts })
//   obsByKey may include: ACTIVATED, RETAINED, RENEWED, UPSELL, CROSS_SELL, CHURN, and a
//   PURCHASE / REPEAT_PURCHASE pair.
function buildRetention({ obsByKey = {}, expansionRevenue = [], opts = {} }) {
  const rate = (a, b) => { const m = computeTransition(obsByKey[a] || null, obsByKey[b] || null, { ...opts, requireSamePeriod: false }); return { status: m.status, rate: m.conversion_rate, reason: m.reason || null, cohort_basis_note: m.status === 'VALID' ? 'cohort/period basis matched' : m.reason, metric_ref: m.metric_id }; };

  const rates = {
    activation_rate: rate('PURCHASE', 'ACTIVATED'),
    repeat_purchase_rate: rate('PURCHASE', 'REPEAT_PURCHASE'),
    renewal_rate: rate('RETAINED', 'RENEWED'),
    retention_rate: rate('ACTIVATED', 'RETAINED'),
    upsell_rate: rate('RETAINED', 'UPSELL'),
    cross_sell_rate: rate('RETAINED', 'CROSS_SELL'),
  };
  // churn rate ONLY when both a base and a churn count exist on a matched cohort/period
  const churnM = computeTransition(obsByKey.ACTIVATED || null, obsByKey.CHURN || null, { ...opts, requireSamePeriod: false });
  rates.churn_rate = churnM.status === 'VALID'
    ? { status: 'VALID', rate: churnM.conversion_rate, basis: 'CHURN / ACTIVATED on a matched cohort', metric_ref: churnM.metric_id }
    : { status: churnM.status, rate: null, reason: churnM.reason || null };

  const expansion = expansionRevenue.filter(r => r.amount != null);
  const expansionTotal = expansion.length ? Number(expansion.reduce((s, r) => s + Number(r.amount), 0).toFixed(4)) : null;

  const body = {
    schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'RetentionAssessment',
    counts: Object.fromEntries(['ACTIVATED', 'RETAINED', 'RENEWED', 'UPSELL', 'CROSS_SELL', 'CHURN', 'REPEAT_PURCHASE'].map(s => [s, obsByKey[s] && obsByKey[s].count != null ? obsByKey[s].count : null])),
    rates,
    expansion_revenue: expansionTotal != null ? { amount: expansionTotal, currency: expansion[0] ? expansion[0].currency || null : null, cohort_basis: expansion.every(r => r.cohort) ? 'COHORT_METRIC' : 'UNKNOWN_BASIS', evidence_refs: [...new Set(expansion.flatMap(r => r.evidence_refs || []))].sort() } : { status: 'UNKNOWN' },
    churn_probability: null,
    cohort_basis_preserved: true,
    note: 'retention/expansion rates preserve cohort basis; no churn probability is produced (that needs a validated predictive model)',
    generated_by: 'deterministic:ucdm/funnel_revenue',
  };
  body.retention_id = 'rt_' + sha256Hex(canonicalize({ ...body, retention_id: undefined }));
  return deepFreeze(body);
}

function validateRetention(r) {
  const errors = [];
  if (r.churn_probability !== null) errors.push('no churn probability may be produced');
  if (r.cohort_basis_preserved !== true) errors.push('retention must preserve cohort basis');
  return { valid: errors.length === 0, errors };
}

module.exports = { buildRetention, validateRetention };
