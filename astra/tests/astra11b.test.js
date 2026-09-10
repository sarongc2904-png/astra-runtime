'use strict';
// ASTRA-11B — Unified Commercial Data Model. Offline deterministic validation ONLY.
// No network, no LLM, no production database. Node built-ins + assert.
const assert = require('assert');
const UCDM = require('../src/commercial');
const { pv, makeSource, makeEvidenceReference, UNKNOWN, isUnknown, SOURCE_CLASSES } = UCDM.provenance;
const { validateEntity } = UCDM;
const { makeVersion, verifyVersion, supersede, detectConflict } = UCDM.versioning;
const EL = UCDM.experimentLifecycle;

let pass = 0, fail = 0; const fails = [];
const tests = [];
function t(name, fn) { tests.push({ name, fn }); }

// ---- shared fixtures -------------------------------------------------------
function graphWith(refIds) {
  const g = new UCDM.EvidenceGraph();
  g.addSource(makeSource({ source_id: 'src_reviews', source_type: 'REVIEW_EXPORT', system: 'user-upload', ingested_at: '2026-09-01T00:00:00Z', content: 'a pile of reviews' }));
  for (const r of refIds) g.addReference(makeEvidenceReference({ ref_id: r, source_id: 'src_reviews', quote: 'está demasiado caro' }));
  return g;
}
const OBS = (value, refs, extra = {}) => pv(value, 'OBSERVED', { evidence_refs: refs, ...extra });
const CMP = (value, mod) => pv(value, 'COMPUTED', { produced_by: 'deterministic:ucdm/' + mod, transform: 'deterministic:ucdm/' + mod });
const INF = (value, refs = []) => pv(value, 'INFERRED', { evidence_refs: refs });

function validVoC(refs) {
  return {
    business_ref: 'ent_biz1', voc_slug: 'precio-alto',
    exact_phrase: OBS('está demasiado caro', refs),
    aspect: 'OBJECTION',
    normalized_theme: INF('price objection', refs),
    frequency_bucket: CMP(7, 'voc_cluster'),
    evidence_refs: refs,
  };
}

// ===== 1 =====
t('valid canonical entity passes structural + provenance + evidence validation', () => {
  const g = graphWith(['r1', 'r2']);
  const r = validateEntity('VoiceOfCustomerObservation', validVoC(['r1', 'r2']), { evidenceGraph: g });
  assert(r.valid, r.errors.join(' | '));
  assert.strictEqual(r.schema_version, UCDM.SCHEMA_VERSION);
});

// ===== 2 =====
t('invalid evidence reference fails closed', () => {
  const g = graphWith(['r1']); // r_missing NOT added
  const r = validateEntity('VoiceOfCustomerObservation', validVoC(['r1', 'r_missing']), { evidenceGraph: g });
  assert(!r.valid);
  assert(r.errors.some(e => /r_missing/.test(e) && /fail closed/i.test(e)), r.errors.join(' | '));
});

// ===== 3 =====
t('unsupported provenance class is rejected', () => {
  assert.throws(() => pv('x', 'GUESSED'), /unsupported provenance class/);
  const bad = { value: 'x', source_class: 'GUESSED', evidence_refs: [], content_hash: 'deadbeef' };
  const r = validateEntity('Persona', { business_ref: 'ent_biz1', persona_slug: 'p1', name: 'P', narrative: bad });
  assert(!r.valid && r.errors.some(e => /narrative/.test(e)));
});

// ===== 4 =====
t('LLM-authored number rejected as canonical metric', () => {
  const body = { business_ref: 'ent_biz1', market_slug: 'm1', category: INF('SaaS for clinics'), tam_value: INF(4200000) };
  const r = validateEntity('Market', body);
  assert(!r.valid);
  assert(r.errors.some(e => /tam_value/.test(e) && /INFERRED/.test(e)), r.errors.join(' | '));
});

