'use strict';
// ASTRA-11C — Evidence Ingestion & Normalization. Offline deterministic tests ONLY.
// No network, no LLM, no production database. Node built-ins + assert.
const assert = require('assert');
const I = require('../src/commercial/ingestion');
const { makeRawSourceEnvelope, validateRawSourceEnvelope, SOURCE_CATEGORIES } = I.rawSource;
const { makeVerbatim, verifyVerbatim, renormalize } = I.verbatim;
const { makeNormalizedObservation, OBSERVATION_TYPES } = I.normalizedObservation;
const { makeNumericObservation } = I.numericObservation;
const { assertProviderNeutral, checkProviderNeutral } = I.providerNeutrality;
const { classifyPair, dedupeBatch } = I.dedup;
const { assessSourceQuality } = I.sourceQuality;
const { makeTemporal, freshness } = I.temporal;
const { makeSubjectRef, validateSubjectRef } = I.subjectResolution;
const { buildRedactionPlan, applyRedaction, classifyValue } = I.redaction;
const { makeEvidenceBatch } = I.evidenceBatch;
const { makeIngestionRecord, advance } = I.ingestionRecord;
const { ingest } = I.pipeline;

let pass = 0, fail = 0; const fails = [];
const tests = [];
function t(n, fn) { tests.push({ n, fn }); }

const REF = '2026-09-09T00:00:00Z';
function reviewRaw(over = {}) {
  return {
    provider_hint: 'google_reviews', source_id: over.source_id || 's_rev1', source_category: 'REVIEW',
    review_text: over.review_text != null ? over.review_text : 'Pregunté precio y nunca me respondieron.',
    rating: over.rating != null ? over.rating : 2, lang: 'es',
    created_at: '2026-08-01T10:00:00Z', captured_at: '2026-09-01T00:00:00Z',
    evidence_ref: over.evidence_ref || 'r_rev1', ...over,
  };
}

// ===== 1 =====
t('valid raw source ingestion produces a NORMALIZED record + observations', () => {
  const out = ingest({ rawInputs: [reviewRaw()], referenceTime: REF, batch_id: 'B1' });
  assert.strictEqual(out.rejected.length, 0);
  assert(out.observations.length >= 1);
  assert(out.ingestion_records.some(r => r.status === 'NORMALIZED'));
  assert.strictEqual(out.batch.source_count, 1);
});

// ===== 2 =====
t('unsupported source category is rejected (not silently dropped)', () => {
  const bad = { provider_hint: 'x', source_id: 's_bad', source_category: 'META_AD', review_text: 'hi', evidence_ref: 'r' };
  const out = ingest({ rawInputs: [bad], referenceTime: REF, batch_id: 'B2' });
  assert.strictEqual(out.observations.length, 0);
  assert.strictEqual(out.rejected.length, 1);
  const rec = out.ingestion_records.find(r => r.status === 'REJECTED');
  assert(rec && rec.errors.some(e => /unsupported source_category/.test(e)));
  // direct envelope validation
  assert(!validateRawSourceEnvelope({ source_id: 'x', source_category: 'WHATSAPP_MESSAGE', captured_at: REF }).valid);
  assert(!SOURCE_CATEGORIES.includes('STRIPE_TRANSACTION'));
});

// ===== 3 =====
t('exact verbatim quote is preserved byte-for-byte', () => {
  const original = '  Pregunté   precio\ty NUNCA\r\n me respondieron.  ';
  const vb = makeVerbatim({ verbatim_text: original, language: 'es', actor: 'customer' });
  assert.strictEqual(vb.verbatim_text, original, 'verbatim must be stored exactly as given');
  assert(verifyVerbatim(vb).valid);
});

// ===== 4 =====
t('normalization never overwrites verbatim', () => {
  const original = '  Hola   MUNDO  ';
  const vb = makeVerbatim({ verbatim_text: original });
  assert.notStrictEqual(vb.normalized_text, vb.verbatim_text);
  assert.strictEqual(vb.normalized_text, 'Hola MUNDO');
  const re = renormalize(vb);
  assert.strictEqual(re.verbatim_text, original); // still exact after re-normalization
});

