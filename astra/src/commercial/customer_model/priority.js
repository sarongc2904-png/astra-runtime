'use strict';
// [ASTRA-11G §S] SegmentPriority. Configurable deterministic scoring. Priority is ANALYTICAL
// ONLY — it never targets a production campaign and never triggers autonomous action.
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const PRIORITY_INPUTS = Object.freeze(['fit', 'attractiveness', 'confidence', 'evidence_coverage', 'strategic_relevance', 'accessibility']);
const DEFAULT_PRIORITY_WEIGHTS = Object.freeze({ fit: 0.28, attractiveness: 0.28, confidence: 0.14, evidence_coverage: 0.14, strategic_relevance: 0.10, accessibility: 0.06 });
const PRIORITY_WEIGHTS_VERSION = 'cm-priority-w1';
const PRIORITY_BANDS = Object.freeze(['P1', 'P2', 'P3', 'P4', 'UNRANKED']);

// assessPriority({ segment, fit, attractiveness, businessInput, weights })
function assessPriority({ segment, fit = null, attractiveness = null, businessInput = {}, weights = null } = {}) {
  const W = weights || DEFAULT_PRIORITY_WEIGHTS;
  const bi = (businessInput.priority_inputs && businessInput.priority_inputs[segment.segment_id]) || {};
  const signals = {
    fit: fit && fit.total_score != null ? fit.total_score : null,
    attractiveness: attractiveness && attractiveness.attractiveness_score != null ? attractiveness.attractiveness_score : null,
    confidence: segment.confidence ? segment.confidence.score : null,
    evidence_coverage: evidenceCoverage(segment),
    strategic_relevance: num(bi.strategic_relevance),
    accessibility: num(bi.accessibility),
  };
  const covered = PRIORITY_INPUTS.filter(k => signals[k] != null);
  const wmass = covered.reduce((s, k) => s + (W[k] || 0), 0);
  let score = null, band = 'UNRANKED';
  const reason_codes = [];
  if (wmass >= 0.5) {
    score = Number((covered.reduce((s, k) => s + signals[k] * (W[k] || 0), 0) / wmass).toFixed(4));
    band = score >= 0.72 ? 'P1' : score >= 0.55 ? 'P2' : score >= 0.38 ? 'P3' : 'P4';
  } else reason_codes.push('INSUFFICIENT_PRIORITY_COVERAGE');
  for (const k of PRIORITY_INPUTS) if (signals[k] == null) reason_codes.push('MISSING_' + k.toUpperCase());
  if (segment.status === 'INSUFFICIENT') reason_codes.push('SEGMENT_INSUFFICIENT');
  if (segment.status === 'HYPOTHESIS') reason_codes.push('SEGMENT_HYPOTHESIS_ONLY');

  const uncertainty = Number((1 - Math.min(1, wmass)).toFixed(4));
  const body = {
    schema_version: 'ucdm-customer-model-1.0.0', kind: 'SegmentPriority', segment_id: segment.segment_id,
    signals, weights: W, weights_version: weights ? 'custom' : PRIORITY_WEIGHTS_VERSION,
    priority_score: score, priority_band: band,
    reason_codes: [...new Set(reason_codes)].sort(),
    uncertainty,
    is_analytical: true,
    triggers_action: false,
    autonomous_targeting: false,
    note: 'analytical prioritisation only — does NOT create, target, or launch any campaign',
    generated_by: 'deterministic:ucdm/customer_model/priority',
  };
  body.priority_id = 'segpri_' + sha256Hex(canonicalize({ ...body, priority_id: undefined }));
  return deepFreeze(body);
}

function num(v) { return v == null || Number.isNaN(Number(v)) ? null : Math.max(0, Math.min(1, Number(v))); }
function evidenceCoverage(segment) {
  const s = segment.observed_sample;
  if (!s.unique_source_count) return 0;
  return Number(Math.min(1, (1 - Math.exp(-s.unique_source_count / 4)) * (s.known_customer_count ? 1 : 0.6)).toFixed(4));
}

function validatePriority(p) {
  const errors = [];
  if (!PRIORITY_BANDS.includes(p.priority_band)) errors.push(`bad priority band "${p.priority_band}"`);
  if (p.is_analytical !== true || p.triggers_action !== false || p.autonomous_targeting !== false) errors.push('priority must be analytical and non-autonomous');
  if (p.priority_score != null && (p.priority_score < 0 || p.priority_score > 1)) errors.push('priority_score out of range');
  return { valid: errors.length === 0, errors };
}

module.exports = { PRIORITY_INPUTS, DEFAULT_PRIORITY_WEIGHTS, PRIORITY_WEIGHTS_VERSION, PRIORITY_BANDS, assessPriority, validatePriority };
