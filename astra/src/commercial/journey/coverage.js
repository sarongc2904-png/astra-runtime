'use strict';
// [ASTRA-11H] Journey-model evidence coverage. Deterministic. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const ST = require('./stage_taxonomy');

function computeJourneyCoverage(x) {
  const { vocResult = {}, journeyObservations = [], events = [], transitions = [], triggers = [], frictions = [], proofRequirements = [], alternatives = [], jobs = [], prePost = null, temporalSplit = null } = x;
  const vc = vocResult.coverage || {};
  const stagesCovered = [...new Set(journeyObservations.map(o => o.stage).filter(s => s !== 'UNKNOWN'))];
  const body = {
    schema_version: 'ucdm-journey-1.0.0', kind: 'JourneyModelCoverage',
    voc_source_count: vc.source_count || 0,
    voc_unique_speaker_count: vc.unique_speaker_count || null,
    journey_observation_count: journeyObservations.length,
    observed_journey_observation_count: journeyObservations.filter(o => o.status === 'OBSERVED').length,
    event_count: events.length,
    transition_count: transitions.length,
    observed_transition_count: transitions.filter(t => t.transition_status === 'OBSERVED').length,
    stage_coverage: { stages: stagesCovered.sort(), count: stagesCovered.length },
    trigger_count: triggers.length,
    friction_count: frictions.length,
    proof_requirement_count: proofRequirements.length,
    alternative_count: alternatives.length,
    jtbd_count: jobs.length,
    has_pre_purchase: !!(prePost && prePost.pre_purchase.status === 'EVIDENCED'),
    has_purchase_evidence: !!(prePost && prePost.purchase_moment.status === 'EVIDENCED'),
    has_post_purchase: !!(prePost && prePost.post_purchase.status === 'EVIDENCED'),
    temporal: temporalSplit ? { current: temporalSplit.current.length, historical: temporalSplit.historical.length, unknown: temporalSplit.unknown.length } : null,
    limitations: [],
    generated_by: 'deterministic:ucdm/journey/coverage',
  };
  if (body.voc_source_count < 5) body.limitations.push('few VoC sources — the journey reflects a small sample');
  if (!body.voc_unique_speaker_count) body.limitations.push('speakers not identifiable — per-customer transitions cannot be built');
  if (body.observed_transition_count === 0) body.limitations.push('no timestamp-ordered transitions — transitions are analytical only');
  if (!body.has_purchase_evidence) body.limitations.push('no explicit purchase evidence in the sample');
  if (!body.has_post_purchase) body.limitations.push('no post-purchase evidence in the sample');
  body.coverage_id = 'jcov_' + sha256Hex(canonicalize({ ...body, coverage_id: undefined }));
  return deepFreeze(body);
}

module.exports = { computeJourneyCoverage };