// ===== 5 =====
t('COMPUTED deterministic number accepted as canonical metric', () => {
  const body = { business_ref: 'ent_biz1', market_slug: 'm1', category: INF('SaaS for clinics'), tam_value: CMP(4200000, 'market_sizing') };
  const r = validateEntity('Market', body);
  assert(r.valid, r.errors.join(' | '));
});
t('a COMPUTED metric that names a non-deterministic producer is rejected', () => {
  const body = { business_ref: 'ent_biz1', market_slug: 'm1', category: INF('x'), tam_value: pv(1, 'COMPUTED', { produced_by: 'llm:market-node' }) };
  const r = validateEntity('Market', body);
  assert(!r.valid && r.errors.some(e => /deterministic producer/.test(e)));
});

// ===== 6 =====
t('missing optional persona evidence produces UNKNOWN, not invention', () => {
  const minimal = { business_ref: 'ent_biz1', persona_slug: 'owner', name: 'Clinic owner', ability_to_pay: UNKNOWN };
  const r = validateEntity('Persona', minimal);
  assert(r.valid, r.errors.join(' | '));
  assert(isUnknown(minimal.ability_to_pay));
  // absent optional field is also fine
  const r2 = validateEntity('Persona', { business_ref: 'ent_biz1', persona_slug: 'owner', name: 'Clinic owner' });
  assert(r2.valid, r2.errors.join(' | '));
});
t('a required identity field cannot be UNKNOWN', () => {
  const r = validateEntity('Persona', { business_ref: UNKNOWN, persona_slug: 'p', name: 'x' });
  assert(!r.valid && r.errors.some(e => /business_ref/.test(e)));
});

// ===== 7 =====
t('entity version is immutable (deep-frozen analytical snapshot)', () => {
  const g = graphWith(['r1']);
  const v = makeVersion('VoiceOfCustomerObservation', validVoC(['r1']), { effective_at: '2026-09-01T00:00:00Z', evidenceGraph: g });
  assert(Object.isFrozen(v) && Object.isFrozen(v.body) && Object.isFrozen(v._meta));
  assert.throws(() => { v.body.voc_slug = 'hacked'; }, TypeError);
  assert.throws(() => { v._meta.version_id = 'x'; }, TypeError);
});

// ===== 8 =====
t('content hash + version id are stable and key-order independent', () => {
  const g = graphWith(['r1']);
  const a = makeVersion('VoiceOfCustomerObservation', validVoC(['r1']), { effective_at: '2026-09-01T00:00:00Z', evidenceGraph: g });
  const b = makeVersion('VoiceOfCustomerObservation', validVoC(['r1']), { effective_at: '2026-09-01T00:00:00Z', evidenceGraph: g });
  assert.strictEqual(a._meta.content_hash, b._meta.content_hash);
  assert.strictEqual(a._meta.version_id, b._meta.version_id);
  assert.strictEqual(a._meta.entity_id, b._meta.entity_id);
  // reordered keys -> same content hash
  const reordered = {}; const src = validVoC(['r1']);
  for (const k of Object.keys(src).reverse()) reordered[k] = src[k];
  const c = makeVersion('VoiceOfCustomerObservation', reordered, { effective_at: '2026-09-01T00:00:00Z', evidenceGraph: g });
  assert.strictEqual(a._meta.content_hash, c._meta.content_hash);
  assert(verifyVersion(a).valid);
});

// ===== 9 =====
t('customer journey supports configurable per-business stages', () => {
  const ok = validateEntity('CustomerJourney', { business_ref: 'ent_biz1', journey_slug: 'j1', stages: ['descubrimiento', 'evaluacion', 'compra', 'onboarding'] });
  assert(ok.valid, ok.errors.join(' | '));
  const dup = validateEntity('CustomerJourney', { business_ref: 'ent_biz1', journey_slug: 'j2', stages: ['a', 'a', 'b'] });
  assert(!dup.valid && dup.errors.some(e => /unique/.test(e)));
  const empty = validateEntity('CustomerJourney', { business_ref: 'ent_biz1', journey_slug: 'j3', stages: [] });
  assert(!empty.valid);
});

