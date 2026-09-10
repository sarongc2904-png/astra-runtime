'use strict';
// [ASTRA-11D] Market Research Engine — public surface.
// DESIGN + IMPLEMENTATION + OFFLINE BENCHMARKING. Deterministic core (no LLM).
// Experimental LLM use is confined to astra/benchmarks/astra11d/ and needs its own
// authorization to actually spend provider calls.
// NO ASTRA-11D output may feed production routing or autonomous action.
module.exports = {
  request: require('./request'),
  plan: require('./plan'),
  sourceProvider: require('./source_provider'),
  researchAdapters: require('./research_source_adapter'),
  marketFact: require('./market_fact'),
  aggregate: require('./aggregate'),
  marketClaim: require('./market_claim'),
  conflict: require('./conflict'),
  insight: require('./insight'),
  coverage: require('./coverage'),
  pricing: require('./pricing'),
  landscapes: require('./landscapes'),
  sophistication: require('./sophistication'),
  gapOpportunity: require('./gap_opportunity'),
  completion: require('./completion'),
  report: require('./report'),
  engine: require('./engine'),
  RESEARCH_SCHEMA_VERSION: require('./request').RESEARCH_SCHEMA_VERSION,
  UCDM_SCHEMA_VERSION: require('../schema/entities').SCHEMA_VERSION,
  INGEST_SCHEMA_VERSION: require('../ingestion/raw_source').INGEST_SCHEMA_VERSION,
};
