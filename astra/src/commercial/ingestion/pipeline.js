'use strict';
// [ASTRA-11C] The deterministic ingestion + normalization pipeline (spec pipeline diagram + §N, §O).
//   RAW -> ADAPTER -> INGESTION RECORD -> NORMALIZATION -> EVIDENCE EXTRACTION -> PROVENANCE
//        -> DEDUPLICATION -> QUALITY -> EVIDENCE BATCH
// Fail-closed: anything unusable becomes REJECTED / QUARANTINED with reasons — never dropped.
// Idempotent: identical raw input + adapter/schema versions -> identical hashes, and is
// recognized as ALREADY_INGESTED.
// No LLM, no web, no I/O, no clock (referenceTime is caller-supplied).
const { makeRawSourceEnvelope, validateRawSourceEnvelope, SOURCE_CATEGORIES } = require('./raw_source');
const { makeIngestionRecord, advance } = require('./ingestion_record');
const { pickAdapter } = require('./fake_adapters');
const { makeNormalizedObservation } = require('../normalization/normalized_observation');
const { assessSourceQuality } = require('../evidence/source_quality');
const { freshness } = require('../evidence/temporal');
const { dedupeBatch } = require('../evidence/dedup');
const { makeEvidenceBatch } = require('../evidence/evidence_batch');
const { checkProviderNeutral } = require('./provider_neutrality');

// A tiny in-memory idempotency ledger (a real store is an ASTRA-11C+ concern).
class IngestionLedger {
  constructor() { this.seen = new Map(); } // raw_source_hash -> { ingestion_id, batch_id }
  has(h) { return this.seen.has(h); }
  get(h) { return this.seen.get(h); }
  record(h, info) { if (!this.seen.has(h)) this.seen.set(h, info); }
}

