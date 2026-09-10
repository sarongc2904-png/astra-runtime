'use strict';
// [ASTRA-11C] Canonical EVIDENCE BATCH / OBSERVATION BATCH container (spec section M).
// Reproducible from identical input: same envelopes + observations + ingestion records ->
// same content_hash.
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { INGEST_SCHEMA_VERSION } = require('../ingestion/raw_source');

// makeEvidenceBatch({ batch_id, envelopes, observations, ingestion_records, duplicates, warnings })
function makeEvidenceBatch(input) {
  if (!input || !input.batch_id) throw new Error('makeEvidenceBatch: batch_id required');
  const envelopes = input.envelopes || [];
  const observations = input.observations || [];
  const records = input.ingestion_records || [];

  const accepted = records.filter(r => r.status === 'NORMALIZED').map(r => r.ingestion_id).sort();
  const rejected = records.filter(r => r.status === 'REJECTED').map(r => r.ingestion_id).sort();
  const quarantined = records.filter(r => r.status === 'QUARANTINED').map(r => r.ingestion_id).sort();
  const schemaVersions = [...new Set([
    INGEST_SCHEMA_VERSION,
    ...envelopes.map(e => e.schema_version),
    ...observations.map(o => o.schema_version),
    ...records.map(r => r.schema_version),
  ].filter(Boolean))].sort();

  const batch = {
    schema_version: INGEST_SCHEMA_VERSION,
    batch_id: String(input.batch_id),
    source_count: envelopes.length,
    observation_count: observations.length,
    accepted, accepted_count: accepted.length,
    rejected, rejected_count: rejected.length,
    quarantined, quarantined_count: quarantined.length,
    duplicates: input.duplicates || { possible_duplicates: [], duplicate_member_count: 0 },
    warnings: (input.warnings || []).map(String).sort(),
    schema_versions: schemaVersions,
    // Order-independent, reproducible: hash the SORTED sets of stable hashes.
    envelope_hashes: envelopes.map(e => e.raw_source_hash).sort(),
    observation_hashes: observations.map(o => o.content_hash).sort(),
  };
  batch.content_hash = 'batch_' + sha256Hex(canonicalize({
    batch_id: batch.batch_id,
    envelope_hashes: batch.envelope_hashes,
    observation_hashes: batch.observation_hashes,
    accepted, rejected, quarantined,
    duplicates: batch.duplicates,
    schema_versions: batch.schema_versions,
  }));
  return deepFreeze(batch);
}

module.exports = { makeEvidenceBatch };
