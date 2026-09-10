'use strict';
// [ASTRA-11C] The adapter boundary guard (spec §B, §N).
// Provider-specific objects may exist INSIDE the RawSourceEnvelope (raw_payload) and INSIDE
// an adapter. They must DISAPPEAR at the normalization boundary. This module scans a
// candidate provider-neutral object and fails closed on any provider-coupled key or a
// known vendor id-key that leaked through.
// Deterministic. No LLM, no I/O.
const { PROVIDER_COUPLED } = require('../schema/entities'); // reuse the ASTRA-11B lint regex

// Vendor id-key names that must never appear in a normalized structure, even without a
// provider prefix (e.g. a bare `fbclid`, `wamid`, `charge_id`).
const VENDOR_ID_KEYS = /^(fbid|fbclid|fb_[a-z_]+|ad_id|adset_id|adgroup_id|wamid|wa_[a-z_]+|whatsapp_[a-z_]+|charge_id|pi_[a-z_]+|stripe_[a-z_]+|cus_[a-z]+|ga_[a-z_]+|ga4_[a-z_]+|gclid|utm_[a-z]+|hs_[a-z_]+|sfdc_[a-z_]+)$/i;

function scan(obj, path = '$', hits = []) {
  if (obj == null) return hits;
  if (Array.isArray(obj)) { obj.forEach((v, i) => scan(v, `${path}[${i}]`, hits)); return hits; }
  if (typeof obj !== 'object') return hits;
  for (const k of Object.keys(obj)) {
    if (PROVIDER_COUPLED.test(k)) hits.push(`${path}.${k} (provider-coupled key)`);
    else if (VENDOR_ID_KEYS.test(k)) hits.push(`${path}.${k} (vendor id key)`);
    scan(obj[k], `${path}.${k}`, hits);
  }
  return hits;
}

// Returns { neutral, leaks[] }. `raw_payload` / `raw_content` / `metadata` at the TOP level
// of a structure are exempt only when explicitly told (the envelope keeps them on purpose);
// a NormalizedObservation is scanned in full.
function checkProviderNeutral(obj, { exemptKeys = [] } = {}) {
  const shallow = {};
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const k of Object.keys(obj)) if (!exemptKeys.includes(k)) shallow[k] = obj[k];
  }
  const leaks = scan(exemptKeys.length ? shallow : obj);
  return { neutral: leaks.length === 0, leaks };
}

function assertProviderNeutral(obj, opts) {
  const r = checkProviderNeutral(obj, opts);
  if (!r.neutral) throw new Error(`[ASTRA-11C] provider payload leaked past the adapter boundary: ${r.leaks.join('; ')} (fail closed)`);
  return true;
}

module.exports = { checkProviderNeutral, assertProviderNeutral, VENDOR_ID_KEYS };