// ===== 10 =====
t('funnel transition math is deterministic and consistency-checked', () => {
  const { transition, consistency } = UCDM.funnelMath.computeTransition({ from_stage: 'lead', to_stage: 'appointment', entered: 200, exited: 50, cost: 400, window: '2026-08' });
  assert(consistency.valid);
  assert.strictEqual(transition.conversion_rate.value, 0.25);
  assert.strictEqual(transition.dropoff_rate.value, 0.75);
  assert.strictEqual(transition.conversion_rate.source_class, 'COMPUTED');
  assert.throws(() => UCDM.funnelMath.computeTransition({ entered: 10, exited: 25 }), /impossible transition/);
  const bad = UCDM.funnelMath.checkConsistency({ entered: 100, exited: 10, conversion_rate: 0.5, dropoff_rate: 0.9 });
  assert(!bad.valid);
  // stored FunnelTransition entity with LLM-authored conversion_rate is rejected
  const ft = {
    funnel_ref: 'ent_f1', from_stage: 'lead', to_stage: 'appointment', observation_window: '2026-08',
    entered: CMP(200, 'funnel_math'), exited: CMP(50, 'funnel_math'),
    conversion_rate: INF(0.25), dropoff_rate: CMP(0.75, 'funnel_math'),
  };
  const r = validateEntity('FunnelTransition', ft);
  assert(!r.valid && r.errors.some(e => /conversion_rate/.test(e)));
});

// ===== 11 =====
t('recommendation evidence integrity is deterministic and fail-closed', () => {
  const g = graphWith(['e1', 'e2']);
  g.registerEntity('ent_insight1', 'Insight', { evidence_refs: ['e1'] });
  const priority = UCDM.recommendation.computePriority({ impact: 'HIGH', effort: 'LOW', severity: 'HIGH', confidence_score: 0.8 });
  const rec = {
    business_ref: 'ent_biz1', recommendation_slug: 'fix-lead-to-appt',
    problem: INF('lead→appointment conversion is the bottleneck', ['e1']),
    severity: 'HIGH', insight_refs: ['ent_insight1'], evidence_refs: ['e1', 'e2'],
    recommendation_text: INF('Add a same-day booking link in the first reply.'),
    confidence: { kind: 'ConfidenceAssessment', score: 0.8, band: 'HIGH' },
    impact: 'HIGH', effort: 'LOW', priority, status: 'PROPOSED',
  };
  const good = UCDM.recommendation.validateRecommendationIntegrity(rec, { evidenceGraph: g });
  assert(good.valid, good.errors.join(' | '));

  const bad = UCDM.recommendation.validateRecommendationIntegrity({ ...rec, evidence_refs: ['e1', 'e_missing'] }, { evidenceGraph: g });
  assert(!bad.valid && bad.errors.some(e => /e_missing/.test(e)));

  const llmPriority = UCDM.recommendation.validateRecommendationIntegrity({ ...rec, priority: INF(99) }, { evidenceGraph: g });
  assert(!llmPriority.valid && llmPriority.errors.some(e => /priority must be a COMPUTED/.test(e)));
});

// ===== 12 =====
t('experiment lifecycle transitions are validated', () => {
  let e = { experiment_id: 'x1', problem: 'p', hypothesis: 'h', variable: 'headline', primary_metric: 'cr', state: 'PROPOSED' };
  e = EL.transition(e, 'APPROVED');
  e = EL.transition(e, 'RUNNING', { start_at: '2026-08-01' });
  assert.throws(() => EL.transition(e, 'PROPOSED'), /illegal transition/);
  assert.throws(() => EL.transition(e, 'COMPLETED', { end_at: '2026-08-15' }), /must carry a decision/);
  e = EL.transition(e, 'COMPLETED', { end_at: '2026-08-15', decision: 'KEEP', result: { lift: 0.1 }, learning_ref: 'ent_learn1' });
  assert.strictEqual(e.state, 'COMPLETED');
  const v = EL.validateExperiment(e);
  assert(v.valid, v.errors.join(' | '));
  const rej = EL.transition({ ...{ experiment_id: 'x2', problem: 'p', hypothesis: 'h', variable: 'v', primary_metric: 'm', state: 'PROPOSED' } }, 'REJECT');
  assert.strictEqual(rej.decision, 'REJECT');
});

