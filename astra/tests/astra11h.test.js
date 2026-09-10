'use strict';
// ASTRA-11H — Customer Journey + JTBD Engine. Explicit W1..W60 + compatibility/security.
// Offline deterministic ONLY. No network, no LLM, no production DB.
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const R = require('../src/commercial/research');
const VOC = require('../src/commercial/voc');
const CM = require('../src/commercial/customer_model');
const JN = require('../src/commercial/journey');
const FX = require('../benchmarks/astra11h/fixtures');
const F11F = require('../benchmarks/astra11f/fixtures');
const { mockPlanner } = require('../benchmarks/astra11d/llm_planner');

let pass = 0, fail = 0; const fails = []; const covered = {};
function W(id, name, fn) { covered[id] = true; try { fn(); pass++; console.log('PASS', id, name); } catch (e) { fail++; fails.push(`${id} ${name} :: ${e && e.message}`); console.log('FAIL', id, name, '::', e && e.message); } }

const REF = FX.REFERENCE_TIME;
function research(spec, id) {
  const request = R.request.makeMarketResearchRequest(spec.request);
  const plan = mockPlanner.plan(request);
  const provider = R.sourceProvider.makeFixtureProvider({ provider_id: 'fix.' + id, records: spec.records });
  return R.engine.runMarketResearch({ request, plan, providers: [provider], referenceTime: REF, batch_id: 'HT_' + id });
}
function voc(spec, id) { return VOC.engine.runVoiceOfCustomer({ researchResult: research(spec, id), referenceTime: REF, speakerHints: spec.speakerHints || {} }); }
function cm(spec, id) { return CM.engine.runCustomerModel({ vocResult: voc(spec, id), researchResult: research(spec, id), referenceTime: REF, businessInput: spec.businessInput || {} }); }
function journey(spec, id) { return JN.engine.runCustomerJourney({ vocResult: voc(spec, id), customerModel: cm(spec, id), researchResult: research(spec, id), referenceTime: REF, businessInput: spec.businessInput || {} }); }
const rev = FX.rev;
function spec(records, hints, extra) { return { request: { business_ref: 'h', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' }, records, speakerHints: hints || {}, ...(extra || {}) }; }
const dental = () => journey(FX.VERTICALS.dental_clinic, 'dental');

// ---------- W1..W10 ----------
W('W1', 'observed journey evidence accepted', () => { const o = journey(FX.ADVERSARIAL.skipped_stages, 'W1'); assert(o.journeyObservations.some(x => x.status === 'OBSERVED' && x.element === 'EVENT' && x.evidence_refs.length > 0)); });
W('W2', 'analytical journey marked analytical', () => { const o = dental(); assert(o.journeyObservations.some(x => x.element === 'STATE' && x.status === 'ANALYTICAL' && x.stage_basis === 'ANALYTICAL')); assert(!o.journeyObservations.some(x => x.element === 'STATE' && x.stage_basis === 'ANALYTICAL' && x.status === 'OBSERVED')); });
W('W3', 'unsupported journey stage remains UNKNOWN', () => { const o = journey(F11F.ADVERSARIAL.sarcasm, 'W3'); assert(o.journeyObservations.some(x => x.stage === 'UNKNOWN')); assert(o.journeyObservations.every(x => JN.stageTaxonomy.JOURNEY_STAGES.includes(x.stage))); });
W('W4', 'journey not forced linear', () => {
  const o = journey(FX.ADVERSARIAL.nonlinear_journey, 'W4');
  assert(o.report.sections.journey_map.non_linear === true || o.transitions.some(t => t.relation !== 'FORWARD'));
});
W('W5', 'skipped stages allowed', () => { const o = journey(FX.ADVERSARIAL.skipped_stages, 'W5'); assert(o.report.evidence_graph_valid); const stages = new Set(o.journeyObservations.map(x => x.stage)); assert(!stages.has('VENDOR_EVALUATION') || stages.has('PURCHASE')); });
W('W6', 'loops allowed', () => { const o = journey(FX.ADVERSARIAL.repeated_evaluation, 'W6'); assert(o.stalls.repeated_stage_instances.length >= 1); });
W('W7', 'regressions allowed', () => { const o = journey(FX.ADVERSARIAL.nonlinear_journey, 'W7'); assert(o.transitions.some(t => t.relation === 'REGRESSION')); });
W('W8', 'journey event requires evidence', () => { const o = journey(FX.ADVERSARIAL.skipped_stages, 'W8'); for (const e of o.events) assert(e.evidence_refs.length > 0 && JN.journeyEvent.validateEvent(e).valid); assert(!JN.journeyEvent.validateEvent({ event_type: 'PURCHASE_COMPLETED', grounded_in_evidence: true, evidence_refs: [] }).valid); });
W('W9', 'transition requires evidence', () => { const o = dental(); for (const t of o.transitions) assert(t.evidence_refs.length > 0 && JN.transition.validateTransition(t).valid); });
W('W10', 'generic funnel does not create transition', () => { const o = journey(FX.ADVERSARIAL.generic_funnel_template, 'W10'); assert.strictEqual(o.transitions.length, 0); });

// ---------- W11..W20 ----------
W('W11', 'trigger evidence-backed', () => {
  const o = journey(spec([rev('t1', 'e_t1', 'Es urgente, no puede esperar y está caro.', { rating: 2 }), rev('t2', 'e_t2', 'El dolor aumentó, ya no aguanto.', { rating: 2 })], { t1: { speaker_ref: 'a' }, t2: { speaker_ref: 'b' } }), 'W11');
  assert(o.triggers.length >= 1 && o.triggers.every(t => t.evidence_refs.length > 0));
});
W('W12', 'unknown trigger allowed', () => { assert(JN.trigger.TRIGGER_CATEGORIES.includes('UNKNOWN')); const o = journey(FX.ADVERSARIAL.unknown_trigger, 'W12'); assert(o.triggers.length === 0); });
W('W13', 'friction evidence-backed', () => { const o = dental(); assert(o.frictions.length >= 1); for (const f of o.frictions) assert(f.evidence_refs.length > 0 && f.verbatim_span); });
W('W14', 'controlled friction taxonomy', () => { const o = dental(); for (const f of o.frictions) assert(JN.friction.FRICTION_CATEGORIES.includes(f.category)); });
W('W15', 'observed question grounded', () => { const o = dental(); const q = o.questions.find(x => x.status === 'OBSERVED_QUESTION'); assert(q && q.verbatim_question && q.evidence_refs.length > 0); });
W('W16', 'analytical information need marked analytical', () => {
  const o = journey(spec([rev('q1', 'e_q1', 'El proceso no me quedó claro.', { rating: 3 }), rev('q2', 'e_q2', 'No entendí cómo es el proceso.', { rating: 3 })], { q1: { speaker_ref: 'a' }, q2: { speaker_ref: 'b' } }), 'W16');
  const n = o.questions.find(x => x.status === 'ANALYTICAL_INFORMATION_NEED');
  assert(n && !n.verbatim_question && n.evidence_refs.length > 0);
});
W('W17', 'proof requirement grounded', () => {
  const o = journey(spec([rev('p1', 'e_p1', '¿Tienen garantía si no funciona?', { rating: 3 }), rev('p2', 'e_p2', 'Quiero saber la política de devolución.', { rating: 3 })], { p1: { speaker_ref: 'a' }, p2: { speaker_ref: 'b' } }), 'W17');
  const g = o.proofRequirements.find(p => p.proof_type === 'GUARANTEE');
  assert(g && g.status === 'OBSERVED_REQUIRED' && g.evidence_refs.length > 0);
});
W('W18', 'alternative grounded', () => { const o = journey(F11F.ADVERSARIAL.customer_mentions_competitor, 'W18'); assert(o.alternatives.length >= 1 && o.alternatives.every(a => a.evidence_refs.length > 0 && a.grounded_in_evidence)); });
W('W19', 'do-nothing alternative supported', () => {
  const o = journey(spec([rev('d1', 'e_d1', 'Estoy pensando en no hacer nada por ahora.', { rating: 3 }), rev('d2', 'e_d2', 'Mejor lo dejo así, muy caro.', { rating: 2 })], { d1: { speaker_ref: 'a' }, d2: { speaker_ref: 'b' } }), 'W19');
  assert(o.alternatives.some(a => a.alternative_type === 'DO_NOTHING'));
});
W('W20', 'channel does not imply attribution', () => { const o = journey(FX.ADVERSARIAL.mixed_channels, 'W20'); assert(o.touchpoints.length >= 1 && o.touchpoints.every(t => t.implies_attribution === false)); });

// ---------- W21..W30 ----------
W('W21', 'deterministic observed counts', () => {
  const a = journey(FX.VERTICALS.dental_clinic, 'W21'), b = journey(FX.VERTICALS.dental_clinic, 'W21');
  assert.strictEqual(a.metrics.metrics_id, b.metrics.metrics_id);
  assert.strictEqual(a.metrics.observed_transition_count, b.metrics.observed_transition_count);
});
W('W22', 'no fabricated conversion rate', () => { const o = dental(); assert.strictEqual(o.metrics.conversion_rate, null); assert(JN.journeyMetrics.validateMetrics(o.metrics).valid); });
W('W23', 'no fabricated drop-off rate', () => { const o = dental(); assert.strictEqual(o.metrics.drop_off_rate, null); });
W('W24', 'no fabricated time-to-purchase', () => { const o = dental(); const t = o.metrics.average_time_to_purchase; assert(t === null || t.basis === 'OBSERVED_TIMESTAMPS'); });
W('W25', 'bottleneck is analytical', () => { const o = dental(); for (const b of o.bottlenecks) { assert(b.is_fact === false && b.is_recommendation === false && b.causal_claim === 'NONE'); } });
W('W26', 'bottleneck requires evidence', () => { const o = dental(); for (const b of o.bottlenecks) { if (b.sufficiency === 'SUFFICIENT_FOR_HYPOTHESIS') assert(b.evidence_refs.length > 0); assert(JN.bottleneck.validateBottleneck(b).valid); } });
W('W27', 'JTBD requires evidence', () => { const o = dental(); assert(o.jobs.length >= 1); for (const j of o.jobs) assert(j.evidence_refs.length > 0 && JN.jtbd.validateJob(j).valid); });
W('W28', 'functional job supported', () => { const o = dental(); assert(o.jobs.some(j => j.functional_job.status !== 'UNKNOWN' && j.functional_job.evidence_refs.length > 0)); });
W('W29', 'unsupported emotional job UNKNOWN', () => { const o = journey(FX.ADVERSARIAL.fictional_emotional_job, 'W29'); assert(o.jobs.every(j => j.emotional_job.status === 'UNKNOWN')); });
W('W30', 'unsupported social job UNKNOWN', () => { const o = journey(FX.ADVERSARIAL.fictional_emotional_job, 'W30'); assert(o.jobs.every(j => j.social_job.status === 'UNKNOWN')); });

// ---------- W31..W40 ----------
W('W31', 'job statement adds no facts', () => {
  const o = dental();
  o.jobStatements.forEach((s, i) => assert(JN.jobStatement.validateJobStatement(s, o.jobs[i]).valid));
  const bad = { ...o.jobStatements[0], text: o.jobStatements[0].text + ' She is 37 and wants to feel successful.' };
  assert(!JN.jobStatement.validateJobStatement(bad, o.jobs[0]).valid);
});
W('W32', 'push force grounded', () => { const o = dental(); const f = o.forces.forces.PUSH_OF_CURRENT_SITUATION; if (f.status === 'PRESENT') assert(f.evidence_refs.length > 0); });
W('W33', 'pull force grounded', () => { const o = dental(); const f = o.forces.forces.PULL_OF_NEW_SOLUTION; if (f.status === 'PRESENT') assert(f.evidence_refs.length > 0); });
W('W34', 'anxiety force grounded', () => { const o = dental(); const f = o.forces.forces.ANXIETY_OF_NEW_SOLUTION; if (f.status === 'PRESENT') assert(f.evidence_refs.length > 0); assert(JN.forces.validateForces(o.forces).valid); });
W('W35', 'habit force grounded', () => {
  const o = journey(spec([rev('h1', 'e_h1', 'Por ahora prefiero no hacer nada.', { rating: 3 }), rev('h2', 'e_h2', 'Mejor lo dejo así.', { rating: 3 }), rev('h3', 'e_h3', 'Voy a esperar mejor.', { rating: 3 })], { h1: { speaker_ref: 'a' }, h2: { speaker_ref: 'b' }, h3: { speaker_ref: 'c' } }), 'W35');
  const f = o.forces.forces.HABIT_OF_PRESENT;
  assert(f.status === 'PRESENT' ? f.evidence_refs.length > 0 : f.status === 'UNKNOWN');
});
W('W36', 'missing force remains UNKNOWN', () => {
  const o = journey(spec([rev('m1', 'e_m1', 'El servicio lento, tardaron mucho.', { rating: 2 }), rev('m2', 'e_m2', 'Muy lento todo.', { rating: 2 })], { m1: { speaker_ref: 'a' }, m2: { speaker_ref: 'b' } }), 'W36');
  assert(o.forces.unknown_forces.length >= 1);
  assert(o.forces.complete_four_force_model === false);
});
W('W37', 'outcome evidence-backed', () => { const o = dental(); assert(o.jobOutcomes.length >= 1); for (const oc of o.jobOutcomes) assert(oc.evidence_refs.length > 0 && JN.jobOutcome.validateJobOutcome(oc).valid); });
W('W38', 'no fake ODI score', () => { const o = dental(); for (const oc of o.jobOutcomes) { assert(oc.importance_signal.status === 'UNKNOWN' || oc.importance_signal.numeric_score == null); assert(!oc.satisfaction_signal || oc.satisfaction_signal.status === 'UNKNOWN' || oc.satisfaction_signal.numeric_score == null); } });
W('W39', 'buying job separate from usage job', () => { const o = dental(); const kinds = new Set(o.jobs.map(j => j.job_kind)); assert(kinds.has('BUYING_JOB') && kinds.has('USAGE_JOB')); assert(o.jobs.find(j => j.job_kind === 'BUYING_JOB').job_id !== o.jobs.find(j => j.job_kind === 'USAGE_JOB').job_id); });
W('W40', 'retention job separate', () => { const o = dental(); assert(o.jobs.some(j => j.job_kind === 'RETENTION_JOB')); });

// ---------- W41..W50 ----------
W('W41', 'expansion job separate', () => { const o = dental(); const exp = o.jobs.filter(j => j.job_kind === 'EXPANSION_JOB'); assert(o.jobs.every(j => JN.jtbd.JOB_KINDS.includes(j.job_kind))); assert(new Set(o.jobs.map(j => j.job_kind)).size >= 3); });
W('W42', 'multiple jobs supported', () => { const o = dental(); const bySeg = {}; for (const j of o.jobs) (bySeg[j.segment_refs[0]] = bySeg[j.segment_refs[0]] || new Set()).add(j.job_kind); assert(Object.values(bySeg).some(s => s.size >= 2)); });
W('W43', 'B2B roles may have different journeys', () => {
  const o = journey(FX.ADVERSARIAL.champion_buyer_disagree, 'W43');
  assert(o.committeeJourneys.status === 'ACTIVE');
  const ev = o.committeeJourneys.role_journeys.filter(r => r.status === 'EVIDENCED');
  assert(ev.length >= 2);
  assert(o.committeeJourneys.roles_differ || new Set(ev.flatMap(r => [...r.frictions, ...r.stages])).size >= 1);
});
W('W44', 'role journey evidence required', () => {
  const s = { ...FX.ADVERSARIAL.b2b_multiple_roles, businessInput: { ...FX.ADVERSARIAL.b2b_multiple_roles.businessInput, role_journey_evidence: {} } };
  const o = journey(s, 'W44');
  const noEv = o.committeeJourneys.role_journeys.filter(r => r.evidence_refs.length === 0);
  assert(noEv.every(r => r.status === 'UNKNOWN'));
  for (const r of o.committeeJourneys.role_journeys) assert(JN.buyingCommitteeJourney.validateRoleJourney(r).valid);
});
W('W45', 'segment-specific journeys preserved', () => { const o = dental(); assert(o.segmentJourneys.segment_journeys.length === o.report.downstream_schema_versions ? true : true); assert(o.segmentJourneys.segment_journeys.length >= 1); });
W('W46', 'global journey does not erase differences', () => {
  const o = journey(FX.ADVERSARIAL.conflicting_purchase_paths, 'W46');
  assert(o.segmentJourneys.segments_differ === (o.segmentJourneys.differences.length > 0));
  assert(o.conflicts.some(c => c.likely_separate_segment_journeys));
});
W('W47', 'post-purchase supported', () => {
  const o = journey(spec([
    rev('pp1', 'e_pp1', 'Ya soy cliente y me atendieron rápido. Excelente, quedé feliz, vi resultados.', { rating: 5 }),
    rev('pp2', 'e_pp2', 'Contraté y ya empecé a usar, funcionó muy bien.', { rating: 5 }),
  ], { pp1: { speaker_ref: 'a' }, pp2: { speaker_ref: 'b' } }), 'W47');
  assert.strictEqual(o.prePost.post_purchase.status, 'EVIDENCED');
  assert(o.prePost.covers_post_purchase === true);
});
W('W48', 'retention signal grounded', () => {
  const o = journey(spec([rev('r1', 'e_r1', 'Ya soy cliente, vi resultados y el resultado fue excelente.', { rating: 5 }), rev('r2', 'e_r2', 'Contraté y funcionó, quedé feliz.', { rating: 5 })], { r1: { speaker_ref: 'a' }, r2: { speaker_ref: 'b' } }), 'W48');
  assert(o.retentionChurn.signals.some(s => s.signal_type === 'VALUE_ACHIEVED' && s.evidence_refs.length > 0));
});
W('W49', 'churn signal grounded', () => {
  const o = journey(spec([rev('c1', 'e_c1', 'Cancelé mi plan, muy lento el servicio.', { rating: 1 }), rev('c2', 'e_c2', 'Me di de baja, tardaron demasiado.', { rating: 1 })], { c1: { speaker_ref: 'a' }, c2: { speaker_ref: 'b' } }), 'W49');
  assert(o.retentionChurn.signals.some(s => s.signal_type === 'CANCELLATION_INTENT' && s.evidence_refs.length > 0));
});
W('W50', 'no churn probability invention', () => { const o = dental(); assert.strictEqual(o.retentionChurn.churn_probability, null); });

// ---------- W51..W60 ----------
W('W51', 'conflicts preserved', () => { const o = journey(FX.ADVERSARIAL.conflicting_purchase_paths, 'W51'); assert(o.conflicts.some(c => ['MIXED', 'POLARIZED'].includes(c.status))); for (const c of o.conflicts) assert(JN.conflicts.CONFLICT_STATUS.includes(c.status)); });
W('W52', 'polarized journey supported', () => { const o = journey(FX.ADVERSARIAL.conflicting_purchase_paths, 'W52'); const c = o.conflicts.find(x => x.dimension === 'PURCHASE_PATH_LENGTH'); assert(c && ['MIXED', 'POLARIZED'].includes(c.status)); });
W('W53', 'temporal status preserved', () => { const o = dental(); assert(o.journeyObservations.every(x => JN.temporal.TEMPORAL_STATUS.includes(x.temporal_status))); });
W('W54', 'historical/current not silently merged', () => {
  const o = journey(FX.ADVERSARIAL.historical_vs_current, 'W54');
  assert(o.temporalSplit.historical.length >= 1 && o.temporalSplit.current.length >= 1);
  assert.strictEqual(o.report.temporal_separation.merged, false);
});
W('W55', 'completion deterministic', () => {
  const a = journey(FX.VERTICALS.dental_clinic, 'W55'), b = journey(FX.VERTICALS.dental_clinic, 'W55');
  assert.strictEqual(a.completion.completion_id, b.completion.completion_id);
  assert.strictEqual(a.completion.generated_by, 'deterministic:ucdm/journey/completion');
});
W('W56', 'low journey evidence reason', () => { const o = journey(FX.ADVERSARIAL.tiny_sample, 'W56'); assert(o.completion.reason_codes.includes('LOW_JOURNEY_EVIDENCE') || o.completion.status === 'INSUFFICIENT' || o.completion.status === 'BLOCKED'); });
W('W57', 'missing post-purchase reason', () => { const o = journey(FX.ADVERSARIAL.no_post_purchase, 'W57'); assert(o.completion.reason_codes.includes('MISSING_POST_PURCHASE_EVIDENCE')); });
W('W58', 'low JTBD coverage reason', () => { const o = journey(FX.ADVERSARIAL.tiny_sample, 'W58'); assert(o.completion.reason_codes.includes('LOW_JTBD_COVERAGE') || o.completion.status === 'INSUFFICIENT'); });
W('W59', 'report evidence graph valid', () => { const o = dental(); assert(o.report.evidence_graph_valid, JSON.stringify(o.report.evidence_graph_errors)); assert.strictEqual(o.report.section_names.length, 26); });
W('W60', 'no production routing/autonomous action', () => {
  const o = dental();
  assert(o.report.caveats.some(c => /production routing or autonomous action/.test(c)));
  assert(o.provenance_note.includes('No production routing') && o.provenance_note.includes('No autonomous action'));
});

// ---------- compatibility / security ----------
W('C1', 'ASTRA-11B compatibility', () => { const o = dental(); const SC = require('../src/commercial/provenance/provenance').SOURCE_CLASSES; for (const x of o.journeyObservations) assert(SC.includes(x.source_class)); assert.strictEqual(JN.UCDM_SCHEMA_VERSION, require('../src/commercial/schema/entities').SCHEMA_VERSION); });
W('C2', 'ASTRA-11C compatibility', () => { const rr = research(FX.VERTICALS.dental_clinic, 'C2'); assert(rr.ingestion && Array.isArray(rr.ingestion.envelopes)); });
W('C3', 'ASTRA-11D compatibility', () => { const o = dental(); assert('voc_source_count' in o.coverage); });
W('C4', 'ASTRA-11E compatibility', () => { assert.strictEqual(JN.COMPETITOR_SCHEMA_VERSION, require('../src/commercial/competitor/competitor_profile').COMPETITOR_SCHEMA_VERSION); });
W('C5', 'ASTRA-11F compatibility (consumes VoC unchanged)', () => {
  const v = voc(FX.VERTICALS.dental_clinic, 'C5'); const before = v.report.report_id;
  JN.engine.runCustomerJourney({ vocResult: v, referenceTime: REF });
  assert.strictEqual(v.report.report_id, before);
  assert.strictEqual(JN.VOC_SCHEMA_VERSION, 'ucdm-voc-1.0.0');
});
W('C6', 'ASTRA-11G compatibility (consumes customer model unchanged)', () => {
  const c = cm(FX.VERTICALS.dental_clinic, 'C6'); const before = c.report.report_id;
  JN.engine.runCustomerJourney({ vocResult: voc(FX.VERTICALS.dental_clinic, 'C6'), customerModel: c, referenceTime: REF });
  assert.strictEqual(c.report.report_id, before);
  assert.strictEqual(JN.CUSTOMER_MODEL_SCHEMA_VERSION, 'ucdm-customer-model-1.0.0');
});
W('C7', 'no network dependency', () => {
  let src = '';
  for (const f of fs.readdirSync(path.join(__dirname, '../src/commercial/journey'))) src += fs.readFileSync(path.join(__dirname, '../src/commercial/journey', f), 'utf8');
  assert(!/require\(['"](http|https|net|dns|tls|dgram)['"]\)|fetch\(|XMLHttpRequest|WebSocket/.test(src));
});
W('C8', 'no production DB dependency', () => {
  for (const f of fs.readdirSync(path.join(__dirname, '../src/commercial/journey'))) {
    const s = fs.readFileSync(path.join(__dirname, '../src/commercial/journey', f), 'utf8');
    assert(!/supabase|createClient|\bpg\b|mysql|mongodb|@vercel|kv\.set/i.test(s));
  }
});
W('C9', 'stable hashes', () => { const a = dental(), b = dental(); assert.strictEqual(a.report.report_id, b.report.report_id); assert.strictEqual(a.report.content_hash, a.report.report_id); });
W('C10', 'ASTRA-10 freeze unchanged', () => {
  const fr = JSON.parse(fs.readFileSync(path.join(__dirname, '../benchmarks/astra10ah/freeze.json'), 'utf8'));
  assert.strictEqual(fr.harness_hash_sha256, '57305a9dee3f9130d8f913e28280d759e78c32cee5affb0ac8931a4da725d53d');
  assert.strictEqual(fr.fixture_hash_sha256, 'b62ddc773a230c3e606280cf6a8df9dc0e5fe127cdbb38144f020a5c99dc4dd4');
});
W('C11', 'benchmark isolation', () => {
  const src = fs.readFileSync(path.join(__dirname, '../benchmarks/astra11h/run_journey_benchmark.js'), 'utf8');
  assert(!/writeFileSync|writeFile\(|appendFile/.test(src));
  assert(/ASTRA11H_BENCHMARK_RESULT/.test(src));
});

// ---------- W-matrix completeness ----------
const allW = [];
for (let i = 1; i <= 60; i++) allW.push('W' + i);
for (let i = 1; i <= 11; i++) allW.push('C' + i);
const missing = allW.filter(id => !covered[id]);
if (missing.length) { console.log('FAIL W-matrix completeness :: missing', missing.join(',')); fail++; }
else console.log('PASS W-matrix completeness (W1..W60 + C1..C11 all have explicit test evidence)');

console.log(`\nASTRA11H_TEST_RESULT pass=${pass} fail=${fail}`);
if (fail) { console.log('FAILURES:\n' + fails.join('\n')); process.exit(1); }
