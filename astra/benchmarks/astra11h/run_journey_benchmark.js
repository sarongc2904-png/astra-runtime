'use strict';
// [ASTRA-11H benchmark] Offline, mock-only. Zero network, zero LLM, zero cost.
// 6 verticals + 18 adversarial cases + 16 benchmark dimensions.
const assert = require('assert');
const R = require('../../src/commercial/research');
const VOC = require('../../src/commercial/voc');
const CM = require('../../src/commercial/customer_model');
const JN = require('../../src/commercial/journey');
const { mockPlanner } = require('../astra11d/llm_planner');
const FX = require('./fixtures');

let pass = 0, fail = 0; const notes = [];
function check(name, fn) { try { fn(); pass++; console.log('PASS', name); } catch (e) { fail++; notes.push(name + ' :: ' + e.message); console.log('FAIL', name, '::', e.message); } }

const REF = FX.REFERENCE_TIME;
function research(spec, id) {
  const request = R.request.makeMarketResearchRequest(spec.request);
  const plan = mockPlanner.plan(request);
  const provider = R.sourceProvider.makeFixtureProvider({ provider_id: 'fix.' + id, records: spec.records });
  return R.engine.runMarketResearch({ request, plan, providers: [provider], referenceTime: REF, batch_id: 'HF_' + id });
}
function voc(spec, id) { return VOC.engine.runVoiceOfCustomer({ researchResult: research(spec, id), referenceTime: REF, speakerHints: spec.speakerHints || {} }); }
function cm(spec, id) { return CM.engine.runCustomerModel({ vocResult: voc(spec, id), researchResult: research(spec, id), referenceTime: REF, businessInput: spec.businessInput || {} }); }
function journey(spec, id) { return JN.engine.runCustomerJourney({ vocResult: voc(spec, id), customerModel: cm(spec, id), researchResult: research(spec, id), referenceTime: REF, businessInput: spec.businessInput || {} }); }

for (const [name, spec] of Object.entries(FX.VERTICALS)) {
  check(`vertical/${name}: runs, deterministic, 26 sections, evidence graph valid`, () => {
    const a = journey(spec, 'V_' + name), b = journey(spec, 'V_' + name);
    assert.strictEqual(a.report.report_id, b.report.report_id);
    assert.strictEqual(a.report.section_names.length, 26);
    assert(a.report.evidence_graph_valid, JSON.stringify(a.report.evidence_graph_errors));
    assert.strictEqual(a.report.generated_by, 'deterministic:ucdm/journey');
    for (const o of a.journeyObservations) if (o.status === 'OBSERVED') assert(o.evidence_refs.length > 0);
    for (const t of a.transitions) assert(t.evidence_refs.length > 0);
    assert.strictEqual(a.metrics.conversion_rate, null);
  });
}

