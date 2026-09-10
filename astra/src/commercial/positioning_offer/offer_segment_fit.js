'use strict';
// [ASTRA-11I §R] Deterministic OfferSegmentFit. Insufficient evidence -> UNKNOWN. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const FIT_DIMENSIONS = Object.freeze(['problem_severity', 'desired_outcome', 'urgency', 'budget_signal', 'solution_fit', 'implementation_fit', 'proof_fit', 'friction_resolution', 'jtbd_fit']);
const DEFAULT_WEIGHTS = Object.freeze({ problem_severity: 0.16, desired_outcome: 0.14, urgency: 0.1, budget_signal: 0.12, solution_fit: 0.14, implementation_fit: 0.08, proof_fit: 0.12, friction_resolution: 0.08, jtbd_fit: 0.06 });
const BANDS = Object.freeze(['STRONG', 'GOOD', 'WEAK', 'POOR', 'UNKNOWN']);
const MIN_COVERAGE = 0.5;

function assessOfferSegmentFit({ segment_id, dimension_scores = {}, weights = null }) {
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
  } else reason_codes.push('INSUFFICIENT_EVIDENCE');
  for (const d of missing) reason_codes.push('MISSING_' + d.toUpperCase());

  const body = {
    schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'OfferSegmentFit',
    segment_id, dimension_scores: scores, weights: W, weights_version: weights ? 'custom' : 'cm-offer-segment-fit-w1',
    covered_dimensions: covered.sort(), missing_dimensions: missing.sort(),
    coverage_weight_mass: Number(wmass.toFixed(4)), total_score: total, fit_band: band,
    reason_codes: [...new Set(reason_codes)].sort(),
    generated_by: 'deterministic:ucdm/positioning_offer',
  };
  body.fit_id = 'osf_' + sha256Hex(canonicalize({ ...body, fit_id: undefined }));
  return deepFreeze(body);
}

function validateOfferSegmentFit(f) {
  const errors = [];
  if (!BANDS.includes(f.fit_band)) errors.push(`bad fit band "${f.fit_band}"`);
  if (f.coverage_weight_mass < MIN_COVERAGE && f.total_score != null) errors.push('total_score must be null when evidence insufficient');
  return { valid: errors.length === 0, errors };
}

module.exports = { FIT_DIMENSIONS, DEFAULT_WEIGHTS, BANDS, MIN_COVERAGE, assessOfferSegmentFit, validateOfferSegmentFit };
