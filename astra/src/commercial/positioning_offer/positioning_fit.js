'use strict';
// [ASTRA-11I §G] PositioningFitAssessment. Deterministic weighted score, configurable
// weights. Score / band only where evidence coverage is sufficient; otherwise UNKNOWN.
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const FIT_DIMENSIONS = Object.freeze([
  'segment_relevance', 'problem_fit', 'jtbd_fit', 'desired_outcome_fit', 'objection_compatibility',
  'proof_availability', 'business_capability_fit', 'competitive_distinctiveness', 'evidence_coverage',
]);
const DEFAULT_WEIGHTS = Object.freeze({
  segment_relevance: 0.16, problem_fit: 0.16, jtbd_fit: 0.12, desired_outcome_fit: 0.12,
  objection_compatibility: 0.08, proof_availability: 0.1, business_capability_fit: 0.12,
  competitive_distinctiveness: 0.08, evidence_coverage: 0.06,
});
const FIT_WEIGHTS_VERSION = 'cm-positioning-fit-w1';
const FIT_BANDS = Object.freeze(['STRONG', 'GOOD', 'WEAK', 'POOR', 'UNKNOWN']);
const MIN_COVERAGE = 0.5;

function assessPositioningFit({ dimension_scores = {}, weights = null } = {}) {
  const W = weights || DEFAULT_WEIGHTS;
  const scores = {}; const missing = [];
  for (const d of FIT_DIMENSIONS) {
    const v = dimension_scores[d];
    if (v == null || Number.isNaN(Number(v))) { scores[d] = null; missing.push(d); }
    else scores[d] = Math.max(0, Math.min(1, Number(v)));
  }
  const covered = FIT_DIMENSIONS.filter(d => scores[d] != null);
  const wmass = covered.reduce((s, d) => s + (W[d] || 0), 0);
  let total = null, band = 'UNKNOWN';
  const reason_codes = [];
  if (wmass >= MIN_COVERAGE) {
    total = Number((covered.reduce((s, d) => s + scores[d] * (W[d] || 0), 0) / covered.reduce((s, d) => s + (W[d] || 0), 0)).toFixed(4));
    band = total >= 0.78 ? 'STRONG' : total >= 0.58 ? 'GOOD' : total >= 0.4 ? 'WEAK' : 'POOR';
  } else reason_codes.push('INSUFFICIENT_FIT_COVERAGE');
  for (const d of missing) reason_codes.push('MISSING_' + d.toUpperCase());

  const body = {
    schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'PositioningFitAssessment',
    dimension_scores: scores, weights: W, weights_version: weights ? 'custom' : FIT_WEIGHTS_VERSION,
    covered_dimensions: covered.sort(), missing_dimensions: missing.sort(),
    coverage_weight_mass: Number(wmass.toFixed(4)),
    total_score: total, fit_band: band, reason_codes: [...new Set(reason_codes)].sort(),
    generated_by: 'deterministic:ucdm/positioning_offer',
  };
  body.fit_id = 'pf_' + sha256Hex(canonicalize({ ...body, fit_id: undefined }));
  return deepFreeze(body);
}

function validatePositioningFit(f) {
  const errors = [];
  if (!FIT_BANDS.includes(f.fit_band)) errors.push(`bad fit band "${f.fit_band}"`);
  if (f.coverage_weight_mass < MIN_COVERAGE && f.total_score != null) errors.push('total_score must be null when coverage insufficient');
  return { valid: errors.length === 0, errors };
}

module.exports = { FIT_DIMENSIONS, DEFAULT_WEIGHTS, FIT_WEIGHTS_VERSION, FIT_BANDS, MIN_COVERAGE, assessPositioningFit, validatePositioningFit };
