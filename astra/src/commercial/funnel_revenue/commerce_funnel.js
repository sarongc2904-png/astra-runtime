'use strict';
// [ASTRA-11J §U] Ecommerce / webinar funnels. NO fixed universal funnel — the caller declares
// which shape applies. Reuses scope-validated transition math. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { computeTransition } = require('./transition_metrics');

const SHAPES = Object.freeze({
  ECOMMERCE: ['VISIT', 'PRODUCT_VIEW', 'ADD_TO_CART', 'CHECKOUT', 'PURCHASE'],
  WEBINAR: ['LEAD', 'WEBINAR', 'OFFER', 'CHECKOUT', 'PURCHASE', 'UPSELL'],
});
const RATE_NAMES = Object.freeze({
  'ADD_TO_CART>CHECKOUT': 'checkout_start_rate',
  'CHECKOUT>PURCHASE': 'checkout_completion_rate',
  'VISIT>PURCHASE': 'visit_to_purchase_rate',
  'LEAD>WEBINAR': 'webinar_show_rate',
  'WEBINAR>OFFER': 'offer_view_rate',
  'OFFER>PURCHASE': 'offer_conversion_rate',
  'PURCHASE>UPSELL': 'upsell_take_rate',
});

function buildCommerceFunnel({ shape = 'ECOMMERCE', obsByKey = {}, opts = {} }) {
  const stages = SHAPES[String(shape).toUpperCase()] || SHAPES.ECOMMERCE;
  const rates = {};
  for (let i = 0; i < stages.length - 1; i++) {
    const a = stages[i], b = stages[i + 1];
    const m = computeTransition(obsByKey[a] || null, obsByKey[b] || null, opts);
    rates[`${a}__${b}`] = { name: RATE_NAMES[`${a}>${b}`] || `${a.toLowerCase()}_to_${b.toLowerCase()}_rate`, status: m.status, rate: m.conversion_rate, reason: m.reason || null, metric_ref: m.metric_id };
  }
  // key spanning rates
  for (const [span, nm] of [[['VISIT', 'PURCHASE'], 'visit_to_purchase_rate'], [['ADD_TO_CART', 'CHECKOUT'], 'checkout_start_rate'], [['OFFER', 'PURCHASE'], 'offer_conversion_rate']]) {
    if (obsByKey[span[0]] && obsByKey[span[1]]) {
      const m = computeTransition(obsByKey[span[0]], obsByKey[span[1]], opts);
      rates[`${span[0]}__${span[1]}`] = { name: nm, status: m.status, rate: m.conversion_rate, reason: m.reason || null, metric_ref: m.metric_id };
    }
  }
  const present = stages.filter(s => obsByKey[s] && obsByKey[s].count != null);
  const body = {
    schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'CommerceFunnel',
    shape: String(shape).toUpperCase(), stages, stages_present: present,
    counts: Object.fromEntries(stages.map(s => [s, obsByKey[s] && obsByKey[s].count != null ? obsByKey[s].count : null])),
    rates, applicable: present.length >= 2,
    note: 'no fixed universal funnel — this shape was declared by the caller',
    generated_by: 'deterministic:ucdm/funnel_revenue',
  };
  body.commerce_funnel_id = 'cmf_' + sha256Hex(canonicalize({ ...body, commerce_funnel_id: undefined }));
  return deepFreeze(body);
}

module.exports = { SHAPES, buildCommerceFunnel };
