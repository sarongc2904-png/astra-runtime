'use strict';
// ASTRA-11F — Voice of Customer Engine. Explicit W1..W50 + compatibility/security coverage.
// Offline deterministic ONLY. No network, no LLM, no production DB.
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const R = require('../src/commercial/research');
const VOC = require('../src/commercial/voc');
const FX = require('../benchmarks/astra11f/fixtures');
const { mockPlanner } = require('../benchmarks/astra11d/llm_planner');

let pass = 0, fail = 0; const fails = []; const covered = {};
function W(id, name, fn) { covered[id] = true; try { fn(); pass++; console.log('PASS', id, name); } catch (e) { fail++; fails.push(`${id} ${name} :: ${e && e.message}`); console.log('FAIL', id, name, '::', e && e.message); } }

const REF = FX.REFERENCE_TIME;
function research(spec, id) {
  const request = R.request.makeMarketResearchRequest(spec.request);
  const plan = mockPlanner.plan(request);
  const provider = R.sourceProvider.makeFixtureProvider({ provider_id: 'fix.' + id, records: spec.records });
  return R.engine.runMarketResearch({ request, plan, providers: [provider], referenceTime: REF, batch_id: 'WF_' + id });
}
function voc(spec, id, extra = {}) {
  return VOC.engine.runVoiceOfCustomer({ researchResult: research(spec, id), referenceTime: REF, speakerHints: spec.speakerHints || {}, ...extra });
}
const dental = () => voc(FX.VERTICALS.dental_clinic, 'dental');