// ingest({ rawInputs, adapter?, referenceTime, batch_id, ledger?, qualitySignals? })
// rawInputs: array of provider-shaped payloads (each must carry source_id, evidence_ref).
function ingest(opts) {
  const { rawInputs, referenceTime, batch_id } = opts;
  if (!referenceTime) throw new Error('[ASTRA-11C] ingest: referenceTime is required (no implicit clock)');
  if (!batch_id) throw new Error('[ASTRA-11C] ingest: batch_id is required');
  const ledger = opts.ledger || new IngestionLedger();
  const qualitySignals = opts.qualitySignals || {};

  const envelopes = [], observations = [], ingestion_records = [];
  const rejected = [], quarantined = [], already = [];

  let seq = 0;
  for (const raw of rawInputs) {
    seq += 1;
    const ingestion_id = `${batch_id}::${seq}`;
    const received_at = referenceTime;

    // ---- envelope ----
    const envInput = {
      source_id: raw.source_id, source_category: raw.source_category || (opts.adapter && opts.adapter.source_category),
      provider: raw.provider || raw.provider_hint || null, external_id: raw.external_id || null,
      uri: raw.uri || null, captured_at: raw.captured_at || referenceTime,
      published_at: raw.published_at || raw.first_seen || raw.created_at || null,
      observation_start: raw.observation_start || null, observation_end: raw.observation_end || null,
      locale: raw.locale || null, language: raw.lang || raw.language || null,
      raw_payload: raw, raw_content: typeof raw.raw_content === 'string' ? raw.raw_content : null,
      metadata: raw.metadata || null, ingestion_id,
    };
    const ev = validateRawSourceEnvelope(envInput);
    if (!ev.valid) {
      const rec = makeIngestionRecord({ ingestion_id, raw_source_hash: 'rsh_invalid_' + seq, source_id: raw.source_id || null, received_at, processed_at: referenceTime, status: 'REJECTED', errors: ev.errors });
      ingestion_records.push(rec); rejected.push({ ingestion_id, reason: ev.errors });
      continue;
    }
    if (!SOURCE_CATEGORIES.includes(envInput.source_category)) {
      const rec = makeIngestionRecord({ ingestion_id, raw_source_hash: 'rsh_badcat_' + seq, source_id: raw.source_id, received_at, processed_at: referenceTime, status: 'REJECTED', errors: [`unsupported source_category "${envInput.source_category}"`] });
      ingestion_records.push(rec); rejected.push({ ingestion_id, reason: rec.errors });
      continue;
    }
    const envelope = makeRawSourceEnvelope(envInput);

    // ---- idempotency ----
    if (ledger.has(envelope.raw_source_hash)) {
      already.push({ ingestion_id, raw_source_hash: envelope.raw_source_hash, first_seen: ledger.get(envelope.raw_source_hash) });
      const rec = makeIngestionRecord({ ingestion_id, raw_source_hash: envelope.raw_source_hash, source_id: raw.source_id, received_at, processed_at: referenceTime, status: 'QUARANTINED', warnings: ['ALREADY_INGESTED'] });
      ingestion_records.push(rec); quarantined.push({ ingestion_id, reason: ['ALREADY_INGESTED'] });
      envelopes.push(envelope);
      continue;
    }

    // ---- adapter ----
    const ad = opts.adapter || pickAdapter(raw);
    let rec = makeIngestionRecord({ ingestion_id, raw_source_hash: envelope.raw_source_hash, source_id: raw.source_id, adapter_id: ad && ad.adapter_id, adapter_version: ad && ad.adapter_version, received_at, status: 'RECEIVED' });
    if (!ad) {
      rec = advance(rec, 'REJECTED', { processed_at: referenceTime, errors: ['no adapter matched this raw input'] });
      ingestion_records.push(rec); rejected.push({ ingestion_id, reason: rec.errors }); envelopes.push(envelope);
      continue;
    }
    const av = ad.validate(raw);
    if (!av.valid) {
      rec = advance(rec, 'REJECTED', { processed_at: referenceTime, errors: av.errors });
      ingestion_records.push(rec); rejected.push({ ingestion_id, reason: rec.errors }); envelopes.push(envelope);
      continue;
    }
    rec = advance(rec, 'VALIDATED', { processed_at: referenceTime });

    // ---- extraction + normalization + provenance + quality ----
    let specs;
    try { specs = ad.extract(raw); }
    catch (e) { rec = advance(rec, 'QUARANTINED', { processed_at: referenceTime, errors: ['adapter extract threw: ' + e.message] }); ingestion_records.push(rec); quarantined.push({ ingestion_id, reason: rec.errors }); envelopes.push(envelope); continue; }

    const neutralMeta = ad.normalizeMetadata(raw) || {};
    const metaLeak = checkProviderNeutral(neutralMeta);
    if (!metaLeak.neutral) {
      rec = advance(rec, 'QUARANTINED', { processed_at: referenceTime, errors: ['adapter metadata leaked provider payload: ' + metaLeak.leaks.join('; ')] });
      ingestion_records.push(rec); quarantined.push({ ingestion_id, reason: rec.errors }); envelopes.push(envelope); continue;
    }

    let anyBad = false;
    for (const spec of specs) {
      const rq = freshness(spec.temporal || require('../evidence/temporal').makeTemporal({ capture_time: envelope.captured_at }), referenceTime);
      const quality = assessSourceQuality({
        source_category: envelope.source_category,
        signals: {
          ...qualitySignals,
          timestamp_available: !!(spec.temporal && (spec.temporal.event_time || spec.temporal.publication_time)),
          recency_band: rq.freshness_band,
          subject_match: spec.subject && spec.subject.state === 'RESOLVED' ? 0.9 : 0.5,
        },
      });
      try {
        const obs = makeNormalizedObservation({
          observation_type: spec.observation_type,
          subject: spec.subject,
          content: spec.content || null,
          verbatim: spec.verbatim || null,
          numeric: spec.numeric || null,
          structured_values: spec.structured_values || {},
          source_ref: envelope.source_id,
          temporal: spec.temporal || null,
          language: spec.language || envelope.language,
          locale: envelope.locale,
          provenance_class: spec.provenance_class || 'OBSERVED',
          evidence_refs: spec.evidence_refs || (raw.evidence_ref ? [raw.evidence_ref] : []),
          quality,
        });
        observations.push({ ...structForBatch(obs, envelope), _full: obs });
      } catch (e) {
        anyBad = true;
        rec = advance(rec.status === 'VALIDATED' ? rec : makeIngestionRecord({ ...rec, status: 'VALIDATED' }), 'QUARANTINED', { processed_at: referenceTime, errors: ['observation build failed: ' + e.message] });
      }
    }
    if (anyBad) { ingestion_records.push(rec); quarantined.push({ ingestion_id, reason: rec.errors }); envelopes.push(envelope); continue; }

    rec = advance(rec, 'NORMALIZED', { processed_at: referenceTime });
    ingestion_records.push(rec);
    ledger.record(envelope.raw_source_hash, { ingestion_id, batch_id });
    envelopes.push(envelope);
  }

  // ---- deduplication over the normalized observations ----
  const dedupeItems = observations.map(o => ({
    key: o._full.content_hash,
    raw_source_hash: o.raw_source_hash,
    provider: o.provider, external_id: o.external_id,
    canonical_content_hash: o._full.canonical_content_hash,
    normalized_content_hash: o._full.normalized_content_hash,
  }));
  const dedupe = dedupeBatch(dedupeItems);

  const fullObs = observations.map(o => o._full);
  const batch = makeEvidenceBatch({
    batch_id,
    envelopes,
    observations: fullObs,
    ingestion_records,
    duplicates: { possible_duplicates: dedupe.possible_duplicates, duplicate_member_count: dedupe.duplicate_member_count, groups: dedupe.groups.length },
    warnings: [...quarantined.map(q => `QUARANTINED ${q.ingestion_id}`), ...already.map(a => `ALREADY_INGESTED ${a.ingestion_id}`)],
  });

  return {
    batch,
    envelopes,
    observations: fullObs,
    ingestion_records,
    dedupe,
    rejected,
    quarantined,
    already_ingested: already,
    ledger,
  };
}

function structForBatch(obs, envelope) {
  return {
    raw_source_hash: envelope.raw_source_hash,
    provider: envelope.provider,
    external_id: envelope.external_id,
  };
}

module.exports = { ingest, IngestionLedger };
