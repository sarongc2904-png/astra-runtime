'use strict';
// [ASTRA-11C] Immutable INGESTION RECORD (spec section C).
// Rejected / quarantined material is NEVER silently discarded — it gets a record with the
// reason so it can be re-processed later.
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { INGEST_SCHEMA_VERSION } = require('./raw_source');

const INGESTION_STATUS = Object.freeze(['RECEIVED', 'VALIDATED', 'NORMALIZED', 'REJECTED', 'QUARANTINED']);

// Terminal-ish: REJECTED = structurally unusable; QUARANTINED = held for human/later review
// (e.g. POSSIBLE_DUPLICATE, ambiguous subject with strict mode, unknown-but-not-invalid).
const TRANSITIONS = Object.freeze({
  RECEIVED: ['VALIDATED', 'REJECTED', 'QUARANTINED'],
  VALIDATED: ['NORMALIZED', 'REJECTED', 'QUARANTINED'],
  NORMALIZED: ['QUARANTINED'],       // a normalized record can still be quarantined (e.g. dedup)
  REJECTED: [],
  QUARANTINED: ['VALIDATED', 'NORMALIZED', 'REJECTED'], // may be released after review
});

function makeIngestionRecord(input) {
  if (!input || !input.ingestion_id) throw new Error('makeIngestionRecord: ingestion_id required');
  if (!input.raw_source_hash) throw new Error('makeIngestionRecord: raw_source_hash required');
  const status = input.status || 'RECEIVED';
  if (!INGESTION_STATUS.includes(status)) throw new Error(`bad ingestion status "${status}"`);
  const rec = {
    schema_version: INGEST_SCHEMA_VERSION,
    ingestion_id: String(input.ingestion_id),
    raw_source_hash: String(input.raw_source_hash),
    source_id: input.source_id != null ? String(input.source_id) : null,
    adapter_id: input.adapter_id != null ? String(input.adapter_id) : null,
    adapter_version: input.adapter_version != null ? String(input.adapter_version) : null,
    received_at: input.received_at != null ? String(input.received_at) : null,
    processed_at: input.processed_at != null ? String(input.processed_at) : null,
    status,
    errors: Array.isArray(input.errors) ? input.errors.map(String) : [],
    warnings: Array.isArray(input.warnings) ? input.warnings.map(String) : [],
  };
  rec.content_hash = 'ing_' + sha256Hex(canonicalize({ ...rec, content_hash: undefined }));
  return deepFreeze(rec);
}

// Return a NEW record with an advanced status (append-only; the prior record stays valid).
function advance(record, toStatus, patch = {}) {
  const from = record.status;
  if (!(TRANSITIONS[from] || []).includes(toStatus)) throw new Error(`[ASTRA-11C] illegal ingestion transition ${from} -> ${toStatus}`);
  return makeIngestionRecord({
    ...record,
    status: toStatus,
    processed_at: patch.processed_at || record.processed_at,
    errors: patch.errors ? [...record.errors, ...patch.errors] : record.errors,
    warnings: patch.warnings ? [...record.warnings, ...patch.warnings] : record.warnings,
  });
}

module.exports = { INGESTION_STATUS, TRANSITIONS, makeIngestionRecord, advance };
