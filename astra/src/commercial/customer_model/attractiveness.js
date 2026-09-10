'use strict';
// [ASTRA-11G §R] Deterministic SegmentAttractiveness. ATTRACTIVENESS is kept STRICTLY
// separate from MARKET SIZE — market size is never fabricated. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const ATTRACTIVENESS_INPUTS = Object.freeze(['problem_severity', 'urgency', 'budget_signal', 'solution_fit', 'accessibility', 'observed_demand', 'competitive_saturation', 'sales_friction', 'retention_potential']);
const DEFAULT_ATTRACTIVENESS_WEIGHTS = Object.freeze({ problem_severity: 0.22, urgency: 0.16, budget_signal: 0.14, solution_fit: 0.16, accessibility: 0.08, observed_demand: 0.10, competitive_saturation: 0.08, sales_friction: 0.04, retention_potential: 0.02 });
const ATTRACTIVENESS_WEIGHTS_VERSION = 'cm-attractiveness-w1';
const ATTRACTIVENESS_BANDS = Object.freeze(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']);

const SEVERITY_SCORE = { CRITICAL: 1, HIGH: 0.8, MODERATE: 0.5, LOW: 0.25, UNKNOWN: null };
const URGENCY_SCORE = { HIGH: 1, MEDIUM: 0.6, MIXED: 0.5, LOW: 0.25, UNKNOWN: null };
const BUDGET_SCORE = { BUDGET_FLEXIBLE: 1, BUDGET_DECLARED: 0.9, FINANCING_REQUIRED: 0.55, PRICE_SENSITIVE: 0.4, NO_BUDGET_SIGNAL: null, UNKNOWN: null };

// assessAttractiveness({ segment, urgency, budget, severity, researchResult, businessInput, weights })
function assessAttractiveness({ segment, urgency = null, budget = null, severity = null, researchResult = null, businessInput = {}, weights = null } = {}) {
  const W = weights || DEFAULT_ATTRACTIVENESS_WEIGHTS;
  const bi = businessInput.attractiveness_inputs || {};
  const signals = {
    problem_severity: SEVERITY_SCORE[severity || 'UNKNOWN'] ?? (bi.problem_severity ?? null),
    urgency: URGENCY_SCORE[(urgency && urgency.level) || 'UNKNOWN'] ?? null,
    budget_signal: BUDGET_SCORE[(budget && budget.signal) || 'UNKNOWN'] ?? null,
    solution_fit: numOrNull(bi.solution_fit),
    accessibility: numOrNull(bi.accessibility),
    observed_demand: demandScore(segment),
    competitive_saturation: saturationScore(researchResult, bi),
    sales_friction: frictionScore(segment, bi),
    retention_potential: numOrNull(bi.retention_potential),
  };
  const covered = ATTRACTIVENESS_INPUTS.filter(k => signals[k] != null);
  const wmass = covered.reduce((s, k) => s + (W[k] || 0), 0);
  let score = null, band = 'UNKNOWN';
  const reason_codes = [];
  if (wmass >= 0.5) {
    score = Number((covered.reduce((s, k) => s + signals[k] * (W[k] || 0), 0) / wmass).toFixed(4));
    band = score >= 0.66 ? 'HIGH' : score >= 0.4 ? 'MEDIUM' : 'LOW';
  } else reason_codes.push('INSUFFICIENT_ATTRACTIVENESS_COVERAGE');
  for (const k of ATTRACTIVENESS_INPUTS) if (signals[k] == null) reason_codes.push('MISSING_' + k.toUpperCase());

  const body = {
    schema_version: 'ucdm-customer-model-1.0.0', kind: 'SegmentAttractiveness', segment_id: segment.segment_id,
    signals, weights: W, weights_version: weights ? 'custom' : ATTRACTIVENESS_WEIGHTS_VERSION,
    covered_inputs: covered.sort(), coverage_weight_mass: Number(wmass.toFixed(4)),
    attractiveness_score: score, attractiveness_band: band,
    reason_codes: [...new Set(reason_codes)].sort(),
    market_size: {
      note: 'ATTRACTIVENESS IS INDEPENDENT OF MARKET SIZE. Market size is not estimated here.',
      observed_sample_count: segment.observed_sample.deduped_observation_count,
      known_customer_count: segment.observed_sample.known_customer_count,
      estimated_external_market_size: (businessInput.segment_sizes && businessInput.segment_sizes[segment.segment_id] && businessInput.segment_sizes[segment.segment_id].estimated_external_market_size) || 'UNKNOWN',
    },
    generated_by: 'deterministic:ucdm/customer_model/attractiveness',
  };
  body.attractiveness_id = 'segatt_' + sha256Hex(canonicalize({ ...body, attractiveness_id: undefined }));
  return deepFreeze(body);
}

function numOrNull(v) { return v == null || Number.isNaN(Number(v)) ? null : Math.max(0, Math.min(1, Number(v))); }
function demandScore(segment) {
  const n = segment.observed_sample.deduped_observation_count;
  if (!n) return null;
  return Number((1 - Math.exp(-n / 5)).toFixed(4)); // saturating on OBSERVED demand only
}
function saturationScore(rr, bi) {
  if (bi.competitive_saturation != null) return 1 - numOrNull(bi.competitive_saturation); // less saturated => more attractive
  if (rr && rr.sophistication && typeof rr.sophistication.market_sophistication_stage === 'number') {
    return Number((1 - Math.min(5, rr.sophistication.market_sophistication_stage) / 5).toFixed(4));
  }
  return null;
}
function frictionScore(segment, bi) {
  if (bi.sales_friction != null) return 1 - numOrNull(bi.sales_friction);
  return segment.contradiction_status === 'POLARIZED' ? 0.35 : segment.contradiction_status === 'MIXED' ? 0.55 : null;
}

function validateAttractiveness(a) {
  const errors = [];
  if (!ATTRACTIVENESS_BANDS.includes(a.attractiveness_band)) errors.push(`bad attractiveness band "${a.attractiveness_band}"`);
  if (a.coverage_weight_mass < 0.5 && a.attractiveness_score != null) errors.push('score must be null when coverage insufficient');
  if (!/INDEPENDENT OF MARKET SIZE/.test(a.market_size.note)) errors.push('attractiveness must state its independence from market size');
  if (/\b\d{1,3}\s?%\s*(of|del?)\s*(the\s*)?(market|mercado)/i.test(JSON.stringify(a))) errors.push('attractiveness must not fabricate a market-share figure');
  return { valid: errors.length === 0, errors };
}

module.exports = { ATTRACTIVENESS_INPUTS, DEFAULT_ATTRACTIVENESS_WEIGHTS, ATTRACTIVENESS_WEIGHTS_VERSION, ATTRACTIVENESS_BANDS, assessAttractiveness, validateAttractiveness };
