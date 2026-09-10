'use strict';
// [ASTRA-11K §10] Prioritization. Uses explicit factors. If inputs are qualitative it
// produces an ORDINAL priority (PRIORITY_HIGH/MEDIUM/LOW) or a deterministic rank — NEVER a
// fake precise percentage. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const FACTORS = Object.freeze(['expected_impact', 'evidence_strength', 'execution_cost', 'time_to_signal', 'reversibility', 'operational_risk', 'affected_funnel_value']);
const DEFAULT_WEIGHTS = Object.freeze({ expected_impact: 0.26, evidence_strength: 0.16, execution_cost: 0.12, time_to_signal: 0.12, reversibility: 0.12, operational_risk: 0.12, affected_funnel_value: 0.10 });
const WEIGHTS_VERSION = 'cm-experiment-priority-w1';
const ORDINAL = Object.freeze(['PRIORITY_HIGH', 'PRIORITY_MEDIUM', 'PRIORITY_LOW', 'ORDINAL_PRIORITY_UNRANKED']);

const LEVEL_SCORE = { HIGH: 1, MEDIUM: 0.55, LOW: 0.15, UNKNOWN: null, MEDIUM_HIGH: 0.78 };
const SIGNAL_SCORE = { IMMEDIATE: 1, SHORT: 0.75, MEDIUM: 0.45, LONG: 0.2, TIME_TO_SIGNAL_UNKNOWN: null };

// prioritizeExperiment({ opportunity, timeToSignal, risk, evidenceQuality, businessInput })
function prioritizeExperiment(x) {
  const bi = x.businessInput || {};
  const q = bi.priority_inputs || {};

  const impactSignal = x.opportunity && x.opportunity.economic_impact && ['OBSERVED', 'COMPUTED', 'MODELLED'].includes(x.opportunity.economic_impact.status) && x.opportunity.economic_impact.amount != null
    ? { quantitative: true, value: Number(x.opportunity.economic_impact.amount) }
    : { quantitative: false, level: q.expected_impact || (x.opportunity && x.opportunity.business_priority ? bandToLevel(x.opportunity.business_priority) : 'UNKNOWN') };

  const signals = {
    expected_impact: impactSignal.quantitative ? clamp01(impactSignal.value / (bi.impact_reference || Math.max(1, impactSignal.value))) : LEVEL_SCORE[String(impactSignal.level).toUpperCase()] ?? null,
    evidence_strength: LEVEL_SCORE[mapEvidence(x.evidenceQuality)] ?? null,
    execution_cost: q.execution_cost ? 1 - LEVEL_SCORE[String(q.execution_cost).toUpperCase()] : null,
    time_to_signal: x.timeToSignal ? SIGNAL_SCORE[x.timeToSignal.signal_class] : null,
    reversibility: x.risk ? LEVEL_SCORE[x.risk.dimension_ratings.reversibility] === 1 ? 0.2 : (x.risk.dimension_ratings.reversibility === 'LOW' ? 1 : x.risk.dimension_ratings.reversibility === 'MEDIUM' ? 0.55 : x.risk.dimension_ratings.reversibility === 'HIGH' ? 0.15 : null) : null,
    operational_risk: x.risk ? (x.risk.dimension_ratings.operational_risk === 'LOW' ? 1 : x.risk.dimension_ratings.operational_risk === 'MEDIUM' ? 0.55 : x.risk.dimension_ratings.operational_risk === 'HIGH' ? 0.15 : null) : null,
    affected_funnel_value: q.affected_funnel_value ? clamp01(Number(q.affected_funnel_value)) : null,
  };

  const W = bi.priority_weights || DEFAULT_WEIGHTS;
  const covered = FACTORS.filter(f => signals[f] != null);
  const wmass = covered.reduce((s, f) => s + (W[f] || 0), 0);
  const anyQuantImpact = impactSignal.quantitative;

  let mode, score = null, ordinal, rank_basis;
  if (wmass >= 0.5 && anyQuantImpact) {
    mode = 'QUANTITATIVE';
    score = Number((covered.reduce((s, f) => s + signals[f] * (W[f] || 0), 0) / covered.reduce((s, f) => s + (W[f] || 0), 0)).toFixed(4));
    ordinal = score >= 0.66 ? 'PRIORITY_HIGH' : score >= 0.4 ? 'PRIORITY_MEDIUM' : 'PRIORITY_LOW';
    rank_basis = 'weighted score over covered factors incl. a validly-calculated economic impact';
  } else if (covered.length >= 2) {
    mode = 'ORDINAL_PRIORITY';
    const rough = Number((covered.reduce((s, f) => s + signals[f], 0) / covered.length).toFixed(4));
    ordinal = rough >= 0.66 ? 'PRIORITY_HIGH' : rough >= 0.4 ? 'PRIORITY_MEDIUM' : 'PRIORITY_LOW';
    rank_basis = 'ordinal — inputs are qualitative or no validly-calculated economic impact; no precise score produced';
  } else {
    mode = 'ORDINAL_PRIORITY'; ordinal = 'ORDINAL_PRIORITY_UNRANKED'; rank_basis = 'insufficient factor coverage';
  }

  const body = {
    schema_version: 'ucdm-experiment-1.0.0', kind: 'ExperimentPriority',
    mode, signals, weights: W, weights_version: bi.priority_weights ? 'custom' : WEIGHTS_VERSION,
    covered_factors: covered.sort(), missing_factors: FACTORS.filter(f => signals[f] == null).sort(),
    priority_score: mode === 'QUANTITATIVE' ? score : null,
    ordinal_priority: ordinal,
    rank_basis,
    fabricated_precision: false,
    is_analytical: true, triggers_action: false, autonomous: false,
    note: 'analytical prioritisation only — no experiment is started, changed, or executed',
    generated_by: 'deterministic:ucdm/experiment',
  };
  body.priority_id = 'expr_' + sha256Hex(canonicalize({ ...body, priority_id: undefined }));
  return deepFreeze(body);
}
function clamp01(v) { return v == null || Number.isNaN(Number(v)) ? null : Math.max(0, Math.min(1, Number(v))); }
function bandToLevel(b) { return /P1|HIGH/i.test(b) ? 'HIGH' : /P2|MEDIUM/i.test(b) ? 'MEDIUM' : /P3|P4|LOW/i.test(b) ? 'LOW' : 'UNKNOWN'; }
function mapEvidence(e) { return ({ STRONG: 'HIGH', MODERATE: 'MEDIUM', WEAK: 'LOW', INSUFFICIENT: 'LOW', UNKNOWN: 'UNKNOWN' })[String(e || 'UNKNOWN').toUpperCase()] || 'UNKNOWN'; }

function validatePriority(p) {
  const errors = [];
  if (!ORDINAL.includes(p.ordinal_priority)) errors.push(`bad ordinal_priority "${p.ordinal_priority}"`);
  if (p.mode === 'ORDINAL_PRIORITY' && p.priority_score != null) errors.push('an ordinal priority must not carry a precise score');
  if (p.fabricated_precision !== false) errors.push('no fabricated precision');
  if (p.is_analytical !== true || p.triggers_action !== false || p.autonomous !== false) errors.push('priority must be analytical and non-autonomous');
  return { valid: errors.length === 0, errors };
}

module.exports = { FACTORS, DEFAULT_WEIGHTS, WEIGHTS_VERSION, ORDINAL, prioritizeExperiment, validatePriority };
