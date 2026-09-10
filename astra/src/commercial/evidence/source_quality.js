'use strict';
// [ASTRA-11C] Deterministic source / evidence QUALITY (spec section H).
// Critical distinction (section H): a review is strong evidence that someone SAID a sentence,
// and weak evidence that the sentence is objectively TRUE. This module returns BOTH:
//   attestation  -> confidence the source really contains this text/event
//   veracity_support -> how much this source supports the underlying claim being true
// It does NOT encode "marketing truth". It is separate from ASTRA-11B's ConfidenceAssessment
// (which is about a downstream conclusion).
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const AUTHENTICITY_STATES = Object.freeze(['VERIFIED', 'PLAUSIBLE', 'UNVERIFIED', 'SUSPECT']);

// By source category, a deterministic ceiling on how much the source can support VERACITY
// of a claim it contains. First-party measured data can support truth; third-party opinion
// mostly supports "this was said".
const VERACITY_CEILING = {
  ANALYTICS_EVENT: 0.9, TRANSACTION: 0.9, CRM_RECORD: 0.7, FORM_RESPONSE: 0.6, SURVEY_RESPONSE: 0.6,
  CALL_TRANSCRIPT: 0.5, CONVERSATION: 0.5, MESSAGE: 0.5, DOCUMENT: 0.6, WEB_PAGE: 0.4,
  SEARCH_RESULT: 0.3, REVIEW: 0.25, SOCIAL_POST: 0.2, SOCIAL_COMMENT: 0.2, ADVERTISEMENT: 0.15,
  USER_INPUT: 0.6, OTHER: 0.3,
};

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function band(score) {
  if (score == null) return 'UNKNOWN';
  return score >= 0.8 ? 'HIGH' : score >= 0.55 ? 'MEDIUM' : score >= 0.3 ? 'LOW' : 'VERY_LOW';
}

// assessSourceQuality({ source_category, signals }) -> frozen quality block.
// signals (all 0..1 unless noted, missing -> neutral/absent):
//   completeness, directness, extractability, subject_match, measurement_precision,
//   timestamp_available (bool), recency_band ('FRESH'|'RECENT'|'AGING'|'STALE'|'UNKNOWN'),
//   authenticity_status (AUTHENTICITY_STATES)
function assessSourceQuality({ source_category, signals = {} } = {}) {
  const s = signals;
  const completeness = clamp01(s.completeness != null ? s.completeness : 0.5);
  const directness = clamp01(s.directness != null ? s.directness : 0.5);
  const extractability = clamp01(s.extractability != null ? s.extractability : 0.5);
  const subject_match = clamp01(s.subject_match != null ? s.subject_match : 0.5);
  const precision = clamp01(s.measurement_precision != null ? s.measurement_precision : 0.5);
  const tsAvail = s.timestamp_available === true ? 1 : 0;
  const recencyFactor = { FRESH: 1, RECENT: 0.85, AGING: 0.6, STALE: 0.3, UNKNOWN: 0.5, FUTURE: 0.4 }[s.recency_band || 'UNKNOWN'];
  const auth = s.authenticity_status && AUTHENTICITY_STATES.includes(s.authenticity_status) ? s.authenticity_status : 'UNVERIFIED';
  const authFactor = { VERIFIED: 1, PLAUSIBLE: 0.8, UNVERIFIED: 0.6, SUSPECT: 0.2 }[auth];

  // attestation: are we sure the source really holds this content? completeness +
  // extractability + timestamp availability + authenticity. Not about truth.
  const attestation = Number((clamp01(0.35 * completeness + 0.30 * extractability + 0.15 * tsAvail + 0.20 * authFactor)).toFixed(6));

  // veracity_support: capped by category ceiling, then scaled by directness, subject match,
  // measurement precision, recency, authenticity.
  const ceiling = VERACITY_CEILING[source_category] != null ? VERACITY_CEILING[source_category] : 0.3;
  const veracity_support = Number((clamp01(ceiling * (0.30 * directness + 0.25 * subject_match + 0.20 * precision + 0.15 * recencyFactor + 0.10 * authFactor) / 1)).toFixed(6));

  const reason_codes = [];
  if (completeness < 0.4) reason_codes.push('INCOMPLETE_SOURCE');
  if (extractability < 0.4) reason_codes.push('LOW_EXTRACTABILITY');
  if (!tsAvail) reason_codes.push('NO_TIMESTAMP');
  if (auth === 'SUSPECT') reason_codes.push('AUTHENTICITY_SUSPECT');
  if (auth === 'UNVERIFIED') reason_codes.push('AUTHENTICITY_UNVERIFIED');
  if (ceiling <= 0.3) reason_codes.push('OPINION_SOURCE_LIMITS_VERACITY');
  if (directness < 0.4) reason_codes.push('INDIRECT_EVIDENCE');
  if (reason_codes.length === 0) reason_codes.push('OK');

  const q = {
    source_category: source_category || null,
    attestation, attestation_band: band(attestation),
    veracity_support, veracity_band: band(veracity_support),
    authenticity_status: auth,
    reason_codes,
    signals: { completeness, directness, extractability, subject_match, measurement_precision: precision, timestamp_available: !!s.timestamp_available, recency_band: s.recency_band || 'UNKNOWN' },
    produced_by: 'deterministic:ucdm/source_quality',
    note: 'attestation = confidence the source contains this; veracity_support = how much it supports the claim being objectively true. They are not the same.',
  };
  q.content_hash = 'sq_' + sha256Hex(canonicalize({ ...q, content_hash: undefined }));
  return deepFreeze(q);
}

module.exports = { AUTHENTICITY_STATES, VERACITY_CEILING, assessSourceQuality };