check('adv/tiny_sample -> INSUFFICIENT/PARTIAL/BLOCKED, no OBSERVED transition', () => {
  const o = journey(FX.ADVERSARIAL.tiny_sample, 'A_tiny');
  assert(['INSUFFICIENT', 'PARTIAL', 'BLOCKED'].includes(o.completion.status));
  assert(!o.transitions.some(t => t.transition_status === 'OBSERVED'));
});
check('adv/nonlinear_journey -> a REGRESSION or non-forward transition exists', () => {
  const o = journey(FX.ADVERSARIAL.nonlinear_journey, 'A_nl');
  assert(o.transitions.some(t => t.relation !== 'FORWARD'), JSON.stringify(o.transitions.map(t => t.relation)));
  assert(o.report.sections.journey_map.non_linear === true);
});
check('adv/skipped_stages -> journey valid with large stage gaps (no forced intermediate stages)', () => {
  const o = journey(FX.ADVERSARIAL.skipped_stages, 'A_skip');
  const stages = new Set(o.journeyObservations.map(x => x.stage));
  assert(!stages.has('VENDOR_EVALUATION') || stages.has('PURCHASE')); // no fabricated funnel middle
  assert(o.report.evidence_graph_valid);
});
check('adv/repeated_evaluation -> stall / repeated-stage instance detected', () => {
  const o = journey(FX.ADVERSARIAL.repeated_evaluation, 'A_re');
  assert(o.stalls.repeated_stage_instances.length >= 1 || o.metrics.repeated_stage_count >= 1);
});
check('adv/unknown_trigger -> MISSING_TRIGGER reason, no invented trigger', () => {
  const o = journey(FX.ADVERSARIAL.unknown_trigger, 'A_ut');
  assert(o.triggers.length === 0 && o.completion.reason_codes.includes('MISSING_TRIGGER'));
});
check('adv/unknown_alternative -> MISSING_ALTERNATIVE reason, no assumed competitor', () => {
  const o = journey(FX.ADVERSARIAL.unknown_alternative, 'A_ua');
  assert(o.alternatives.length === 0 && o.completion.reason_codes.includes('MISSING_ALTERNATIVE'));
});
check('adv/no_purchase_evidence -> MISSING_PURCHASE_EVIDENCE, no PURCHASE stage fabricated', () => {
  const o = journey(FX.ADVERSARIAL.no_purchase_evidence, 'A_np');
  assert(o.completion.reason_codes.includes('MISSING_PURCHASE_EVIDENCE'));
  assert(!o.journeyObservations.some(x => x.stage === 'PURCHASE'));
});
check('adv/no_post_purchase -> MISSING_POST_PURCHASE_EVIDENCE, post-purchase UNKNOWN', () => {
  const o = journey(FX.ADVERSARIAL.no_post_purchase, 'A_npp');
  assert(o.completion.reason_codes.includes('MISSING_POST_PURCHASE_EVIDENCE'));
  assert.strictEqual(o.prePost.post_purchase.status, 'UNKNOWN');
});
check('adv/conflicting_purchase_paths -> POLARIZED/MIXED journey conflict preserved', () => {
  const o = journey(FX.ADVERSARIAL.conflicting_purchase_paths, 'A_cpp');
  assert(o.conflicts.some(c => ['MIXED', 'POLARIZED'].includes(c.status) && c.likely_separate_segment_journeys));
});
check('adv/mixed_channels -> multiple touchpoints, none implies attribution', () => {
  const o = journey(FX.ADVERSARIAL.mixed_channels, 'A_mc');
  assert(o.touchpoints.length >= 2);
  assert(o.touchpoints.every(t => t.implies_attribution === false));
});
check('adv/channel_no_attribution -> no attribution percentages produced', () => {
  const o = journey(FX.ADVERSARIAL.channel_no_attribution, 'A_cna');
  assert.strictEqual(o.metrics.attribution_percentages, null);
  assert(o.touchpoints.every(t => t.implies_attribution === false));
});
check('adv/b2b_multiple_roles -> distinct evidenced role journeys', () => {
  const o = journey(FX.ADVERSARIAL.b2b_multiple_roles, 'A_b2b');
  assert(o.committeeJourneys.status === 'ACTIVE');
  assert(o.committeeJourneys.role_journeys.filter(r => r.status === 'EVIDENCED').length >= 2);
});
check('adv/champion_buyer_disagree -> roles differ on friction/proof', () => {
  const o = journey(FX.ADVERSARIAL.champion_buyer_disagree, 'A_cbd');
  const ev = o.committeeJourneys.role_journeys.filter(r => r.status === 'EVIDENCED');
  const fr = new Set(ev.flatMap(r => r.frictions));
  assert(ev.length >= 2 && (o.committeeJourneys.roles_differ || fr.size >= 1));
});
check('adv/strong_voc_sparse_transitions -> rich frictions but transitions stay analytical', () => {
  const o = journey(FX.ADVERSARIAL.strong_voc_sparse_transitions, 'A_svst');
  assert(o.frictions.length >= 4);
  assert(o.transitions.every(t => t.transition_status !== 'OBSERVED'));
});
check('adv/historical_vs_current -> historical and current NOT merged', () => {
  const o = journey(FX.ADVERSARIAL.historical_vs_current, 'A_hvc');
  assert(o.temporalSplit.historical.length >= 1 && o.temporalSplit.current.length >= 1);
  assert.strictEqual(o.report.temporal_separation.merged, false);
});
check('adv/fictional_emotional_job -> emotional_job UNKNOWN (no psychographic fiction)', () => {
  const o = journey(FX.ADVERSARIAL.fictional_emotional_job, 'A_fej');
  assert(o.jobs.every(j => j.emotional_job.status === 'UNKNOWN' && j.social_job.status === 'UNKNOWN'));
  assert(o.jobStatements.every(s => !/feel successful|siente exitos|feliz con su vida/i.test(s.text)));
});
check('adv/generic_funnel_template -> two disconnected states, NO transition fabricated', () => {
  const o = journey(FX.ADVERSARIAL.generic_funnel_template, 'A_gft');
  assert.strictEqual(o.transitions.length, 0);
});
check('adv/one_customer_repeated -> one subject, transitions not inflated by repetition', () => {
  const o = journey(FX.ADVERSARIAL.one_customer_repeated, 'A_ocr');
  const subjects = new Set(o.journeyObservations.map(x => x.subject_ref).filter(Boolean));
  assert.strictEqual(subjects.size, 1);
  assert(o.transitions.length === 0); // all observations at the same stage
});