// ===== 5 =====
t('provider-specific payload is removed at the adapter boundary', () => {
  const out = ingest({
    rawInputs: [{ provider_hint: 'meta_ads', source_id: 's_ad', source_category: 'ADVERTISEMENT', ad_creative_body: 'El más rápido del mercado', first_seen: '2026-08-01T00:00:00Z', captured_at: '2026-09-01T00:00:00Z', ad_id: '238471', page_id: 'p9', objective: 'LEADS', evidence_ref: 'r_ad' }],
    referenceTime: REF, batch_id: 'B5',
  });
  assert(out.observations.length >= 1);
  for (const o of out.observations) {
    assertProviderNeutral(o); // throws if ad_id / page_id / etc leaked
    assert(!JSON.stringify(o).match(/238471|page_id|"ad_id"/));
  }
  // and the boundary guard itself
  assert.throws(() => assertProviderNeutral({ structured_values: { meta_ad_id: 'x' } }), /leaked/);
});

// ===== 6 =====
t('source provenance is preserved through normalization', () => {
  const out = ingest({ rawInputs: [reviewRaw()], referenceTime: REF, batch_id: 'B6' });
  const o = out.observations[0];
  assert.strictEqual(o.provenance.source_class, 'OBSERVED');
  assert(o.provenance.evidence_refs.includes('r_rev1'));
  assert.strictEqual(o.source_ref, 's_rev1');
  assert(o.quality && o.quality.produced_by === 'deterministic:ucdm/source_quality');
});

// ===== 7 =====
t('content hash is deterministic and reproducible', () => {
  const a = ingest({ rawInputs: [reviewRaw()], referenceTime: REF, batch_id: 'B7' });
  const b = ingest({ rawInputs: [reviewRaw()], referenceTime: REF, batch_id: 'B7' });
  assert.strictEqual(a.batch.content_hash, b.batch.content_hash);
  assert.strictEqual(a.observations[0].content_hash, b.observations[0].content_hash);
});

// ===== 8 =====
t('repeated ingestion is idempotent and recognized as ALREADY_INGESTED', () => {
  const ledger = new I.pipeline.IngestionLedger();
  const first = ingest({ rawInputs: [reviewRaw()], referenceTime: REF, batch_id: 'B8', ledger });
  assert.strictEqual(first.already_ingested.length, 0);
  const second = ingest({ rawInputs: [reviewRaw()], referenceTime: REF, batch_id: 'B8b', ledger });
  assert.strictEqual(second.already_ingested.length, 1);
  assert(second.ingestion_records.some(r => r.status === 'QUARANTINED' && r.warnings.includes('ALREADY_INGESTED')));
  assert.strictEqual(second.observations.length, 0);
});

// ===== 9 =====
t('exact duplicate is detected (identical raw_source_hash)', () => {
  const out = ingest({ rawInputs: [reviewRaw(), reviewRaw()], referenceTime: REF, batch_id: 'B9' });
  // second identical raw -> ALREADY_INGESTED within the same batch
  assert.strictEqual(out.already_ingested.length, 1);
  const c = classifyPair(
    { raw_source_hash: 'h1', canonical_content_hash: 'x', normalized_content_hash: 'y' },
    { raw_source_hash: 'h1', canonical_content_hash: 'z', normalized_content_hash: 'w' });
  assert.strictEqual(c.result, 'EXACT_DUPLICATE');
});

// ===== 10 =====
t('content duplicate is detected (same verbatim, different source)', () => {
  const c = classifyPair(
    { raw_source_hash: 'hA', provider: 'google_reviews', external_id: 'e1', canonical_content_hash: 'CCH', normalized_content_hash: 'n1' },
    { raw_source_hash: 'hB', provider: 'google_reviews', external_id: 'e2', canonical_content_hash: 'CCH', normalized_content_hash: 'n2' });
  assert.strictEqual(c.result, 'CONTENT_DUPLICATE');
});

// ===== 11 =====
t('source duplicate is detected (same provider + external_id)', () => {
  const c = classifyPair(
    { raw_source_hash: 'hA', provider: 'crm', external_id: 'lead_9', canonical_content_hash: 'x1', normalized_content_hash: 'n1' },
    { raw_source_hash: 'hB', provider: 'crm', external_id: 'lead_9', canonical_content_hash: 'x2', normalized_content_hash: 'n2' });
  assert.strictEqual(c.result, 'SOURCE_DUPLICATE');
});

