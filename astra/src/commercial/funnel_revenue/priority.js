'use strict';
// [ASTRA-11J §AD] Deterministic prioritization of bottleneck / leakage candidates.
// Output is analytical only — `triggers_action: false`. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const INPUTS = Object.freeze(['economic_impact', 'confidence', 'evidence_coverage', 'problem_severity', 'controllability', 'effort', 'strategic_fit']);
const DEFAULT_WEIGHTS = Object.freeze({ economic_impact: 0.3, confidence: 0.14, evidence_coverage: 0.12, problem_severity: 0.16, controllability: 0.12, effort: 0.08, strategic_fit: 0.08 });
const WEIGHTS_VERSION = 'cm-funnel-priority-w1';
const BANDS = Object.freeze(['P1', 'P2', 'P3', 'P4', 'UNRANKED']);

// prioritize({ bottlenecks, leakages, businessInput, weights }) -> [PriorityItem]
function prioritize({ bottlenecks = [], leakages = [], businessInput = {}, weights = null }) {
  const W = weights || DEFAULT_WEIGHTS;
  const bi = businessInput.priority_inputs || {};
  const maxEconomic = Math.max(1, ...bottlenecks.map(b => b.economic_impact && b.economic_impact.amount || 0), ...leakages.map(l => l.value_estimate && l.value_estimate.amount || 0));

  const items = [];
  const consider = [
    ...bottlenecks.map(b => ({ ref: b.bottleneck_id, kind: 'BOTTLENECK', key: `${b.transition.from}__${b.transition.to}`, economic: b.economic_impact && b.economic_impact.amount || null, confidence: b.confidence.score, coverage: Math.min(1, b.coverage.valid_transitions_in_funnel / 5), reason_codes: b.reason_codes })),
    ...leakages.filter(l => l.value_estimate.status !== 'UNKNOWN').map(l => ({ ref: l.leakage_id, kind: 'LEAKAGE', key: l.leakage_source, economic: l.value_estimate.amount, confidence: 0.4, coverage: 0.4, reason_codes: [l.leakage_source] })),
  ];

  for (const c of consider) {
    const k = c.key;
    const signals = {
      economic_impact: c.economic != null ? Math.min(1, c.economic / maxEconomic) : null,
      confidence: c.confidence != null ? c.confidence : null,
      evidence_coverage: c.coverage != null ? c.coverage : null,
      problem_severity: bi[k] && bi[k].problem_severity != null ? num(bi[k].problem_severity) : (c.reason_codes.includes('LARGE_ABSOLUTE_LOSS') || c.reason_codes.includes('HIGH_ECONOMIC_LOSS') ? 0.8 : 0.5),
      controllability: bi[k] && bi[k].controllability != null ? num(bi[k].controllability) : null,
      effort: bi[k] && bi[k].effort != null ? 1 - num(bi[k].effort) : null,
      strategic_fit: bi[k] && bi[k].strategic_fit != null ? num(bi[k].strategic_fit) : null,
    };
    const covered = INPUTS.filter(i => signals[i] != null);
    const wmass = covered.reduce((s, i) => s + (W[i] || 0), 0);
    let score = null, band = 'UNRANKED';
    const reason_codes = [...c.reason_codes];
    if (wmass >= 0.5) {
      score = Number((covered.reduce((s, i) => s + signals[i] * (W[i] || 0), 0) / covered.reduce((s, i) => s + (W[i] || 0), 0)).toFixed(4));
      band = score >= 0.7 ? 'P1' : score >= 0.55 ? 'P2' : score >= 0.38 ? 'P3' : 'P4';
    } else reason_codes.push('INSUFFICIENT_PRIORITY_COVERAGE');
    for (const i of INPUTS) if (signals[i] == null) reason_codes.push('MISSING_' + i.toUpperCase());

    const body = {
      schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'FunnelPriorityItem',
      target_ref: c.ref, target_kind: c.kind, target_key: k,
      signals, weights: W, weights_version: weights ? 'custom' : WEIGHTS_VERSION,
      priority_score: score, priority_band: band, uncertainty: Number((1 - Math.min(1, wmass)).toFixed(4)),
      reason_codes: [...new Set(reason_codes)].sort(),
      is_analytical: true, triggers_action: false, autonomous: false,
      note: 'analytical prioritisation only — does not launch, change, or execute anything',
      generated_by: 'deterministic:ucdm/funnel_revenue/priority',
    };
    body.priority_id = 'fpr_' + sha256Hex(canonicalize({ ...body, priority_id: undefined }));
    items.push(deepFreeze(body));
  }
  return items.sort((a, b) => (a.target_ref < b.target_ref ? -1 : 1));
}
function num(v) { return v == null || Number.isNaN(Number(v)) ? null : Math.max(0, Math.min(1, Number(v))); }

function validatePriority(p) {
  const errors = [];
  if (!BANDS.includes(p.priority_band)) errors.push(`bad priority band "${p.priority_band}"`);
  if (p.is_analytical !== true || p.triggers_action !== false || p.autonomous !== false) errors.push('priority must be analytical and non-autonomous');
  return { valid: errors.length === 0, errors };
}

module.exports = { INPUTS, DEFAULT_WEIGHTS, WEIGHTS_VERSION, BANDS, prioritize, validatePriority };