// ---- 16 dimensions ----
const dental = journey(FX.VERTICALS.dental_clinic, 'DIM');
check('dim/evidence fidelity: OBSERVED journey observations carry evidence', () => { for (const o of dental.journeyObservations) if (o.status === 'OBSERVED') assert(o.evidence_refs.length > 0); });
check('dim/journey discipline: every stage is from the controlled taxonomy', () => { for (const o of dental.journeyObservations) assert(JN.stageTaxonomy.JOURNEY_STAGES.includes(o.stage)); });
check('dim/nonlinearity: relation labels include non-forward where evidenced', () => { assert(dental.transitions.every(t => ['FORWARD', 'REGRESSION', 'REPEAT', 'UNKNOWN'].includes(t.relation))); });
check('dim/transition grounding: no transition without evidence', () => { for (const t of dental.transitions) assert(t.evidence_refs.length > 0 && JN.transition.validateTransition(t).valid); });
check('dim/trigger grounding: every trigger evidence-backed or UNKNOWN', () => { for (const t of dental.triggers) assert(t.category === 'UNKNOWN' || t.evidence_refs.length > 0); });
check('dim/friction grounding: friction preserves exact span + evidence', () => { for (const f of dental.frictions) assert(f.verbatim_span && f.evidence_refs.length > 0); });
check('dim/channel discipline: touchpoints never imply attribution', () => { for (const t of dental.touchpoints) assert(t.implies_attribution === false); });
check('dim/JTBD grounding: every job evidence-backed', () => { for (const j of dental.jobs) assert(j.evidence_refs.length > 0 && JN.jtbd.validateJob(j).valid); });
check('dim/no psychographic fiction: emotional/social jobs need explicit evidence', () => { for (const j of dental.jobs) for (const k of ['emotional_job', 'social_job']) if (j[k].status !== 'UNKNOWN') assert(j[k].basis === 'OBSERVED' && j[k].evidence_refs.length > 0); });
check('dim/force-of-progress discipline: no padded four-force model', () => { assert(JN.forces.validateForces(dental.forces).valid); if (!dental.forces.complete_four_force_model) assert(dental.forces.present_forces.length < 4); });
check('dim/role differentiation: B2C committee journeys NOT_APPLICABLE', () => { assert.strictEqual(dental.committeeJourneys.status, 'NOT_APPLICABLE'); });
check('dim/segment differentiation: segment journey differences preserved', () => { assert('segments_differ' in dental.segmentJourneys); });
check('dim/post-purchase coverage: pre/post journeys both represented', () => { assert(dental.prePost.pre_purchase && dental.prePost.post_purchase); });
check('dim/conflict preservation: conflict status is one of the 4 controlled values', () => { for (const c of dental.conflicts) assert(JN.conflicts.CONFLICT_STATUS.includes(c.status)); });
check('dim/unknown handling: report unknowns + job unknowns represented', () => { assert(Array.isArray(dental.report.sections.unknowns)); assert(dental.jobs.every(j => Array.isArray(j.unknowns))); });
check('dim/report grounding: no fabricated conversion/drop-off/attribution/time metrics', () => {
  assert(dental.metrics.conversion_rate === null && dental.metrics.drop_off_rate === null && dental.metrics.attribution_percentages === null);
  assert(!/\b\d{1,3}\s?%\s*(conversion|drop|de conversi[oó]n)/i.test(JSON.stringify(dental.report)));
});

console.log(`\nASTRA11H_BENCHMARK_RESULT pass=${pass} fail=${fail}`);
if (fail) { console.log('FAILURES:\n' + notes.join('\n')); process.exit(1); }
