'use strict';
// [ASTRA-11C] Temporal model (spec section J).
// event / publication / capture / ingestion time are NOT interchangeable.
// Freshness is computed against a CALLER-PROVIDED reference time so tests stay stable —
// this module NEVER reads Date.now().
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const TIME_KINDS = Object.freeze(['event_time', 'publication_time', 'capture_time', 'ingestion_time']);

function parseOrNull(x) {
  if (x == null || x === '') return null;
  const t = Date.parse(x);
  return Number.isNaN(t) ? NaN : t;
}

// makeTemporal({ event_time, publication_time, capture_time, ingestion_time, observation_window })
// Fails closed on an unparseable timestamp (section N "invalid timestamps").
function makeTemporal(input = {}) {
  const errors = [];
  const out = { observation_window: input.observation_window != null ? input.observation_window : null };
  for (const k of TIME_KINDS) {
    const p = parseOrNull(input[k]);
    if (Number.isNaN(p)) errors.push(`invalid ${k}: ${input[k]}`);
    out[k] = input[k] != null ? String(input[k]) : null;
  }
  if (out.observation_window) {
    const s = parseOrNull(out.observation_window.start), e = parseOrNull(out.observation_window.end);
    if (Number.isNaN(s) || Number.isNaN(e)) errors.push('invalid observation_window bounds');
    else if (s != null && e != null && s > e) errors.push('observation_window.start after end');
  }
  if (errors.length) throw new Error(`[ASTRA-11C] makeTemporal: ${errors.join(' | ')}`);
  out.content_hash = 'tmp_' + sha256Hex(canonicalize({ ...out, content_hash: undefined }));
  return deepFreeze(out);
}

// freshness(temporal, referenceTimeISO) -> deterministic ages + a band.
// "best known" event time preference: event_time -> publication_time -> capture_time.
function freshness(temporal, referenceTimeISO) {
  const ref = parseOrNull(referenceTimeISO);
  if (ref == null || Number.isNaN(ref)) throw new Error('[ASTRA-11C] freshness: a valid referenceTime is required (no implicit clock)');
  const ages = {};
  for (const k of TIME_KINDS) {
    const p = parseOrNull(temporal[k]);
    ages[k] = (p == null || Number.isNaN(p)) ? null : Number(((ref - p) / 86400000).toFixed(6));
  }
  const best = ages.event_time != null ? ages.event_time
    : ages.publication_time != null ? ages.publication_time
    : ages.capture_time != null ? ages.capture_time
    : ages.ingestion_time;
  let band = 'UNKNOWN';
  if (best != null) {
    if (best < 0) band = 'FUTURE';               // reference precedes the timestamp -> surfaced, not silently fixed
    else if (best <= 30) band = 'FRESH';
    else if (best <= 90) band = 'RECENT';
    else if (best <= 365) band = 'AGING';
    else band = 'STALE';
  }
  return { reference_time: referenceTimeISO, age_days_by_kind: ages, effective_age_days: best, freshness_band: band };
}

module.exports = { TIME_KINDS, makeTemporal, freshness };
