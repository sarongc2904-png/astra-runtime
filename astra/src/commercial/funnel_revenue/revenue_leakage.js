'use strict';
// [ASTRA-11J §AA §AB] RevenueLeakageCandidate + OpportunityValue. ASTRA does NOT fabricate a
// "you are losing $X" figure by multiplying arbitrary averages. Any monetary figure carries
// its methodology, assumptions, input refs, coverage and a status
// (OBSERVED / COMPUTED / MODELLED / UNKNOWN). No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const LEAKAGE_SOURCES = Object.freeze([
  'LOST_LEADS', 'NO_CONTACT', 'QUALIFICATION_LOSS', 'BOOKING_LOSS', 'NO_SHOWS', 'SALES_LOSS',
  'CHECKOUT_ABANDONMENT', 'REFUNDS', 'CHURN', 'MISSED_EXPANSION',
]);
const VALUE_STATUS = Object.freeze(['OBSERVED', 'COMPUTED', 'MODELLED', 'UNKNOWN']);

// buildRevenueLeakage({ transitions, valueAssumptions, refunds, churn })
//   valueAssumptions: { <SOURCE>: { value_per_unit, currency, status:'MODELLED'|'USER_PROVIDED', input_refs } }
function buildRevenueLeakage({ transitions = [], valueAssumptions = {}, refunds = null, churnUnits = null }) {
  const out = [];
  const SRC_BY_TRANSITION = {
    'LEAD__CONTACTED': 'NO_CONTACT', 'CONTACTED__QUALIFIED': 'QUALIFICATION_LOSS',
    'QUALIFIED__BOOKED': 'BOOKING_LOSS', 'BOOKED__ATTENDED': 'NO_SHOWS',
    'ATTENDED__SOLD': 'SALES_LOSS', 'ATTENDED__PURCHASE': 'SALES_LOSS',
    'CHECKOUT__PURCHASE': 'CHECKOUT_ABANDONMENT', 'PROPOSAL__WON': 'SALES_LOSS',
    'CONVERSATION__QUALIFIED': 'QUALIFICATION_LOSS',
  };
  for (const t of transitions) {
    if (t.status !== 'VALID' || t.drop_off_count == null || t.drop_off_count <= 0) continue;
    const src = SRC_BY_TRANSITION[`${t.from_stage}__${t.to_stage}`];
    if (!src) continue;
    const va = valueAssumptions[src];
    let value_estimate;
    if (!va || va.value_per_unit == null) {
      value_estimate = { status: 'UNKNOWN', reason: 'NO_VALUE_ASSUMPTION_SUPPLIED', note: 'lost units are known; their value is not — no $ figure produced' };
    } else {
      value_estimate = {
        status: VALUE_STATUS.includes(String(va.status).toUpperCase()) ? String(va.status).toUpperCase() : 'MODELLED',
        amount: Number((t.drop_off_count * Number(va.value_per_unit)).toFixed(2)),
        currency: va.currency || null,
        methodology: 'lost_units * supplied value_per_unit',
        assumptions: { value_per_unit: Number(va.value_per_unit), lost_units: t.drop_off_count },
        input_refs: [...new Set(va.input_refs || [])].sort(),
      };
    }
    out.push(mkLeak({ source: src, transition: { from: t.from_stage, to: t.to_stage }, lost_units: t.drop_off_count, evidence_refs: t.evidence_refs, value_estimate }));
  }
  if (refunds && refunds.amount != null) out.push(mkLeak({ source: 'REFUNDS', transition: null, lost_units: null, evidence_refs: refunds.evidence_refs || [], value_estimate: { status: 'OBSERVED', amount: Number(refunds.amount), currency: refunds.currency || null, methodology: 'observed refund total', input_refs: refunds.evidence_refs || [] } }));
  if (churnUnits && churnUnits.count != null) {
    const va = valueAssumptions.CHURN;
    const value_estimate = va && va.value_per_unit != null
      ? { status: 'MODELLED', amount: Number((churnUnits.count * Number(va.value_per_unit)).toFixed(2)), currency: va.currency || null, methodology: 'churned_units * supplied value_per_unit', assumptions: { value_per_unit: Number(va.value_per_unit), churned_units: churnUnits.count }, input_refs: va.input_refs || [] }
      : { status: 'UNKNOWN', reason: 'NO_VALUE_ASSUMPTION_SUPPLIED' };
    out.push(mkLeak({ source: 'CHURN', transition: null, lost_units: churnUnits.count, evidence_refs: churnUnits.evidence_refs || [], value_estimate }));
  }
  return out;
}