// ===== 12 =====
t('POSSIBLE_DUPLICATE is flagged and NEVER silently merged', () => {
  const items = [
    { key: 'k1', raw_source_hash: 'hA', canonical_content_hash: 'c1', normalized_content_hash: 'NORM' },
    { key: 'k2', raw_source_hash: 'hB', canonical_content_hash: 'c2', normalized_content_hash: 'NORM' },
  ];
  const d = dedupeBatch(items);
  assert(d.possible_duplicates.length >= 1);
  assert.strictEqual(d.groups.length, 2, 'possible duplicates must remain distinct groups');
  assert(d.pairs.some(p => p.result === 'POSSIBLE_DUPLICATE'));
});

// ===== 13 =====
t('source quality separates attestation from veracity_support', () => {
  const q = assessSourceQuality({ source_category: 'REVIEW', signals: { completeness: 0.9, extractability: 0.9, directness: 0.9, subject_match: 0.9, timestamp_available: true, recency_band: 'FRESH', authenticity_status: 'PLAUSIBLE', measurement_precision: 0.5 } });
  assert(q.attestation > q.veracity_support, 'a review supports "was said" more than "is true"');
  assert(q.reason_codes.includes('OPINION_SOURCE_LIMITS_VERACITY'));
  const qt = assessSourceQuality({ source_category: 'TRANSACTION', signals: { completeness: 0.9, extractability: 0.9, directness: 0.9, subject_match: 0.9, timestamp_available: true, recency_band: 'FRESH', authenticity_status: 'VERIFIED', measurement_precision: 0.95 } });
  assert(qt.veracity_support > q.veracity_support, 'first-party transaction can support truth more than a review');
});

// ===== 14 =====
t('numeric observation integrates ASTRA-11B numeric integrity', () => {
  const ok = makeNumericObservation({ value: 4.5, unit: 'star', source_class: 'OBSERVED', evidence_refs: ['r1'], aggregation: 'RAW' });
  assert.strictEqual(ok.value, 4.5);
  assert.strictEqual(ok.unit, 'STAR');
  assert.strictEqual(ok.is_canonical_metric, true);
  assert.throws(() => makeNumericObservation({ value: 99, source_class: 'INFERRED', evidence_refs: ['r1'] }), /INFERRED number is a TEXT observation/);
  assert.throws(() => makeNumericObservation({ value: 1, source_class: 'COMPUTED', produced_by: 'llm:node' }), /deterministic producer/);
  assert.throws(() => makeNumericObservation({ value: 'lots', source_class: 'OBSERVED', evidence_refs: ['r1'] }), /not a finite number/);
});

// ===== 15 =====
t('unit/currency normalization is metadata-only (no FX, no conversion)', () => {
  const n = makeNumericObservation({ value: 150, unit: 'currency', currency: 'MX$', source_class: 'USER_PROVIDED', aggregation: 'RAW' });
  assert.strictEqual(n.currency, 'MXN');
  assert.strictEqual(n.value, 150, 'value must be untouched — no conversion');
  const p = makeNumericObservation({ value: 0.25, unit: '%', source_class: 'COMPUTED', produced_by: 'deterministic:ucdm/funnel_math', aggregation: 'RATE' });
  assert.strictEqual(p.unit, 'PERCENT');
});

// ===== 16 =====
t('temporal model: freshness needs a caller reference time (no implicit clock)', () => {
  const tm = makeTemporal({ event_time: '2026-06-01T00:00:00Z', publication_time: '2026-06-02T00:00:00Z', capture_time: '2026-08-01T00:00:00Z', ingestion_time: REF });
  const f = freshness(tm, '2026-09-09T00:00:00Z');
  assert.strictEqual(f.age_days_by_kind.event_time, 100);
  assert.strictEqual(f.effective_age_days, 100);
  assert.strictEqual(f.freshness_band, 'AGING'); // 90 < 100 <= 365
  assert.strictEqual(freshness(makeTemporal({ event_time: '2024-01-01T00:00:00Z' }), REF).freshness_band, 'STALE');
  assert.throws(() => freshness(tm), /reference/i);
  assert.throws(() => makeTemporal({ event_time: 'not-a-date' }), /invalid event_time/);
});

