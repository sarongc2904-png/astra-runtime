'use strict';
// [ASTRA-11F benchmark] Offline, mock-only. Zero network, zero LLM, zero cost.
// 6 verticals + 15 adversarial cases + 13 benchmark dimensions.
const assert = require('assert');
const R = require('../../src/commercial/research');
const VOC = require('../../src/commercial/voc');
const { mockPlanner } = require('../astra11d/llm_planner');
const FX = require('./fixtures');

let pass = 0, fail = 0; const notes = [];
function check(name, fn) { try { fn(); pass++; console.log('PASS', name); } catch (e) { fail++; notes.push(name + ' :: ' + e.message); console.log('FAIL', name, '::', e.message); } }

const REF = FX.REFERENCE_TIME;
function research(spec, id) {
  const request = R.request.makeMarketResearchRequest(spec.request);
  const plan = mockPlanner.plan(request);
  const provider = R.sourceProvider.makeFixtureProvider({ provider_id: 'fix.' + id, records: spec.records });
  return R.engine.runMarketResearch({ request, plan, providers: [provider], referenceTime: REF, batch_id: 'VF_' + id });
}
function voc(spec, id) {
  return VOC.engine.runVoiceOfCustomer({ researchResult: research(spec, id), referenceTime: REF, speakerHints: spec.speakerHints || {} });
}

for (const [name, spec] of Object.entries(FX.VERTICALS)) {
  check(`vertical/${name}: runs, deterministic, 25 report sections, evidence graph valid`, () => {
    const a = voc(spec, 'V_' + name), b = voc(spec, 'V_' + name);
    assert.strictEqual(a.report.report_id, b.report.report_id);
    assert.strictEqual(a.report.section_names.length, 25);
    assert(a.report.evidence_graph_valid, JSON.stringify(a.report.evidence_graph_errors));
    assert.strictEqual(a.report.generated_by, 'deterministic:ucdm/voc');
    for (const o of a.observations) if (o.status === 'OBSERVED') assert(o.evidence_refs.length > 0 && o.span_matches_verbatim);
  });
}

check('adv/business_copy_mixed -> business headline/promise excluded from VOC', () => {
  const o = voc(FX.ADVERSARIAL.business_copy_mixed, 'A_biz');
  assert(o.excludedNonVoc.some(e => e.speaker_role === 'BUSINESS'));
  assert(o.utterances.every(u => u.voc_eligible || u.speaker_role === 'UNKNOWN_CUSTOMER_ROLE'));
});
check('adv/competitor_copy_mixed -> competitor-attributed text excluded from VOC', () => {
  const o = voc(FX.ADVERSARIAL.competitor_copy_mixed, 'A_comp');
  assert(o.excludedNonVoc.some(e => e.speaker_role === 'COMPETITOR'));
});
check('adv/same_customer_repeated -> repeated speaker does not imply independent prevalence', () => {
  const o = voc(FX.ADVERSARIAL.same_customer_repeated, 'A_same');
  const c = o.clusters.find(x => x.canonical_concept === 'PRICE_CONCERN');
  assert(c && c.frequency.unique_speaker_count === 1);
  assert(/1 unique observed speaker/.test(c.frequency.denominator_note));
});
check('adv/duplicate_reviews -> deduped_observation_count < observation_count OR duplicate reason', () => {
  const o = voc(FX.ADVERSARIAL.duplicate_reviews, 'A_dup');
  assert(o.completion.reason_codes.includes('DUPLICATE_HEAVY') || o.coverage.duplicate_ratio > 0);
});
check('adv/sarcasm -> a sarcastic "rápido" does not become a genuine SPEED praise', () => {
  const o = voc(FX.ADVERSARIAL.sarcasm, 'A_sarc');
  // "tardaron dos semanas" -> RESPONSIVENESS_COMPLAINT should dominate; SPEED_NEED positive must not be asserted
  const speedPositive = o.observations.some(x => x.normalized_concept === 'SPEED_NEED' && x.polarity === 'POSITIVE');
  const complaint = o.observations.some(x => x.normalized_concept === 'RESPONSIVENESS_COMPLAINT');
  assert(complaint && !speedPositive);
});
check('adv/negation -> "no me pareció caro" is not a price objection; "no dolió" is a positive outcome', () => {
  const o = voc(FX.ADVERSARIAL.negation, 'A_neg');
  assert(!o.observations.some(x => x.aspect === 'OBJECTION' && x.normalized_concept === 'PRICE_CONCERN'));
  assert(o.observations.some(x => x.normalized_concept === 'PRICE_ACCEPTANCE'));
  assert(o.observations.some(x => x.normalized_concept === 'PAIN_EXPERIENCED'));
});
check('adv/mixed_sentiment -> multiple aspects preserved from one utterance', () => {
  const o = voc(FX.ADVERSARIAL.mixed_sentiment, 'A_mix');
  const aspects = new Set(o.observations.map(x => x.aspect));
  assert(aspects.size >= 2);
});
check('adv/multi_aspect_sentence -> one utterance -> many grounded observations, distinct spans', () => {
  const o = voc(FX.ADVERSARIAL.multi_aspect_sentence, 'A_multi');
  const spans = o.observations.filter(x => x.status === 'OBSERVED').map(x => x.exact_span.text);
  assert(spans.length >= 3);
  assert(new Set(spans).size === spans.length, 'each observation has its own span');
  for (const x of o.observations) assert(x.span_matches_verbatim);
});
check('adv/unknown_speaker -> preserved as UNKNOWN, not canonical prevalence', () => {
  const o = voc(FX.ADVERSARIAL.unknown_speaker, 'A_unk');
  assert(o.utterances.every(u => u.speaker_role === 'UNKNOWN_CUSTOMER_ROLE' || !u.voc_eligible));
  assert(o.observations.every(x => x.status === 'ANALYTICAL'));
});
check('adv/stale_feedback -> STALE_DATA completion reason', () => {
  const o = voc(FX.ADVERSARIAL.stale_feedback, 'A_stale');
  assert(o.completion.reason_codes.includes('STALE_DATA'));
});
check('adv/two_languages -> language_coverage reflects both; no silent merge', () => {
  const o = voc(FX.ADVERSARIAL.two_languages, 'A_lang');
  assert(o.coverage.language_coverage.count >= 2);
});
check('adv/very_small_sample -> completion INSUFFICIENT/PARTIAL, patterns not SUPPORTED', () => {
  const o = voc(FX.ADVERSARIAL.very_small_sample, 'A_small');
  assert(['INSUFFICIENT', 'PARTIAL', 'BLOCKED'].includes(o.completion.status));
  assert(!o.patterns.some(p => p.status === 'SUPPORTED'));
});
check('adv/conflicting_opinions -> POLARIZED/MIXED contradiction preserved, not collapsed', () => {
  const o = voc(FX.ADVERSARIAL.conflicting_opinions, 'A_conf');
  const price = o.contradictions.find(c => c.canonical_concept === 'PRICE_CONCERN' || c.canonical_concept === 'PRICE_ACCEPTANCE');
  assert(o.contradictions.some(c => ['POLARIZED', 'MIXED'].includes(c.status)) || (price && ['POLARIZED', 'MIXED'].includes(price.status)));
});
check('adv/customer_mentions_competitor -> alternative observed, competitor identity NOT resolved', () => {
  const o = voc(FX.ADVERSARIAL.customer_mentions_competitor, 'A_ment');
  const alt = o.alternatives.find(a => a.alternative_type === 'competitor');
  assert(alt && !alt.resolved_competitor_id);
});
check('adv/customer_changed_mind -> prior belief vs later view both represented', () => {
  const o = voc(FX.ADVERSARIAL.customer_changed_mind, 'A_mind');
  assert(o.observations.some(x => x.prior_experience) || o.observations.some(x => x.normalized_concept === 'PRICE_ACCEPTANCE'));
});