// ===== 13 =====
t('business learning preserves full traceability', () => {
  const good = {
    learning_id: 'l1', what_was_tried: 'same-day booking link', why: 'reduce friction',
    context: { segment: 'new leads', offer: 'consult', creative_or_message: 'first reply', when: '2026-08' },
    result: 'no change', learning: 'friction was not the bottleneck; price was',
    experiment_ref: 'ent_exp1', evidence_refs: ['e1'], confidence: { score: 0.6, band: 'MEDIUM' },
  };
  assert(EL.validateBusinessLearning(good).valid, EL.validateBusinessLearning(good).errors.join(' | '));
  const bad = { ...good, context: { offer: 'consult', creative_or_message: 'x', when: '2026-08' } }; // no segment
  assert(!EL.validateBusinessLearning(bad).valid);
  const bad2 = { ...good, evidence_refs: [] };
  assert(!EL.validateBusinessLearning(bad2).valid);
});

// ===== 14 =====
t('confidence assessment is deterministic and structured (no LLM value)', () => {
  const signals = { evidence_count: 6, distinct_sources: 3, newest_evidence_age_days: 20, aspects_with_evidence: 4, aspects_total: 5, agree_count: 5, conflict_count: 1, data_quality: 0.7 };
  const a = UCDM.confidence.assess(signals);
  const b = UCDM.confidence.assess({ ...signals });
  assert.strictEqual(a.content_hash, b.content_hash);
  assert.strictEqual(a.score, b.score);
  assert(a.score > 0 && a.score < 1);
  assert(['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'].includes(a.band));
  assert(Array.isArray(a.reason_codes) && a.reason_codes.length > 0);
  assert.strictEqual(a.produced_by, 'deterministic:ucdm/confidence');
  const weak = UCDM.confidence.assess({ evidence_count: 1, distinct_sources: 1, newest_evidence_age_days: 300, coverage: 0.2, agree_count: 1, conflict_count: 2, data_quality: 0.3 });
  assert(weak.score < a.score);
  assert(weak.reason_codes.includes('EVIDENCE_CONFLICT'));
});

// ===== 15 =====
t('provider-specific payload cannot leak directly into canonical schema', () => {
  const base = { business_ref: 'ent_biz1', campaign_slug: 'c1', name: 'Q4 leads', channel_ref: 'ent_ch1' };
  const leak1 = validateEntity('Campaign', { ...base, meta_campaign_id: '238471' });
  assert(!leak1.valid && leak1.errors.some(e => /provider-coupled/.test(e)), leak1.errors.join(' | '));
  const leak2 = validateEntity('Campaign', { ...base, whatsapp_thread: { id: 'x' } });
  assert(!leak2.valid && leak2.errors.some(e => /provider-coupled|unknown field/.test(e)));
  const leak3 = validateEntity('Lead', { business_ref: 'ent_biz1', lead_key: 'k1', created_at: '2026-08-01', ga4_client_id: 'abc' });
  assert(!leak3.valid && leak3.errors.some(e => /provider-coupled/.test(e)));
  // a plain unknown (non-provider) field is also rejected (fail closed)
  const unk = validateEntity('Campaign', { ...base, foo: 1 });
  assert(!unk.valid && unk.errors.some(e => /unknown field "foo"/.test(e)));
});

// ===== extra: registry integrity =====
t('registry: all canonical entities load, are provider-neutral, and are well-formed', () => {
  const names = UCDM.entities.entityNames();
  const REQUIRED = ['Business', 'Market', 'MarketObservation', 'Competitor', 'Segment', 'Persona', 'ICP',
    'VoiceOfCustomerObservation', 'JTBD', 'CustomerJourney', 'CustomerJourneyStage', 'Positioning', 'Offer',
    'Product', 'Channel', 'Campaign', 'Creative', 'Lead', 'Conversation', 'Appointment', 'Opportunity', 'Sale',
    'RevenueEvent', 'RetentionEvent', 'UpsellEvent', 'Funnel', 'FunnelStage', 'FunnelTransition', 'Metric',
    'Experiment', 'ExperimentResult', 'Insight', 'Recommendation', 'Evidence', 'EvidenceReference', 'Source',
    'Provenance', 'ConfidenceAssessment', 'BusinessLearning'];
  for (const req of REQUIRED) assert(names.includes(req), 'missing required canonical entity: ' + req);
  assert(names.length >= REQUIRED.length, 'expected the full catalog, got ' + names.length);
  for (const n of names) {
    const def = UCDM.entities.ENTITIES[n];
    assert(Array.isArray(def.natural_key) && def.natural_key.length >= 1, n + ' missing natural_key');
    assert(def.fields && Object.keys(def.fields).length >= 1, n + ' missing fields');
    assert(['ANALYTICAL_SNAPSHOT', 'OPERATIONAL_STATE'].includes(def.kind), n + ' bad kind');
    for (const k of def.natural_key) assert(k in def.fields, n + ' natural key ' + k + ' not a declared field');
    for (const f of Object.keys(def.fields)) assert(!UCDM.entities.PROVIDER_COUPLED.test(f), n + '.' + f + ' provider-coupled');
  }
});