// ---- W1..W10 ----
W('W1', 'customer-authored evidence accepted', () => { const o = dental(); assert(o.utterances.length >= 8 && o.utterances.every(u => ['CUSTOMER', 'PROSPECT', 'FORMER_CUSTOMER', 'UNKNOWN_CUSTOMER_ROLE'].includes(u.speaker_role))); });
W('W2', 'business marketing copy rejected as VOC', () => { const o = voc(FX.ADVERSARIAL.business_copy_mixed, 'W2'); assert(o.excludedNonVoc.some(e => e.speaker_role === 'BUSINESS')); assert(!o.utterances.some(u => u.speaker_role === 'BUSINESS')); });
W('W3', 'competitor copy rejected as VOC', () => { const o = voc(FX.ADVERSARIAL.competitor_copy_mixed, 'W3'); assert(o.excludedNonVoc.some(e => e.speaker_role === 'COMPETITOR')); });
W('W4', 'unknown speaker preserved', () => { const o = voc(FX.ADVERSARIAL.unknown_speaker, 'W4'); assert(o.utterances.every(u => u.speaker_role === 'UNKNOWN_CUSTOMER_ROLE')); assert(o.observations.every(x => x.status === 'ANALYTICAL')); });
W('W5', 'verbatim immutable', () => { const o = dental(); const u = o.utterances[0]; assert.throws(() => { u.verbatim_text = 'x'; }, TypeError); assert(VOC.utterance.verifyUtterance(u).valid); });
W('W6', 'normalized text additive', () => {
  const spec = { request: { business_ref: 'w6', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' }, records: [{ provider_hint: 'research_review', source_category: 'REVIEW', source_id: 'w6r', evidence_ref: 'e_w6', review_text: '  Muy   caro  y   lento  ', rating: 2, lang: 'es', created_at: '2026-08-10T00:00:00Z', captured_at: '2026-09-01T00:00:00Z' }] };
  const o = voc(spec, 'W6'); const u = o.utterances[0];
  assert.strictEqual(u.verbatim_text, '  Muy   caro  y   lento  ');
  assert.strictEqual(u.normalized_text, 'Muy caro y lento');
});
W('W7', 'controlled aspect taxonomy', () => { const o = dental(); for (const x of o.observations) assert(VOC.taxonomy.VOC_ASPECTS.includes(x.aspect)); assert.strictEqual(VOC.taxonomy.ASPECT_TAXONOMY_VERSION, 'voc-aspect-v1'); });
W('W8', 'UNKNOWN aspect allowed', () => { assert(VOC.taxonomy.VOC_ASPECTS.includes('UNKNOWN')); const o = voc(FX.ADVERSARIAL.sarcasm, 'W8'); assert(o.observations.some(x => x.aspect === 'UNKNOWN')); });
W('W9', 'observation evidence required', () => { const o = dental(); for (const x of o.observations) assert(x.evidence_refs.length > 0); assert(!VOC.observation.validateObservation({ aspect: 'PAIN', status: 'OBSERVED', evidence_refs: [] }).valid); });
W('W10', 'exact span grounded', () => { const o = voc(FX.ADVERSARIAL.multi_aspect_sentence, 'W10'); for (const x of o.observations) { assert(x.exact_span && x.exact_span.text.length > 0); assert.strictEqual(x.span_matches_verbatim, true); } const full = o.utterances[0].verbatim_text; assert(o.observations.some(x => x.exact_span.text.length < full.length)); });

// ---- W11..W20 ----
W('W11', 'multi-aspect statement preserved', () => { const o = voc(FX.ADVERSARIAL.multi_aspect_sentence, 'W11'); const obs = o.observations.filter(x => x.status === 'OBSERVED'); assert(new Set(obs.map(x => x.aspect)).size >= 3); });
W('W12', 'separate evidence spans preserved', () => { const o = voc(FX.ADVERSARIAL.multi_aspect_sentence, 'W12'); const spans = o.observations.filter(x => x.status === 'OBSERVED').map(x => `${x.exact_span.start}-${x.exact_span.end}`); assert.strictEqual(new Set(spans).size, spans.length); });
W('W13', 'negation preserved', () => { const o = voc(FX.ADVERSARIAL.negation, 'W13'); assert(o.observations.some(x => x.negated === true)); });
W('W14', '"not expensive" not mapped to price objection', () => { const o = voc(FX.ADVERSARIAL.negation, 'W14'); assert(!o.observations.some(x => x.aspect === 'OBJECTION' && x.normalized_concept === 'PRICE_CONCERN')); assert(o.observations.some(x => x.normalized_concept === 'PRICE_ACCEPTANCE')); });
W('W15', 'prior fear vs actual experience distinguished', () => {
  const spec = { request: { business_ref: 'w15', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' }, speakerHints: { w15r: { speaker_ref: 's15' } }, records: [{ provider_hint: 'research_review', source_category: 'REVIEW', source_id: 'w15r', evidence_ref: 'e_w15', review_text: 'Pensé que dolería pero no dolió nada.', rating: 5, lang: 'es', created_at: '2026-08-10T00:00:00Z', captured_at: '2026-09-01T00:00:00Z' }] };
  const o = voc(spec, 'W15');
  assert(o.observations.some(x => x.prior_experience === true && x.aspect === 'FEAR'));
  assert(o.observations.some(x => x.normalized_concept === 'PAIN_EXPERIENCED' && x.polarity === 'POSITIVE'));
});
W('W16', 'customer question preserved verbatim', () => {
  const spec = { request: { business_ref: 'w16', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' }, records: [{ provider_hint: 'research_review', source_category: 'REVIEW', source_id: 'w16r', evidence_ref: 'e_w16', review_text: '¿Cuánto cuesta el paquete completo?', rating: 4, lang: 'es', created_at: '2026-08-10T00:00:00Z', captured_at: '2026-09-01T00:00:00Z' }] };
  const o = voc(spec, 'W16'); assert(o.questions.length === 1); assert.strictEqual(o.questions[0].verbatim_question, '¿Cuánto cuesta el paquete completo?');
});
W('W17', 'question taxonomy controlled', () => { const o = dental(); for (const q of o.questions) { assert(VOC.taxonomy.QUESTION_TYPES.includes(q.question_type)); assert.strictEqual(q.question_taxonomy_version, 'voc-question-v1'); } });
W('W18', 'alternative observed with evidence', () => { const o = voc(FX.ADVERSARIAL.customer_mentions_competitor, 'W18'); assert(o.alternatives.length >= 1 && o.alternatives.every(a => a.evidence_refs.length > 0 && a.grounded_in_evidence)); });
W('W19', 'unresolved competitor mention stays unresolved', () => { const o = voc(FX.ADVERSARIAL.customer_mentions_competitor, 'W19'); const alt = o.alternatives.find(a => a.alternative_type === 'competitor'); assert(alt && !alt.resolved_competitor_id); assert(VOC.alternativesTriggersCriteria.validateAlternative(alt).valid); });
W('W20', 'purchase trigger requires evidence', () => {
  const spec = { request: { business_ref: 'w20', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' }, records: [{ provider_hint: 'research_review', source_category: 'REVIEW', source_id: 'w20r', evidence_ref: 'e_w20', review_text: 'El dolor empeoró y ya no aguanté más.', rating: 4, lang: 'es', created_at: '2026-08-10T00:00:00Z', captured_at: '2026-09-01T00:00:00Z' }] };
  const o = voc(spec, 'W20'); assert(o.triggers.some(t => t.trigger_type === 'pain_worsened')); for (const t of o.triggers) assert(t.evidence_refs.length > 0 && t.grounded_in_evidence);
});

// ---- W21..W30 ----
W('W21', 'decision criterion requires evidence', () => { const o = dental(); for (const c of o.criteria) assert(c.evidence_refs.length > 0 && VOC.taxonomy.DECISION_CRITERIA.includes(c.criterion)); });
W('W22', 'no demographic inference', () => {
  const o = dental();
  // no observation / pattern / insight carries an inferred demographic attribute
  const blob = JSON.stringify({ obs: o.observations, patterns: o.patterns, insights: o.insights, clusters: o.clusters });
  assert(!/"(age|age_group|gender|genero|género|income|income_bracket|ethnicity|marital_status)"\s*:/i.test(blob));
  assert.strictEqual(o.segmentComparison.status, 'INSUFFICIENT_SEGMENT_REFS');
  assert(o.segmentComparison.note.includes('no demographic inference'));
});
W('W23', 'controlled normalization versioned', () => { const o = dental(); for (const x of o.observations) assert.strictEqual(x.concept_map_version, 'voc-concept-v1'); assert(VOC.taxonomy.CANONICAL_CONCEPTS.includes('PRICE_CONCERN')); });
W('W24', 'linguistic variants preserved', () => {
  const spec = { request: { business_ref: 'w24', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' }, speakerHints: { a: { speaker_ref: 'a' }, b: { speaker_ref: 'b' }, c: { speaker_ref: 'c' } }, records: [
    { provider_hint: 'research_review', source_category: 'REVIEW', source_id: 'a', evidence_ref: 'ea', review_text: 'Está muy caro.', rating: 2, lang: 'es', created_at: '2026-08-10T00:00:00Z', captured_at: '2026-09-01T00:00:00Z' },
    { provider_hint: 'research_review', source_category: 'REVIEW', source_id: 'b', evidence_ref: 'eb', review_text: 'Se me hace caro.', rating: 2, lang: 'es', created_at: '2026-08-10T00:00:00Z', captured_at: '2026-09-01T00:00:00Z' },
    { provider_hint: 'research_review', source_category: 'REVIEW', source_id: 'c', evidence_ref: 'ec', review_text: 'Está costoso para lo que es.', rating: 2, lang: 'es', created_at: '2026-08-10T00:00:00Z', captured_at: '2026-09-01T00:00:00Z' },
  ] };
  const o = voc(spec, 'W24');
  const cluster = o.clusters.find(c => c.canonical_concept === 'PRICE_CONCERN');
  const bl = o.buyingLanguage.library.OBJECTION;
  assert(cluster && cluster.observation_refs.length === 3);
  assert(bl.top_phrases.length >= 2, 'distinct surface phrases retained');
});
W('W25', 'deterministic cluster', () => { const a = dental(), b = dental(); assert.deepStrictEqual(a.clusters.map(c => c.cluster_id), b.clusters.map(c => c.cluster_id)); for (const c of a.clusters) assert.strictEqual(c.method, 'deterministic-taxonomy'); });
W('W26', 'cluster evidence refs valid', () => { const o = dental(); const evSet = new Set(o.observations.flatMap(x => x.evidence_refs)); for (const c of o.clusters) assert(VOC.clustering.validateCluster(c, evSet).valid); });
W('W27', 'duplicate evidence does not inflate frequency', () => { const o = voc(FX.ADVERSARIAL.duplicate_reviews, 'W27'); assert(o.completion.reason_codes.includes('DUPLICATE_HEAVY')); for (const c of o.clusters) assert(c.frequency.deduped_observation_count <= c.frequency.observation_count); });
W('W28', 'unique speaker count separated from observation count', () => { const o = dental(); for (const c of o.clusters) assert('unique_speaker_count' in c.frequency && 'observation_count' in c.frequency); });
W('W29', 'repeated speaker does not imply independent prevalence', () => { const o = voc(FX.ADVERSARIAL.same_customer_repeated, 'W29'); const c = o.clusters.find(x => x.canonical_concept === 'PRICE_CONCERN'); assert(c.frequency.unique_speaker_count === 1); assert(/1 unique observed speaker/.test(c.frequency.denominator_note)); });
W('W30', 'denominator discipline enforced', () => {
  const o = voc(FX.ADVERSARIAL.same_customer_repeated, 'W30');
  // no CLAIM of the form "<number>% of customers" anywhere (the guardrail warning text is allowed)
  const claims = JSON.stringify(o.insights) + JSON.stringify(o.report.sections.top_pains) + JSON.stringify(o.patterns);
  assert(!/\d+\s*%\s*(of|de)\s*(customers|clientes)/i.test(claims));
  for (const c of o.clusters) assert(/speakers|observations|sources/.test(c.frequency.denominator_note));
  for (const i of o.insights) assert(/observations across \d+ sources|unique observed speaker/.test(i.statement));
});

// ---- W31..W40 ----
W('W31', 'coverage deterministic', () => { const a = dental(), b = dental(); assert.strictEqual(a.coverage.coverage_id, b.coverage.coverage_id); });
W('W32', 'source diversity represented', () => { const o = dental(); assert('source_type_diversity' in o.coverage && Array.isArray(o.coverage.source_types)); });
W('W33', 'segment UNKNOWN allowed', () => { const o = dental(); assert(o.utterances.every(u => u.segment_ref === null)); assert.strictEqual(o.segmentComparison.status, 'INSUFFICIENT_SEGMENT_REFS'); });
W('W34', 'segment comparison only on explicit refs', () => {
  const spec = FX.VERTICALS.dental_clinic;
  const hints = { ...spec.speakerHints, d1: { ...spec.speakerHints.d1, segment_ref: 'NEW' }, d2: { ...spec.speakerHints.d2, segment_ref: 'NEW' }, d8: { ...spec.speakerHints.d8, segment_ref: 'EXISTING' }, d9: { ...spec.speakerHints.d9, segment_ref: 'EXISTING' } };
  const o = VOC.engine.runVoiceOfCustomer({ researchResult: research(spec, 'W34'), referenceTime: REF, speakerHints: hints });
  assert.strictEqual(o.segmentComparison.status, 'OK'); assert(o.segmentComparison.segments.includes('NEW') && o.segmentComparison.segments.includes('EXISTING'));
});
W('W35', 'journey stage not silently inferred', () => { const o = dental(); assert(o.observations.every(x => x.journey_stage_ref === null)); assert.strictEqual(o.journeyComparison.status, 'INSUFFICIENT_STAGE_REFS'); });
W('W36', 'journey UNKNOWN allowed', () => { const o = dental(); assert(o.coverage.journey_stage_coverage.count === 0); assert(o.report.section_names.includes('journey_stage_differences')); });
W('W37', 'contradiction preserved', () => { const o = voc(FX.ADVERSARIAL.conflicting_opinions, 'W37'); assert(o.contradictions.some(c => ['POLARIZED', 'MIXED', 'CONSENSUS'].includes(c.status))); });
W('W38', 'polarization represented', () => { const o = voc(FX.ADVERSARIAL.conflicting_opinions, 'W38'); assert(o.contradictions.some(c => c.status === 'POLARIZED' || c.status === 'MIXED')); assert(o.contradictions.some(c => c.kind === 'CROSS_CONCEPT')); });
W('W39', 'representative quote is actual verbatim', () => { const o = dental(); for (const c of o.clusters) for (const q of c.representative_quotes) { assert.strictEqual(q.quote_kind, 'VERBATIM_QUOTE'); const u = o.utterances.find(x => x.verbatim_hash === q.verbatim_hash); if (u) assert(u.verbatim_text.includes(q.verbatim_text)); } });
W('W40', 'paraphrase cannot masquerade as quote', () => { const o = dental(); for (const c of o.clusters) for (const q of c.representative_quotes) assert.strictEqual(q.is_paraphrase, false); assert(!VOC.clustering.validateCluster({ method: 'deterministic-taxonomy', representative_quotes: [{ quote_kind: 'PARAPHRASED_SUMMARY', is_paraphrase: true, evidence_refs: [] }] }).valid); });

// ---- W41..W50 ----
W('W41', 'pattern evidence valid', () => { const o = dental(); const obsIds = new Set(o.observations.map(x => x.observation_id)); for (const p of o.patterns) for (const oid of p.supporting_observations) assert(obsIds.has(oid)); });
W('W42', 'customer insight marked analytical', () => { const o = dental(); for (const i of o.insights) { assert.strictEqual(i.is_fact, false); assert.strictEqual(i.statement_source, 'deterministic:ucdm/voc'); } });
W('W43', 'insight cannot become fact', () => { assert(!VOC.patternInsight.validateInsight({ is_fact: true, is_recommendation: false, statement_source: 'deterministic:ucdm/voc', supporting_pattern_refs: ['x'] }).valid); });
W('W44', 'buying language contains exact customer phrases', () => { const o = dental(); const bl = o.buyingLanguage.library; const someSection = Object.values(bl).find(s => s.top_phrases); assert(someSection && someSection.top_phrases.every(p => p.evidence_refs.length > 0)); });
W('W45', 'no generated marketing copy in buying library', () => { const o = dental(); for (const s of Object.values(o.buyingLanguage.library)) if (s.top_phrases) assert.strictEqual(s.contains_generated_copy, false); });
W('W46', 'completion deterministic', () => { const a = dental(), b = dental(); assert.strictEqual(a.completion.completion_id, b.completion.completion_id); assert(VOC.coverage.COMPLETION_STATUS.includes(a.completion.status)); });
W('W47', 'low speaker coverage produces reason', () => { const o = voc(FX.ADVERSARIAL.very_small_sample, 'W47'); assert(o.completion.reason_codes.includes('LOW_SPEAKER_COUNT') || o.completion.reason_codes.includes('LOW_SOURCE_COUNT')); });
W('W48', 'duplicate-heavy evidence produces reason', () => { const o = voc(FX.ADVERSARIAL.duplicate_reviews, 'W48'); assert(o.completion.reason_codes.includes('DUPLICATE_HEAVY')); });
W('W49', 'report evidence graph valid', () => { const o = dental(); assert.strictEqual(o.report.evidence_graph_valid, true); assert.deepStrictEqual(o.report.evidence_graph_errors, []); assert(o.report.sections.evidence_appendix.count > 0); });
W('W50', 'no production routing / autonomous action', () => { const o = dental(); assert(o.report.caveats.some(c => /production routing or autonomous action/.test(c))); assert(o.provenance_note.includes('No production routing') && o.provenance_note.includes('No autonomous action')); });

// ---- compatibility / security ----
W('C1', 'ASTRA-11B compatibility', () => { const o = dental(); assert.strictEqual(VOC.UCDM_SCHEMA_VERSION, 'ucdm-1.0.0'); for (const x of o.observations) assert.strictEqual(x.confidence.produced_by, 'deterministic:ucdm/confidence'); });
W('C2', 'ASTRA-11C compatibility', () => { assert.strictEqual(VOC.INGEST_SCHEMA_VERSION, 'ucdm-ingest-1.0.0'); const o = dental(); assert.strictEqual(o.report.downstream_schema_versions.ingest, 'ucdm-ingest-1.0.0'); });
W('C3', 'ASTRA-11D compatibility', () => { assert.strictEqual(VOC.RESEARCH_SCHEMA_VERSION, 'ucdm-research-1.0.0'); });
W('C4', 'ASTRA-11E compatibility', () => { assert.strictEqual(VOC.COMPETITOR_SCHEMA_VERSION, 'ucdm-competitor-1.0.0'); const o = dental(); assert.strictEqual(o.report.downstream_schema_versions.competitor, 'ucdm-competitor-1.0.0'); });
W('C5', 'privacy: redacted_display_text separate from immutable verbatim', () => {
  const spec = { request: { business_ref: 'c5', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' }, records: [{ provider_hint: 'research_review', source_category: 'REVIEW', source_id: 'c5r', evidence_ref: 'e_c5', review_text: 'Escríbanme a test@example.com, está caro.', rating: 2, lang: 'es', created_at: '2026-08-10T00:00:00Z', captured_at: '2026-09-01T00:00:00Z' }] };
  const o = voc(spec, 'C5'); const u = o.utterances[0];
  assert(u.verbatim_text.includes('test@example.com'));
  assert(!u.redacted_display_text.includes('test@example.com'));
  assert(u.redaction_manifest.length >= 1);
});
W('C6', 'no network dependency', () => { let src = ''; for (const f of fs.readdirSync(path.join(__dirname, '../src/commercial/voc'))) src += fs.readFileSync(path.join(__dirname, '../src/commercial/voc', f), 'utf8'); assert(!/require\(['"](http|https|net|dns|tls)['"]\)|fetch\(|XMLHttpRequest/.test(src)); });
W('C7', 'no production DB dependency', () => { for (const f of fs.readdirSync(path.join(__dirname, '../src/commercial/voc'))) { const s = fs.readFileSync(path.join(__dirname, '../src/commercial/voc', f), 'utf8'); assert(!/supabase|createClient|\bpg\b|mysql|mongodb/i.test(s)); } });
W('C8', 'ASTRA-10 freeze unchanged', () => { const f = JSON.parse(fs.readFileSync(path.join(__dirname, '../benchmarks/astra10ah/freeze.json'), 'utf8')); assert.strictEqual(f.harness_hash_sha256, '57305a9dee3f9130d8f913e28280d759e78c32cee5affb0ac8931a4da725d53d'); });
W('C9', 'stable hashes', () => { const a = dental(), b = dental(); assert.strictEqual(a.report.content_hash, b.report.content_hash); assert.strictEqual(a.buyingLanguage.library_id, b.buyingLanguage.library_id); });
W('C10', 'benchmark isolation', () => { const d = fs.readdirSync(path.join(__dirname, '../benchmarks/astra11f')); assert(d.includes('run_voc_benchmark.js') && d.includes('fixtures.js')); });

const missing = []; for (let i = 1; i <= 50; i++) if (!covered['W' + i]) missing.push('W' + i);
if (missing.length) { fail++; fails.push('W-matrix incomplete: ' + missing.join(', ')); console.log('FAIL W-matrix completeness ::', missing.join(', ')); }
else console.log('PASS W-matrix completeness (W1..W50 all have explicit test evidence)');

console.log(`\nASTRA11F_TEST_RESULT pass=${pass} fail=${fail}`);
if (fail) { console.log('FAILURES:\n' + fails.join('\n')); process.exit(1); }
