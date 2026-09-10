'use strict';
// [ASTRA-11J §T] Local-service booking funnel: CONVERSATION -> QUALIFIED -> BOOKED ->
// ATTENDED -> SOLD. Named rates: qualification / booking / show / close / conversation-to-sale.
// Every rate reuses the scope-validated transition math. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { computeTransition } = require('./transition_metrics');

const STAGES = ['CONVERSATION', 'QUALIFIED', 'BOOKED', 'ATTENDED', 'SOLD'];
const RATE_NAMES = Object.freeze({
  'CONVERSATION>QUALIFIED': 'qualification_rate',
  'QUALIFIED>BOOKED': 'booking_rate',
  'BOOKED>ATTENDED': 'show_rate',
  'ATTENDED>SOLD': 'close_rate',
  'CONVERSATION>SOLD': 'conversation_to_sale_rate',
});

function buildBookingFunnel({ obsByKey = {}, opts = {} }) {
  const rates = {};
  const pairs = [['CONVERSATION', 'QUALIFIED'], ['QUALIFIED', 'BOOKED'], ['BOOKED', 'ATTENDED'], ['ATTENDED', 'SOLD'], ['CONVERSATION', 'SOLD']];
  for (const [a, b] of pairs) {
    const name = RATE_NAMES[`${a}>${b}`];
    const m = computeTransition(obsByKey[a] || null, obsByKey[b] || null, opts);
    rates[name] = { status: m.status, rate: m.conversion_rate, from: a, to: b, reason: m.reason || null, denominator_note: m.denominator_note, metric_ref: m.metric_id };
  }
  const present = STAGES.filter(s => obsByKey[s] && obsByKey[s].count != null);
  const body = {
    schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'BookingFunnel',
    stages_present: present,
    counts: Object.fromEntries(STAGES.map(s => [s, obsByKey[s] && obsByKey[s].count != null ? obsByKey[s].count : null])),
    rates,
    applicable: present.length >= 2,
    note: 'a booking funnel rate is only computed when both endpoints share scope; otherwise UNKNOWN',
    generated_by: 'deterministic:ucdm/funnel_revenue',
  };
  body.booking_funnel_id = 'bkf_' + sha256Hex(canonicalize({ ...body, booking_funnel_id: undefined }));
  return deepFreeze(body);
}

function validateBookingFunnel(f) {
  const errors = [];
  for (const [name, r] of Object.entries(f.rates)) {
    if (r.status === 'VALID' && (r.rate == null || r.rate < 0)) errors.push(`${name} VALID without a rate`);
    if (r.status !== 'VALID' && r.rate != null) errors.push(`${name} non-VALID but carries a rate`);
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { STAGES, RATE_NAMES, buildBookingFunnel, validateBookingFunnel };
