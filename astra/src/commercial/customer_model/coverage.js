'use strict';
// [ASTRA-11G §7] Customer-model evidence coverage. Deterministic. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

// computeCustomerModelCoverage({ vocResult, researchResult, attributeEvidence, segments })
function computeCustomerModelCoverage({ vocResult = {}, researchResult = null, attributeEvidence = [], segments = [] }) {
  const vc = vocResult.coverage || {};
  const observedAttr = attributeEvidence.filter(a => a.status === 'OBSERVED');
  const attrTypesObserved = [...new Set(observedAttr.map(a => a.attribute))].sort();
  const supportedSegments = segments.filter(s => s.status === 'SUPPORTED').length;

  const body = {
    schema_version: 'ucdm-customer-model-1.0.0', kind: 'CustomerModelCoverage',
    voc_source_count: vc.source_count || 0,
    voc_utterance_count: vc.utterance_count || 0,
    voc_unique_speaker_count: vc.unique_speaker_count || null,
    voc_observation_count: vc.observation_count || 0,
    market_evidence_present: !!(researchResult && (researchResult.facts || []).length),
    market_fact_count: researchResult ? (researchResult.facts || []).length + (researchResult.computed_facts || []).length : 0,
    attribute_evidence_total: attributeEvidence.length,
    attribute_evidence_observed: observedAttr.length,
    attribute_types_observed: attrTypesObserved,
    segment_count: segments.length,
    supported_segment_count: supportedSegments,
    has_problem_signal: attrTypesObserved.includes('pain') || attrTypesObserved.includes('problem'),
    has_desired_outcome: attrTypesObserved.includes('desired_outcome'),
    has_decision_criteria: attrTypesObserved.includes('decision_criterion'),
    duplicate_ratio: vc.duplicate_ratio || 0,
    limitations: [],
    generated_by: 'deterministic:ucdm/customer_model/coverage',
  };
  if (body.voc_source_count < 5) body.limitations.push('few VoC sources — customer model reflects a small sample');
  if (!body.voc_unique_speaker_count) body.limitations.push('speakers not identifiable — segment membership cannot be confirmed at customer level');
  if (!body.market_evidence_present) body.limitations.push('no market evidence supplied — attractiveness/saturation partly UNKNOWN');
  if (!body.has_problem_signal) body.limitations.push('no clear problem signal in evidence');
  if (!body.has_desired_outcome) body.limitations.push('no desired-outcome signal in evidence');
  body.coverage_id = 'cmcov_' + sha256Hex(canonicalize({ ...body, coverage_id: undefined }));
  return deepFreeze(body);
}

module.exports = { computeCustomerModelCoverage };
