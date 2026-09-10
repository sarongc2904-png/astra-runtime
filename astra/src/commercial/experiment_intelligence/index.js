'use strict';
// [ASTRA-11K] Experiment Intelligence Engine — public surface.
// DESIGN + DETERMINISTIC IMPLEMENTATION + ISOLATED OFFLINE BENCHMARKING. No LLM.
// ASTRA-11K executes nothing: no experiments, no campaigns, no budget, no deploy, no prod write.
// No ASTRA-11K output may feed production routing or autonomous action.
module.exports = {
  opportunity: require('./opportunity'),
  hypothesis: require('./hypothesis'),
  variables: require('./variables'),
  baseline: require('./baseline'),
  metrics: require('./metrics'),
  guardrails: require('./guardrails'),
  design: require('./design'),
  risk: require('./risk'),
  timeToSignal: require('./time_to_signal'),
  priority: require('./priority'),
  measurement: require('./measurement'),
  statistics: require('./statistics'),
  causality: require('./causality'),
  evaluation: require('./evaluation'),
  decision: require('./decision'),
  registry: require('./registry'),
  integrity: require('./integrity'),
  report: require('./report'),
  engine: require('./engine'),
  EXPERIMENT_SCHEMA_VERSION: require('./opportunity').EXPERIMENT_SCHEMA_VERSION,
  UCDM_SCHEMA_VERSION: require('../schema/entities').SCHEMA_VERSION,
  FUNNEL_REVENUE_SCHEMA_VERSION: require('../funnel_revenue/funnel_model').FUNNEL_REVENUE_SCHEMA_VERSION,
  VOC_SCHEMA_VERSION: require('../voc/utterance').VOC_SCHEMA_VERSION,
  JOURNEY_SCHEMA_VERSION: require('../journey/journey_observation').JOURNEY_SCHEMA_VERSION,
  POSITIONING_OFFER_SCHEMA_VERSION: require('../positioning_offer/positioning_evidence').POSITIONING_OFFER_SCHEMA_VERSION,
};