function mkLeak(x) {
  const body = {
    schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'RevenueLeakageCandidate',
    leakage_source: x.source, transition: x.transition, lost_units: x.lost_units,
    value_estimate: x.value_estimate, evidence_refs: [...new Set(x.evidence_refs || [])].sort(),
    is_fact: false, fabricated: false,
    note: x.value_estimate.status === 'UNKNOWN' ? 'lost units observed; monetary leakage UNKNOWN (no value assumption)' : `monetary leakage is ${x.value_estimate.status} — an explicit ${x.value_estimate.status === 'MODELLED' ? 'model' : 'figure'}, not a fact`,
    generated_by: 'deterministic:ucdm/funnel_revenue',
  };
  body.leakage_id = 'rlk_' + sha256Hex(canonicalize({ ...body, leakage_id: undefined }));
  return deepFreeze(body);
}

// buildOpportunityValue — a single explicit "value at stake" figure with full methodology
function buildOpportunityValue({ leakages = [], businessInput = {} }) {
  const withValue = leakages.filter(l => l.value_estimate.status !== 'UNKNOWN' && l.value_estimate.amount != null);
  if (withValue.length === 0) {
    return deepFreeze({ schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'OpportunityValue', status: 'UNKNOWN', total: null, note: 'no leakage carries a supplied value assumption — no aggregate value at stake is produced', methodology: null, opportunity_value_id: 'ov_' + sha256Hex(canonicalize({ s: 'UNKNOWN' })) });
  }
  const currencies = [...new Set(withValue.map(l => l.value_estimate.currency).filter(Boolean))];
  const allModelled = withValue.every(l => l.value_estimate.status === 'MODELLED');
  const body = {
    schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'OpportunityValue',
    status: allModelled ? 'MODELLED' : 'COMPUTED',
    total: currencies.length <= 1 ? Number(withValue.reduce((s, l) => s + l.value_estimate.amount, 0).toFixed(2)) : null,
    currency: currencies.length === 1 ? currencies[0] : null,
    per_source: withValue.map(l => ({ source: l.leakage_source, amount: l.value_estimate.amount, status: l.value_estimate.status })),
    methodology: 'sum of per-source leakage estimates, each = lost_units * supplied value_per_unit',
    assumptions: withValue.map(l => l.value_estimate.assumptions).filter(Boolean),
    input_refs: [...new Set(withValue.flatMap(l => l.value_estimate.input_refs || []))].sort(),
    coverage: { sources_with_value: withValue.length, sources_total: leakages.length },
    mixed_currency: currencies.length > 1,
    note: currencies.length > 1 ? 'multiple currencies — NOT summed' : 'an explicit modelled/computed figure with full methodology — NOT a fact',
    generated_by: 'deterministic:ucdm/funnel_revenue',
  };
  body.opportunity_value_id = 'ov_' + sha256Hex(canonicalize({ ...body, opportunity_value_id: undefined }));
  return deepFreeze(body);
}

function validateLeakage(l) {
  const errors = [];
  if (!LEAKAGE_SOURCES.includes(l.leakage_source)) errors.push(`bad leakage_source "${l.leakage_source}"`);
  if (l.is_fact !== false || l.fabricated !== false) errors.push('a leakage candidate is analytical, never a fabricated fact');
  const v = l.value_estimate;
  if (v.status !== 'UNKNOWN') {
    if (v.amount == null) errors.push('a non-UNKNOWN leakage value needs an amount');
    if (!v.methodology) errors.push('a leakage value needs a methodology');
    if (['MODELLED', 'COMPUTED'].includes(v.status) && !v.assumptions) errors.push('a modelled/computed leakage value needs assumptions');
  }
  return { valid: errors.length === 0, errors };
}
function validateOpportunityValue(o) {
  const errors = [];
  if (!['MODELLED', 'COMPUTED', 'OBSERVED', 'UNKNOWN'].includes(o.status)) errors.push(`bad opportunity value status "${o.status}"`);
  if (o.status !== 'UNKNOWN' && !o.methodology) errors.push('opportunity value needs a methodology');
  if (o.mixed_currency && o.total != null) errors.push('mixed-currency opportunity value must not be summed');
  return { valid: errors.length === 0, errors };
}

module.exports = { LEAKAGE_SOURCES, VALUE_STATUS, buildRevenueLeakage, buildOpportunityValue, validateLeakage, validateOpportunityValue };