// ===== 17 =====
t('subject resolution: explicit only, ambiguity stays AMBIGUOUS', () => {
  assert.strictEqual(makeSubjectRef({ subject_type: 'Lead', subject_id: 'ent_lead1' }).state, 'RESOLVED');
  assert.strictEqual(makeSubjectRef({ subject_type: 'Persona' }).state, 'UNRESOLVED');
  const amb = makeSubjectRef({ subject_type: 'Persona', candidates: ['p1', 'p2'] });
  assert.strictEqual(amb.state, 'AMBIGUOUS');
  assert.strictEqual(amb.subject_id, null);
  assert(validateSubjectRef(amb).valid);
  assert.strictEqual(makeSubjectRef({}).resolution_method, 'EXPLICIT_ONLY');
});

// ===== 18 =====
t('claim vs observation: a CLAIM observation records "the source asserted X", not an insight', () => {
  const vb = makeVerbatim({ verbatim_text: 'Somos los más rápidos del mercado', actor: 'advertiser' });
  const obs = makeNormalizedObservation({ observation_type: 'CLAIM', verbatim: vb, source_ref: 's_ad', provenance_class: 'OBSERVED', evidence_refs: ['r_ad'], subject: makeSubjectRef({ subject_type: 'Offer' }) });
  assert.strictEqual(obs.observation_type, 'CLAIM');
  assert.strictEqual(obs.verbatim.verbatim_text, 'Somos los más rápidos del mercado');
  assert(!('insight' in obs) && !('recommendation' in obs), 'ASTRA-11C does not emit insights/claims-as-truth');
  assert(OBSERVATION_TYPES.includes('CLAIM') && !OBSERVATION_TYPES.includes('INSIGHT'));
});

// ===== 19 =====
t('redaction contract: deterministic classification + shape-preserving mask (hook only)', () => {
  const obj = { note: 'contact me at test@example.com or +10000000000', account: 'account_12345' };
  const { plan, plan_hash } = buildRedactionPlan(obj, { markedFields: { '$.name': 'NAME' } });
  assert(plan.some(p => p.class === 'EMAIL') && plan.some(p => p.class === 'PHONE') && plan.some(p => p.class === 'ACCOUNT_IDENTIFIER'));
  const again = buildRedactionPlan(obj, { markedFields: { '$.name': 'NAME' } });
  assert.strictEqual(plan_hash, again.plan_hash);
  const { redacted } = applyRedaction(obj, plan);
  assert(!/test@example\.com/.test(JSON.stringify(redacted)));
  assert(!/\+10000000000/.test(JSON.stringify(redacted)));
  assert.deepStrictEqual(classifyValue('no pii here'), []);
});

// ===== 20 =====
t('evidence batch is reproducible from identical input', () => {
  const a = ingest({ rawInputs: [reviewRaw({ source_id: 'q1', evidence_ref: 'rq1' }), reviewRaw({ source_id: 'q2', evidence_ref: 'rq2', review_text: 'Excelente servicio' })], referenceTime: REF, batch_id: 'BB' });
  const b = ingest({ rawInputs: [reviewRaw({ source_id: 'q2', evidence_ref: 'rq2', review_text: 'Excelente servicio' }), reviewRaw({ source_id: 'q1', evidence_ref: 'rq1' })], referenceTime: REF, batch_id: 'BB' });
  assert.strictEqual(a.batch.content_hash, b.batch.content_hash, 'batch hash must be order-independent');
  assert.strictEqual(a.batch.observation_count, b.batch.observation_count);
});

