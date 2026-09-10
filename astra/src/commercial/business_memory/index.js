'use strict';
// [ASTRA-11L] Business Memory Engine — public surface.
// DESIGN + DETERMINISTIC OFFLINE IMPLEMENTATION + ISOLATED OFFLINE BENCHMARKING. No LLM.
// ASTRA-11L persists nothing: no Supabase, no vector DB, no Redis, no external storage,
// no embeddings, no LLM summarization, no autonomous long-term memory.
// No ASTRA-11L output may feed production routing or autonomous action.
module.exports = {
  types: require('./types'),
  candidate: require('./candidate'),
  evidence: require('./evidence'),
  scope: require('./scope'),
  provenance: require('./provenance'),
  identity: require('./identity'),
  temporal: require('./temporal'),
  staleness: require('./staleness'),
  conflicts: require('./conflicts'),
  supersession: require('./supersession'),
  promotion: require('./promotion'),
  invalidation: require('./invalidation'),
  record: require('./record'),
  retrieval: require('./retrieval'),
  resolution: require('./resolution'),
  snapshot: require('./snapshot'),
  integrity: require('./integrity'),
  report: require('./report'),
  engine: require('./engine'),
  BUSINESS_MEMORY_SCHEMA_VERSION: require('./types').BUSINESS_MEMORY_SCHEMA_VERSION,
  UCDM_SCHEMA_VERSION: require('../schema/entities').SCHEMA_VERSION,
  FUNNEL_REVENUE_SCHEMA_VERSION: require('../funnel_revenue/funnel_model').FUNNEL_REVENUE_SCHEMA_VERSION,
  EXPERIMENT_SCHEMA_VERSION: require('../experiment_intelligence/opportunity').EXPERIMENT_SCHEMA_VERSION,
};