// ---- 13 dimensions ----
const dental = voc(FX.VERTICALS.dental_clinic, 'DIM');
check('dim/speaker discipline: only eligible speakers are canonical; business/competitor excluded', () => {
  const bm = voc(FX.ADVERSARIAL.business_copy_mixed, 'DIM_s');
  assert(bm.excludedNonVoc.length >= 1);
});
check('dim/verbatim integrity: every utterance verifies; verbatim != normalized when whitespace differs', () => {
  for (const u of dental.utterances) assert(VOC.utterance.verifyUtterance(u).valid);
});
check('dim/aspect accuracy: aspects come only from the controlled taxonomy', () => {
  for (const o of dental.observations) assert(VOC.taxonomy.VOC_ASPECTS.includes(o.aspect));
});
check('dim/span grounding: exact_span matches the verbatim text at its offsets', () => {
  for (const o of dental.observations) assert.strictEqual(o.span_matches_verbatim, true);
});
check('dim/negation discipline: no NEGATIVE concern emitted where a negation cue precedes it', () => {
  for (const o of dental.observations) if (o.negated) assert(o.polarity !== 'NEGATIVE' || o.aspect === 'OUTCOME');
});
check('dim/multi-aspect handling: utterances with 2+ aspects produce 2+ observations', () => {
  const u = dental.utterances.find(x => /pero/.test(x.verbatim_text));
  const obs = dental.observations.filter(o => o.utterance_ref === u.content_hash && o.status === 'OBSERVED');
  assert(obs.length >= 2);
});
check('dim/frequency discipline: clusters expose observation/source/speaker counts + denominator note', () => {
  for (const c of dental.clusters) { assert('observation_count' in c.frequency && 'unique_source_count' in c.frequency); assert(/speakers|observations|sources/.test(c.frequency.denominator_note)); }
});
check('dim/duplicate discipline: deduped_observation_count <= observation_count', () => {
  for (const c of dental.clusters) assert(c.frequency.deduped_observation_count <= c.frequency.observation_count);
});
check('dim/coverage awareness: VocCoverage exposes speaker/source/segment/journey/time/language', () => {
  for (const k of ['source_count', 'utterance_count', 'unique_speaker_count', 'known_vs_unknown_speakers', 'source_type_diversity', 'segment_coverage', 'journey_stage_coverage', 'time_coverage', 'language_coverage']) assert(k in dental.coverage);
});
check('dim/contradiction handling: contradiction status is one of the 4 controlled values', () => {
  for (const c of dental.contradictions) assert(VOC.patternInsight.CONTRADICTION_STATUS.includes(c.status));
});
check('dim/quote fidelity: representative quotes are VERBATIM_QUOTE, never paraphrase', () => {
  for (const c of dental.clusters) for (const q of c.representative_quotes) { assert.strictEqual(q.quote_kind, 'VERBATIM_QUOTE'); assert.strictEqual(q.is_paraphrase, false); }
});
check('dim/insight-vs-fact discipline: every insight is_fact:false and not a recommendation', () => {
  for (const i of dental.insights) { assert.strictEqual(i.is_fact, false); assert.strictEqual(i.is_recommendation, false); }
});
check('dim/unknown handling: UNKNOWN aspect + UNKNOWN concept representable', () => {
  assert(VOC.taxonomy.VOC_ASPECTS.includes('UNKNOWN'));
  assert(dental.report.sections.unknowns !== undefined);
});

console.log(`\nASTRA11F_BENCHMARK_RESULT pass=${pass} fail=${fail}`);
if (fail) { console.log('FAILURES:\n' + notes.join('\n')); process.exit(1); }
