'use strict';
// [ASTRA-11B] Confidence Model (ASTRA-11B section F).
// Confidence is COMPUTED deterministically from measurable signals. The LLM never invents
// a confidence number. This module returns a structured ConfidenceAssessment:
//   { score (0..1), band, reason_codes[], signals, weights_version, produced_by }
// LLM prose "explaining" confidence lives in a SEPARATE field on the entity and is never
// read here.
// Pure function. No I/O, no LLM, no network.
const { canonicalize, sha256Hex } = require('./canonical');

const DEFAULT_WEIGHTS = Object.freeze({
  evidence_quantity: 0.25,   // how many independent evidence items
  source_diversity: 0.20,    // how many distinct sources / source types
  recency: 0.15,             // how fresh the newest supporting evidence is
  coverage: 0.20,            // fraction of the claim's sub-aspects that have evidence
  agreement: 0.15,           // agreement vs conflict among evidence items
  data_quality: 0.05,        // caller-supplied quality score for the inputs
});
const WEIGHTS_VERSION = 'ucdm-confidence-w1';

const BANDS = Object.freeze([
  { band: 'VERY_LOW', min: 0.0 },
  { band: 'LOW', min: 0.2 },
  { band: 'MEDIUM', min: 0.45 },
  { band: 'HIGH', min: 0.7 },
  { band: 'VERY_HIGH', min: 0.9 },
]);

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

// Normalize raw signals (all expected pre-normalized to 0..1 by the caller, but we clamp
// and apply saturating curves for the count-like ones so the function is total).
function normalizeSignals(raw) {
  const s = {
    // count-like signals saturate: 0 items -> 0, ~5 -> ~0.8, many -> ~1
    evidence_quantity: raw.evidence_count != null ? 1 - Math.exp(-Number(raw.evidence_count) / 4) : clamp01(raw.evidence_quantity),
    source_diversity: raw.distinct_sources != null ? 1 - Math.exp(-Number(raw.distinct_sources) / 3) : clamp01(raw.source_diversity),
    recency: raw.newest_evidence_age_days != null ? clamp01(1 - Number(raw.newest_evidence_age_days) / 365) : clamp01(raw.recency),
    coverage: clamp01(raw.coverage != null ? raw.coverage : (raw.aspects_with_evidence != null && raw.aspects_total ? raw.aspects_with_evidence / raw.aspects_total : 0)),
    agreement: raw.agreement != null ? clamp01(raw.agreement) : (raw.agree_count != null && (raw.agree_count + (raw.conflict_count || 0)) > 0 ? raw.agree_count / (raw.agree_count + raw.conflict_count) : 0.5),
    data_quality: clamp01(raw.data_quality != null ? raw.data_quality : 0.5),
  };
  return s;
}

function reasonCodes(signals, hasConflict) {
  const codes = [];
  if (signals.evidence_quantity < 0.3) codes.push('LOW_EVIDENCE_QUANTITY');
  if (signals.source_diversity < 0.3) codes.push('SINGLE_SOURCE_OR_TYPE');
  if (signals.recency < 0.3) codes.push('STALE_EVIDENCE');
  if (signals.coverage < 0.5) codes.push('PARTIAL_COVERAGE');
  if (signals.agreement < 0.5 || hasConflict) codes.push('EVIDENCE_CONFLICT');
  if (signals.data_quality < 0.4) codes.push('LOW_DATA_QUALITY');
  if (codes.length === 0) codes.push('WELL_SUPPORTED');
  return codes;
}

function bandFor(score) {
  let b = BANDS[0].band;
  for (const x of BANDS) if (score >= x.min) b = x.band;
  return b;
}

// assess(rawSignals, opts) -> frozen ConfidenceAssessment. Deterministic: same signals in,
// same assessment out (verified by test 14).
function assess(rawSignals = {}, opts = {}) {
  const weights = opts.weights || DEFAULT_WEIGHTS;
  const signals = normalizeSignals(rawSignals);
  let score = 0;
  for (const k of Object.keys(DEFAULT_WEIGHTS)) score += (signals[k] || 0) * (weights[k] || 0);
  score = clamp01(Number(score.toFixed(6)));
  const hasConflict = !!rawSignals.conflict_count && rawSignals.conflict_count > 0;
  const assessment = {
    kind: 'ConfidenceAssessment',
    score,
    band: bandFor(score),
    reason_codes: reasonCodes(signals, hasConflict),
    signals,
    weights_version: opts.weights ? (opts.weights_version || 'custom') : WEIGHTS_VERSION,
    produced_by: 'deterministic:ucdm/confidence',
  };
  assessment.content_hash = sha256Hex(canonicalize({ ...assessment, content_hash: undefined }));
  return Object.freeze(assessment);
}

module.exports = { assess, bandFor, normalizeSignals, DEFAULT_WEIGHTS, WEIGHTS_VERSION, BANDS };
