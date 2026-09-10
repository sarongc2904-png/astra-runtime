'use strict';
// [ASTRA-11C] Evidence Ingestion & Normalization — public surface.
// DESIGN + OFFLINE DETERMINISTIC IMPLEMENTATION + TESTING ONLY.
// No runtime LLM, no web call, no integration, no Supabase write, no deploy.
// Reuses the ASTRA-11B commercial contracts (schema_version target ucdm-1.0.0) as the
// canonical downstream target; adds ingestion schema_version ucdm-ingest-1.0.0.
module.exports = {
  // A. raw source
  rawSource: require('./raw_source'),
  // B. adapter boundary
  providerNeutrality: require('./provider_neutrality'),
  fakeAdapters: require('./fake_adapters'),
  // C. ingestion record
  ingestionRecord: require('./ingestion_record'),
  // D + E + I. normalized observation / verbatim
  normalize: require('../normalization/normalize'),
  verbatim: require('../normalization/verbatim'),
  normalizedObservation: require('../normalization/normalized_observation'),
  // F. numeric observations
  numericObservation: require('../normalization/numeric_observation'),
  // G. deduplication
  dedup: require('../evidence/dedup'),
  // H. source quality
  sourceQuality: require('../evidence/source_quality'),
  // J. temporal
  temporal: require('../evidence/temporal'),
  // K. subject resolution boundary
  subjectResolution: require('../evidence/subject_resolution'),
  // L. privacy / redaction contract
  redaction: require('./redaction'),
  // M. evidence batch
  evidenceBatch: require('../evidence/evidence_batch'),
  // pipeline
  pipeline: require('./pipeline'),

  INGEST_SCHEMA_VERSION: require('./raw_source').INGEST_SCHEMA_VERSION,
  UCDM_SCHEMA_VERSION: require('../schema/entities').SCHEMA_VERSION,
};
