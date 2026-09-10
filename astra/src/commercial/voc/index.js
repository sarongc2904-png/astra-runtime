'use strict';
// [ASTRA-11F] Voice of Customer Engine — public surface.
// DESIGN + DETERMINISTIC IMPLEMENTATION + ISOLATED OFFLINE BENCHMARKING. No LLM.
// No ASTRA-11F output may feed production routing or autonomous action.
module.exports = {
  taxonomy: require('./taxonomy'),
  speakerValidation: require('./speaker_validation'),
  utterance: require('./utterance'),
  spanGrounding: require('./span_grounding'),
  observation: require('./observation'),
  questions: require('./questions'),
  alternativesTriggersCriteria: require('./alternatives_triggers_criteria'),
  clustering: require('./clustering'),
  coverage: require('./coverage'),
  patternInsight: require('./pattern_insight'),
  buyingLanguage: require('./buying_language'),
  report: require('./report'),
  engine: require('./engine'),
  VOC_SCHEMA_VERSION: require('./utterance').VOC_SCHEMA_VERSION,
  UCDM_SCHEMA_VERSION: require('../schema/entities').SCHEMA_VERSION,
  INGEST_SCHEMA_VERSION: require('../ingestion/raw_source').INGEST_SCHEMA_VERSION,
  RESEARCH_SCHEMA_VERSION: require('../research/request').RESEARCH_SCHEMA_VERSION,
  COMPETITOR_SCHEMA_VERSION: require('../competitor/competitor_profile').COMPETITOR_SCHEMA_VERSION,
};
