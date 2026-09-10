'use strict';
// [ASTRA-11G §Q] Deterministic, configurable ICP fit assessment. When evidence coverage is
// insufficient, NO precise score is produced — band is UNKNOWN. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const FIT_DIMENSIONS = Object.freeze(['problem_fit', 'urgency_fit', 'budget_fit', 'solution_fit', 'geographic_fit', 'implementation_fit', 'maturity_fit', 'strategic_fit']);
const DEFAULT_FIT_WEIGHTS = Object.freeze({ problem_fit: 0.22, urgency_fit: 0.14, budget_fit: 0.14, solution_fit: 0.18, geographic_fit: 0.08, implementation_fit: 0.10, maturity_fit: 0.06, strategic_fit: 0.08 });
const FIT_WEIGHTS_VERSION = 'cm-icp-fit-w1';
const FIT_BANDS = Object.freeze(['IDEAL', 'GOOD', 'MARGINAL', 'POOR', 'UNKNOWN']);
const MIN_COVERAGE_FOR_SCORE = 0.5;

// Each dimension score is a number in [0,1] or null (not assessable). Callers pass explicit
// per-dimension scores (from ICP KNOWN fields + attribute evidence); this module does not
// invent them.
function assessIcpFit({ dimension_scores = {}, weights = null, reason_hints = [] } = {}) {
  const W = weights || DEFAULT_FIT_WEIGHTS;
  const scores = {};
  const missing = [];
  for (const d of FIT_DIMENSIONS) {
    const v = dimension_scores[d];
    if (v == null || Number.isNaN(Number(v))) { scores[d] = null; missing.push(d); }
    else scores[d] = clamp01(Number(v));
  }
  const covered = FIT_DIMENSIONS.filter(d => scores[d] != null);
  const coverage = Number((covered.reduce((s, d) => s + (W[d] || 0), 0)).toFixed(4)); // weight mass covered
  const coverageCount = Number((covered.length / FIT_DIMENSIONS.length).toFixed(4));

  let total_score = null, band = 'UNKNOWN';
  const reason_codes = [...reason_hints];
  if (coverage >= MIN_COVERAGE_FOR_SCORE) {
    const wsum = covered.reduce((s, d) => s + (W[d] || 0), 0);
    total_score = Number((covered.reduce((s, d) => s + scores[d] * (W[d] || 0), 0) / wsum).toFixed(4));
    band = total_score >= 0.8 ? 'IDEAL' : total_score >= 0.6 ? 'GOOD' : total_score >= 0.4 ? 'MARGINAL' : 'POOR';
  } else {
    reason_codes.push('INSUFFICIENT_FIT_COVERAGE');
  }
  for (const d of missing) reason_codes.push('MISSING_' + d.toUpperCase());
  if (scores.problem_fit != null && scores.problem_fit < 0.3) reason_codes.push('WEAK_PROBLEM_FIT');
  if (scores.budget_fit != null && scores.budget_fit < 0.3) reason_codes.push('WEAK_BUDGET_FIT');

  const body = {
    schema_version: 'ucdm-customer-model-1.0.0', kind: 'IcpFitAssessment',
    dimension_scores: scores, weights: W, weights_version: weights ? 'custom' : FIT_WEIGHTS_VERSION,
    covered_dimensions: covered.sort(), missing_dimensions: missing.sort(),
    coverage_weight_mass: coverage, coverage_dimension_ratio: coverageCount,
    total_score, fit_band: band,
    reason_codes: [...new Set(reason_codes)].sort(),
    note: total_score == null ? 'evidence coverage below threshold — no precise score produced' : 'deterministic weighted score over covered dimensions only',
    generated_by: 'deterministic:ucdm/customer_model/icp_fit',
  };
  body.fit_id = 'icpf_' + sha256Hex(canonicalize({ ...body, fit_id: undefined }));
  return deepFreeze(body);
}
function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

function validateIcpFit(f) {
  const errors = [];
  if (!FIT_BANDS.includes(f.fit_band)) errors.push(`bad fit band "${f.fit_band}"`);
  if (f.coverage_weight_mass < MIN_COVERAGE_FOR_SCORE && f.total_score != null) errors.push('total_score must be null when coverage is insufficient');
  if (f.total_score != null && (f.total_score < 0 || f.total_score > 1)) errors.push('total_score out of range');
  return { valid: errors.length === 0, errors };
}

module.exports = { FIT_DIMENSIONS, DEFAULT_FIT_WEIGHTS, FIT_WEIGHTS_VERSION, FIT_BANDS, MIN_COVERAGE_FOR_SCORE, assessIcpFit, validateIcpFit };