t('versioning: supersede builds append-only lineage; detectConflict surfaces divergence', () => {
  const g = graphWith(['r1', 'r2']);
  const v1 = makeVersion('VoiceOfCustomerObservation', validVoC(['r1']), { effective_at: '2026-09-01T00:00:00Z', evidenceGraph: g });
  const nextBody = { ...validVoC(['r1', 'r2']), normalized_theme: INF('price + value objection', ['r1', 'r2']) };
  const v2 = supersede(v1, nextBody, { effective_at: '2026-09-05T00:00:00Z', evidenceGraph: g, reason: 'more evidence' });
  assert.strictEqual(v2._meta.supersedes, v1._meta.version_id);
  assert.strictEqual(v2._meta.entity_id, v1._meta.entity_id);
  assert.notStrictEqual(v2._meta.version_id, v1._meta.version_id);
  assert.strictEqual(detectConflict(v1, v2).conflict, false); // linear supersession
  // an independent divergent version (does not supersede v1) -> conflict surfaced
  const vDiv = makeVersion('VoiceOfCustomerObservation', { ...validVoC(['r1']), normalized_theme: INF('trust objection', ['r1']) }, { effective_at: '2026-09-05T00:00:00Z', evidenceGraph: g });
  const c = detectConflict(v1, vDiv);
  assert(c.conflict && c.status === 'OPEN', JSON.stringify(c));
});

t('evidence graph trace walks Recommendation -> ... -> Source, fail-closed', () => {
  const g = graphWith(['e1', 'e2']);
  g.registerEntity('ent_src_persona', 'Persona', { evidence_refs: ['e1'] });
  g.registerEntity('ent_insight1', 'Insight', { evidence_refs: ['e2'], derived_from: ['ent_src_persona'] });
  g.registerEntity('ent_rec1', 'Recommendation', { evidence_refs: [], derived_from: ['ent_insight1'] });
  const tr = g.trace('ent_rec1');
  assert.deepStrictEqual(tr.root_source_ids, ['src_reviews']);
  assert(tr.path.some(p => p.entity_type === 'Persona'));
  g.registerEntity('ent_broken', 'Recommendation', { evidence_refs: ['e_missing'] });
  assert.throws(() => g.trace('ent_broken'), /unresolved evidence reference|fail closed/i);
});

t('numeric integrity: a bare number is not a canonical metric without provenance', () => {
  const r = validateEntity('Sale', { business_ref: 'ent_biz1', sale_key: 's1', occurred_at: '2026-08-01', amount: 500, currency: 'MXN' });
  assert(!r.valid && r.errors.some(e => /amount/.test(e) && /ProvenanceValue/.test(e)));
  const ok = validateEntity('Sale', { business_ref: 'ent_biz1', sale_key: 's1', occurred_at: '2026-08-01', amount: OBS(500, ['r1']), currency: 'MXN' }, { evidenceGraph: graphWith(['r1']) });
  assert(ok.valid, ok.errors.join(' | '));
});

(async () => {
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log('PASS', name); }
    catch (e) { fail++; fails.push(name + ' :: ' + (e && e.message)); console.log('FAIL', name, '::', e && e.message); }
  }
  console.log(`\nASTRA11B_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) { console.log('FAILURES:\n' + fails.join('\n')); process.exit(1); }
})();
