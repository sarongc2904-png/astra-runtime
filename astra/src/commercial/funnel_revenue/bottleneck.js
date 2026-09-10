'use strict';
// [ASTRA-11J §W] FunnelBottleneckCandidate — ANALYTICAL, non-causal. Compares each transition
// against a VALID internal baseline (the median of the funnel's other valid transitions, or a
// supplied baseline). NO external "industry benchmark" unless supplied as evidence.
// `is_fact:false`, `causal_claim:false`. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');

const REASON_CODES = Object.freeze([
  'LOW_TRANSITION_RATE_VS_INTERNAL_BASELINE', 'LARGE_ABSOLUTE_LOSS', 'HIGH_ECONOMIC_LOSS',
  'STALLED_CYCLE', 'HIGH_COST_PER_PROGRESSION', 'POOR_RETENTION',
]);

// buildBottleneckCandidates({ transitions, summary, valuePerProgression, retention, suppliedBaselines })
function buildBottleneckCandidates(x) {
  const { transitions = [], valuePerProgression = null, retention = null, suppliedBaselines = {} } = x;
  const valid = transitions.filter(t => t.status === 'VALID' && t.conversion_rate != null);
  if (valid.length < 2) return [];
  const rates = valid.map(t => t.conversion_rate).sort((a, b) => a - b);
  const internalMedian = rates[Math.floor(rates.length / 2)];

  const out = [];
  for (const t of valid) {
    const reasons = [];
    const key = `${t.from_stage}__${t.to_stage}`;
    const baseline = suppliedBaselines[key] != null ? Number(suppliedBaselines[key]) : internalMedian;
    const baselineBasis = suppliedBaselines[key] != null ? 'USER_PROVIDED_BASELINE' : 'INTERNAL_MEDIAN_OF_VALID_TRANSITIONS';
    if (baseline > 0 && t.conversion_rate < baseline * 0.6) reasons.push('LOW_TRANSITION_RATE_VS_INTERNAL_BASELINE');
    const maxLoss = Math.max(...valid.map(v => v.drop_off_count || 0));
    if ((t.drop_off_count || 0) >= maxLoss && maxLoss > 0) reasons.push('LARGE_ABSOLUTE_LOSS');
    let economic_impact = null;
    if (valuePerProgression != null && valuePerProgression.value != null && t.drop_off_count != null) {
      economic_impact = { amount: Number((t.drop_off_count * valuePerProgression.value).toFixed(2)), currency: valuePerProgression.currency || null, status: valuePerProgression.status || 'MODELLED', methodology: valuePerProgression.methodology || 'drop_off_count * supplied value per progression', input_refs: valuePerProgression.input_refs || [] };
      if (economic_impact.amount >= (valuePerProgression.high_threshold || Infinity)) reasons.push('HIGH_ECONOMIC_LOSS');
    }
    if (reasons.length === 0) continue;
    const body = {
      schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'FunnelBottleneckCandidate',
      transition: { from: t.from_stage, to: t.to_stage },
      metric: { conversion_rate: t.conversion_rate, drop_off_count: t.drop_off_count },
      baseline: { value: baseline, basis: baselineBasis },
      economic_impact,
      reason_codes: [...new Set(reasons)].sort(),
      evidence_refs: t.evidence_refs,
      coverage: { valid_transitions_in_funnel: valid.length },
      confidence: assess({ evidence_count: t.evidence_refs.length, distinct_sources: 1, coverage: Math.min(1, valid.length / 5), agree_count: reasons.length, conflict_count: 0 }),
      is_fact: false,
      causal_claim: false,
      uses_external_benchmark: false,
      note: 'analytical candidate vs an INTERNAL baseline only — not a fact, not a cause',
      generated_by: 'deterministic:ucdm/funnel_revenue/bottleneck',
    };
    body.bottleneck_id = 'fbn_' + sha256Hex(canonicalize({ ...body, bottleneck_id: undefined, confidence: body.confidence.content_hash }));
    out.push(deepFreeze(body));
  }
  // poor retention as its own candidate
  if (retention && retention.rates.retention_rate && retention.rates.retention_rate.status === 'VALID' && retention.rates.retention_rate.rate != null && retention.rates.retention_rate.rate < 0.5) {
    const body = {
      schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'FunnelBottleneckCandidate',
      transition: { from: 'ACTIVATED', to: 'RETAINED' },
      metric: { conversion_rate: retention.rates.retention_rate.rate },
      baseline: { value: null, basis: 'NONE' },
      economic_impact: null,
      reason_codes: ['POOR_RETENTION'],
      evidence_refs: [],
      coverage: { valid_transitions_in_funnel: valid.length },
      confidence: assess({ evidence_count: 0, distinct_sources: 1, coverage: 0.3 }),
      is_fact: false, causal_claim: false, uses_external_benchmark: false,
      note: 'analytical retention concern — not a fact, not a cause',
      generated_by: 'deterministic:ucdm/funnel_revenue/bottleneck',
    };
    body.bottleneck_id = 'fbn_' + sha256Hex(canonicalize({ ...body, bottleneck_id: undefined, confidence: body.confidence.content_hash }));
    out.push(deepFreeze(body));
  }
  return out.sort((a, b) => (JSON.stringify(a.transition) < JSON.stringify(b.transition) ? -1 : 1));
}

function validateBottleneck(b) {
  const errors = [];
  if (b.is_fact !== false) errors.push('a bottleneck candidate is never a fact');
  if (b.causal_claim !== false) errors.push('a bottleneck candidate makes no causal claim');
  if (b.uses_external_benchmark !== false) errors.push('no external industry benchmark unless supplied as evidence');
  if (b.reason_codes.some(r => !REASON_CODES.includes(r))) errors.push('uncontrolled bottleneck reason code');
  if (b.economic_impact && !['OBSERVED', 'COMPUTED', 'MODELLED'].includes(b.economic_impact.status)) errors.push('economic impact needs a status');
  return { valid: errors.length === 0, errors };
}

module.exports = { REASON_CODES, buildBottleneckCandidates, validateBottleneck };