// ===== 21 =====
t('fail closed: dangling / malformed inputs are rejected or quarantined, never dropped', () => {
  const inputs = [
    reviewRaw({ source_id: 'g1', evidence_ref: 'rg1' }),
    { provider_hint: 'google_reviews', source_id: 'g2', source_category: 'REVIEW', review_text: '', evidence_ref: 'rg2' }, // adapter validate fails
    { provider_hint: 'unknown_thing', source_id: 'g3', source_category: 'OTHER', blob: 1 }, // no adapter
    { source_id: 'g4', source_category: 'REVIEW' }, // missing captured_at -> envelope adds it, but no adapter/text
  ];
  const out = ingest({ rawInputs: inputs, referenceTime: REF, batch_id: 'BF' });
  const statuses = out.ingestion_records.map(r => r.status);
  assert.strictEqual(statuses.filter(s => s === 'REJECTED').length + statuses.filter(s => s === 'QUARANTINED').length, 3);
  assert(out.ingestion_records.length === 4, 'every input has a record — nothing silently dropped');
  assert(out.batch.rejected_count + out.batch.quarantined_count === 3);
});

// ===== 22 =====
t('ingestion record is immutable and transitions are legal-only', () => {
  const rec = makeIngestionRecord({ ingestion_id: 'i1', raw_source_hash: 'rsh_x', status: 'RECEIVED' });
  assert(Object.isFrozen(rec));
  assert.throws(() => { rec.status = 'NORMALIZED'; }, TypeError);
  const v = advance(rec, 'VALIDATED', { processed_at: REF });
  assert.strictEqual(v.status, 'VALIDATED');
  assert.throws(() => advance(v, 'RECEIVED'), /illegal ingestion transition/);
  assert.throws(() => advance(makeIngestionRecord({ ingestion_id: 'i2', raw_source_hash: 'y', status: 'REJECTED' }), 'NORMALIZED'), /illegal/);
});

// ===== 23 =====
t('envelope keeps raw provider payload but downstream observations do not', () => {
  const raw = { provider_hint: 'whatsapp', source_id: 's_wa', source_category: 'CONVERSATION', messages: [{ from: 'customer', text: 'Cuánto cuesta?', ts: '2026-08-10T00:00:00Z' }, { from: 'agent', text: '...', ts: '2026-08-10T00:01:00Z' }], wa_id: '5215555', wamid: 'ABC', captured_at: '2026-09-01T00:00:00Z', evidence_ref: 'r_wa' };
  const out = ingest({ rawInputs: [raw], referenceTime: REF, batch_id: 'BW' });
  assert(JSON.stringify(out.envelopes[0].raw_payload).includes('wamid'), 'envelope legitimately retains the raw payload');
  for (const o of out.observations) {
    assert(!/wamid|wa_id|5215555/.test(JSON.stringify({ t: o.observation_type, v: o.verbatim, s: o.structured_values, subj: o.subject })));
  }
});

// ===== 24 =====
t('numeric observation is emitted from a transaction adapter, canonical + provenanced', () => {
  const out = ingest({ rawInputs: [{ provider_hint: 'payments', source_id: 's_tx', source_category: 'TRANSACTION', amount_minor: 249900, currency: 'usd', kind: 'new', created_at: '2026-08-20T00:00:00Z', captured_at: '2026-09-01T00:00:00Z', evidence_ref: 'r_tx' }], referenceTime: REF, batch_id: 'BT' });
  const m = out.observations.find(o => o.observation_type === 'TRANSACTION');
  assert(m && m.numeric.value === 2499 && m.numeric.currency === 'USD');
  assert.strictEqual(m.numeric.provenance.source_class, 'OBSERVED');
  assert.strictEqual(m.numeric.is_canonical_metric, true);
});

// ===== 25 =====
t('schema versions surfaced on the batch; ingest schema is ucdm-ingest-1.0.0, downstream target ucdm-1.0.0', () => {
  const out = ingest({ rawInputs: [reviewRaw()], referenceTime: REF, batch_id: 'BV' });
  assert(out.batch.schema_versions.includes('ucdm-ingest-1.0.0'));
  assert.strictEqual(I.INGEST_SCHEMA_VERSION, 'ucdm-ingest-1.0.0');
  assert.strictEqual(I.UCDM_SCHEMA_VERSION, 'ucdm-1.0.0');
});

(async () => {
  for (const { n, fn } of tests) {
    try { await fn(); pass++; console.log('PASS', n); }
    catch (e) { fail++; fails.push(n + ' :: ' + (e && e.message)); console.log('FAIL', n, '::', e && e.message); }
  }
  console.log(`\nASTRA11C_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) { console.log('FAILURES:\n' + fails.join('\n')); process.exit(1); }
})();
