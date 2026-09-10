'use strict';
// [ASTRA-11K §1] ExperimentOpportunity contract. Structured intake of a diagnosed commercial
// problem — from an ASTRA-11J result or supplied directly. NO monetary opportunity is assumed
// unless ASTRA-11J computed it validly. No LLM, no I/O, no clock.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const EXPERIMENT_SCHEMA_VERSION = 'ucdm-experiment-1.0.0';

const OPPORTUNITY_KINDS = Object.freeze(['BOTTLENECK', 'LEAKAGE', 'OPPORTUNITY', 'DIAGNOSIS', 'MANUAL']);
const EVIDENCE_QUALITY = Object.freeze(['STRONG', 'MODERATE', 'WEAK', 'INSUFFICIENT', 'UNKNOWN']);

function makeOpportunity(x) {
  const kind = OPPORTUNITY_KINDS.includes(String(x.kind).toUpperCase()) ? String(x.kind).toUpperCase() : 'MANUAL';
  const eco = x.economic_impact && x.economic_impact.amount != null && x.economic_impact.status && x.economic_impact.status !== 'UNKNOWN'
    ? { amount: Number(x.economic_impact.amount), currency: x.economic_impact.currency || null, status: String(x.economic_impact.status).toUpperCase(), methodology: x.economic_impact.methodology || null, input_refs: [...new Set(x.economic_impact.input_refs || [])].sort() }
    : { status: 'NOT_VALIDLY_CALCULATED', note: 'no valid ASTRA-11J monetary impact — none assumed' };
  const body = {
    schema_version: EXPERIMENT_SCHEMA_VERSION, kind: 'ExperimentOpportunity',
    opportunity_kind: kind,
    source_ref: x.source_ref == null ? null : String(x.source_ref),
    source_module: x.source_module ? String(x.source_module) : (kind === 'MANUAL' ? 'manual' : 'astra11j'),
    title: String(x.title || `${kind} opportunity`),
    affected_transition: x.affected_transition ? { from: String(x.affected_transition.from), to: String(x.affected_transition.to) } : null,
    impacted_metric: x.impacted_metric == null ? null : String(x.impacted_metric),
    impacted_dimension: x.impacted_dimension == null ? null : String(x.impacted_dimension),
    business_priority: x.business_priority == null ? null : String(x.business_priority),
    evidence_quality: EVIDENCE_QUALITY.includes(String(x.evidence_quality).toUpperCase()) ? String(x.evidence_quality).toUpperCase() : 'UNKNOWN',
    baseline_available: !!x.baseline_available,
    baseline_ref: x.baseline_ref == null ? null : String(x.baseline_ref),
    economic_impact: eco,
    scope: {
      period: x.scope && x.scope.period ? x.scope.period : null,
      cohort_basis: x.scope && x.scope.cohort_basis ? String(x.scope.cohort_basis) : 'UNKNOWN_BASIS',
      channel: x.scope && x.scope.channel != null ? String(x.scope.channel) : null,
      segment: x.scope && x.scope.segment != null ? String(x.scope.segment) : null,
      offer: x.scope && x.scope.offer != null ? String(x.scope.offer) : null,
      geography: x.scope && x.scope.geography != null ? String(x.scope.geography) : null,
      currency: x.scope && x.scope.currency != null ? String(x.scope.currency) : null,
    },
    evidence_refs: [...new Set((x.evidence_refs || []).map(String))].sort(),
    reason_codes: [...new Set((x.reason_codes || []).map(String))].sort(),
    generated_by: 'deterministic:ucdm/experiment',
  };
  body.opportunity_id = 'expo_' + sha256Hex(canonicalize({ ...body, opportunity_id: undefined }));
  return deepFreeze(body);
}

// extractOpportunities(funnelRevenueResult) -> [ExperimentOpportunity]
function extractOpportunities(fr) {
  if (!fr) return [];
  const out = [];
  const priByRef = Object.fromEntries((fr.priorities || []).map(p => [p.target_ref, p]));
  const scopeFromObs = () => {
    const o = (fr.observations || [])[0];
    return o ? { period: o.period, cohort_basis: o.cohort_basis, channel: o.channel, segment: o.segment, offer: o.offer, geography: o.geography, currency: o.currency } : {};
  };
  for (const b of (fr.bottlenecks || [])) {
    const pri = priByRef[b.bottleneck_id];
    out.push(makeOpportunity({
      kind: 'BOTTLENECK', source_ref: b.bottleneck_id, source_module: 'astra11j/bottleneck',
      title: `${b.transition.from} -> ${b.transition.to}: ${b.reason_codes.join(', ')}`,
      affected_transition: b.transition, impacted_metric: `${b.transition.from}_to_${b.transition.to}_rate`,
      business_priority: pri ? pri.priority_band : null,
      evidence_quality: b.confidence && b.confidence.band ? mapBand(b.confidence.band) : 'UNKNOWN',
      baseline_available: !!(b.baseline && b.baseline.value != null),
      economic_impact: b.economic_impact || null,
      scope: scopeFromObs(),
      evidence_refs: b.evidence_refs, reason_codes: b.reason_codes,
    }));
  }
  for (const l of (fr.leakages || [])) {
    const pri = priByRef[l.leakage_id];
    out.push(makeOpportunity({
      kind: 'LEAKAGE', source_ref: l.leakage_id, source_module: 'astra11j/leakage',
      title: `leakage: ${l.leakage_source}`,
      affected_transition: l.transition, impacted_metric: l.transition ? `${l.transition.from}_to_${l.transition.to}_rate` : null,
      impacted_dimension: 'revenue',
      business_priority: pri ? pri.priority_band : null,
      evidence_quality: l.value_estimate.status === 'OBSERVED' ? 'MODERATE' : l.value_estimate.status === 'UNKNOWN' ? 'WEAK' : 'MODERATE',
      economic_impact: l.value_estimate && l.value_estimate.status !== 'UNKNOWN' ? { amount: l.value_estimate.amount, currency: l.value_estimate.currency, status: l.value_estimate.status, methodology: l.value_estimate.methodology, input_refs: l.value_estimate.input_refs } : null,
      scope: scopeFromObs(),
      evidence_refs: l.evidence_refs, reason_codes: [l.leakage_source],
    }));
  }
  return out;
}
function mapBand(b) { return ({ VERY_HIGH: 'STRONG', HIGH: 'STRONG', MEDIUM: 'MODERATE', LOW: 'WEAK', VERY_LOW: 'INSUFFICIENT' })[b] || 'UNKNOWN'; }

function validateOpportunity(o) {
  const errors = [];
  if (!OPPORTUNITY_KINDS.includes(o.opportunity_kind)) errors.push(`bad opportunity_kind "${o.opportunity_kind}"`);
  if (!EVIDENCE_QUALITY.includes(o.evidence_quality)) errors.push(`bad evidence_quality "${o.evidence_quality}"`);
  if (o.economic_impact && o.economic_impact.status && !['NOT_VALIDLY_CALCULATED', 'OBSERVED', 'COMPUTED', 'MODELLED'].includes(o.economic_impact.status)) errors.push('economic impact status invalid');
  if (o.economic_impact && ['OBSERVED', 'COMPUTED', 'MODELLED'].includes(o.economic_impact.status) && o.economic_impact.amount == null) errors.push('a validly-calculated economic impact needs an amount');
  return { valid: errors.length === 0, errors };
}

module.exports = { EXPERIMENT_SCHEMA_VERSION, OPPORTUNITY_KINDS, EVIDENCE_QUALITY, makeOpportunity, extractOpportunities, validateOpportunity };
