'use strict';
// [ASTRA-11E] Competitor Intelligence Engine — public surface.
// DESIGN + DETERMINISTIC IMPLEMENTATION + ISOLATED OFFLINE BENCHMARKING. No LLM.
// No ASTRA-11E output may feed production routing or autonomous action.
module.exports = {
  competitorProfile: require('./competitor_profile'),
  attributeModel: require('./attribute_model'),
  temporalState: require('./temporal_state'),
  positioning: require('./positioning'),
  offerProfile: require('./offer_profile'),
  messageProfile: require('./message_profile'),
  proofProfile: require('./proof_profile'),
  funnelProfile: require('./funnel_profile'),
  creativeProfile: require('./creative_profile'),
  hypotheses: require('./hypotheses'),
  competitiveMatrix: require('./competitive_matrix'),
  saturation: require('./saturation'),
  positioningMap: require('./positioning_map'),
  threatAssessment: require('./threat_assessment'),
  differentiationGap: require('./differentiation_gap'),
  opportunity: require('./opportunity'),
  coverage: require('./coverage'),
  report: require('./report'),
  engine: require('./engine'),
  COMPETITOR_SCHEMA_VERSION: require('./competitor_profile').COMPETITOR_SCHEMA_VERSION,
  UCDM_SCHEMA_VERSION: require('../schema/entities').SCHEMA_VERSION,
  INGEST_SCHEMA_VERSION: require('../ingestion/raw_source').INGEST_SCHEMA_VERSION,
  RESEARCH_SCHEMA_VERSION: require('../research/request').RESEARCH_SCHEMA_VERSION,
};
