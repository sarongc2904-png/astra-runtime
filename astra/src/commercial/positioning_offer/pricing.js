'use strict';
// [ASTRA-11I §O] Pricing intelligence. Reuses ASTRA-11D pricing evidence + business-supplied
// price. NO FX conversion unless supplied. NO invented willingness-to-pay. NO "optimal price"
// without validated data. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

function buildPricingIntelligence({ researchResult = null, businessInput = {} }) {
  const obsPrices = ((researchResult && researchResult.pricing_observations) || []).map(p => ({
    amount: p.amount != null ? Number(p.amount) : (p.numeric && p.numeric.value) || null,
    currency: p.currency || (p.numeric && p.numeric.currency) || null,
    competitor_ref: p.competitor_ref || p.subject_ref || null,
    evidence_refs: p.evidence_refs || [],
  })).filter(p => p.amount != null);
  const rawStats = (researchResult && researchResult.pricing_stats) || null;
  // ASTRA-11D pricing_stats is per-currency; take the first currency block deterministically.
  let stats = null;
  if (rawStats && rawStats.by_currency) {
    const ccy = Object.keys(rawStats.by_currency).sort()[0];
    if (ccy) { const b = rawStats.by_currency[ccy]; stats = { min: b.min, max: b.max, median: b.median, n: b.sample_size, currency: ccy }; }
  } else if (rawStats && rawStats.min != null) stats = rawStats;

  const supplied = (businessInput.supplied_offer && businessInput.supplied_offer.pricing) || {};
  const currencies = [...new Set(obsPrices.map(p => p.currency).filter(Boolean).concat(supplied.currency ? [supplied.currency] : []))];

  const body = {
    schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'PricingIntelligence',
    observed_competitor_prices: obsPrices,
    observed_price_stats: stats ? { min: stats.min, max: stats.max, median: stats.median, n: stats.n, currency: stats.currency || null } : null,
    own_supplied_price: supplied.amount != null ? { amount: Number(supplied.amount), currency: supplied.currency || null, source_class: 'USER_PROVIDED' } : { status: 'UNKNOWN' },
    price_range: supplied.range ? { low: supplied.range.low, high: supplied.range.high, currency: supplied.currency || null, source_class: 'USER_PROVIDED' } : (stats ? { low: stats.min, high: stats.max, currency: stats.currency || null, source_class: 'OBSERVED_COMPETITOR' } : { status: 'UNKNOWN' }),
    payment_structure: supplied.payment_terms ? { terms: String(supplied.payment_terms), source_class: 'USER_PROVIDED' } : { status: 'UNKNOWN' },
    financing: supplied.financing ? { detail: String(supplied.financing), source_class: 'USER_PROVIDED' } : { status: 'UNKNOWN' },
    discount: supplied.discount ? { detail: String(supplied.discount), source_class: 'USER_PROVIDED' } : { status: 'UNKNOWN' },
    currencies_present: currencies.sort(),
    fx_applied: false,
    fx_note: currencies.length > 1 ? 'multiple currencies present — NOT converted (no FX unless supplied)' : null,
    willingness_to_pay: 'NOT_ESTIMATED',
    optimal_price: 'NOT_ESTIMATED',
    price_conflict: detectPriceConflict(obsPrices),
    note: 'observed competitor prices + business-supplied price only; no WTP, no optimal price, no FX',
    generated_by: 'deterministic:ucdm/positioning_offer',
  };
  body.pricing_id = 'pr_' + sha256Hex(canonicalize({ ...body, pricing_id: undefined }));
  return deepFreeze(body);
}

function detectPriceConflict(prices) {
  const byCcy = {};
  for (const p of prices) (byCcy[p.currency || 'UNKNOWN'] = byCcy[p.currency || 'UNKNOWN'] || []).push(p.amount);
  for (const [ccy, amts] of Object.entries(byCcy)) {
    if (amts.length >= 2) {
      const min = Math.min(...amts), max = Math.max(...amts);
      if (max >= min * 2) return { status: 'WIDE_PRICE_SPREAD', currency: ccy, min, max, note: 'observed competitor prices vary >=2x — not reconciled' };
    }
  }
  return { status: 'NONE' };
}

function validatePricing(p) {
  const errors = [];
  if (p.willingness_to_pay !== 'NOT_ESTIMATED') errors.push('willingness-to-pay must never be estimated');
  if (p.optimal_price !== 'NOT_ESTIMATED') errors.push('optimal price must never be estimated');
  if (p.fx_applied !== false) errors.push('no FX conversion is applied');
  if (p.own_supplied_price.status !== 'UNKNOWN' && p.own_supplied_price.source_class !== 'USER_PROVIDED') errors.push('own price may only be USER_PROVIDED');
  return { valid: errors.length === 0, errors };
}

module.exports = { buildPricingIntelligence, validatePricing };
