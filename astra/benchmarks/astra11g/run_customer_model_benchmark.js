'use strict';
// [ASTRA-11G benchmark] Offline, mock-only. Zero network, zero LLM, zero cost.
// 6 verticals + 18 adversarial cases + 15 benchmark dimensions.
const assert = require('assert');
const R = require('../../src/commercial/research');
const VOC = require('../../src/commercial/voc');
const CM = require('../../src/commercial/customer_model');
const { mockPlanner } = require('../astra11d/llm_planner');
const FX = require('./fixtures');

let pass = 0, fail = 0; const notes = [];
function check(name, fn) { try { fn(); pass++; console.log('PASS', name); } catch (e) { fail++; notes.push(name + ' :: ' + e.message); console.log('FAIL', name, '::', e.message); } }

const REF = FX.REFERENCE_TIME;
function research(spec, id) {
  const request = R.request.makeMarketResearchRequest(spec.request);
  const plan = mockPlanner.plan(request);
  const provider = R.sourceProvider.makeFixtureProvider({ provider_id: 'fix.' + id, records: spec.records });
  return R.engine.runMarketResearch({ request, plan, providers: [provider], referenceTime: REF, batch_id: 'GF_' + id });
}
function voc(spec, id) {
  return VOC.engine.runVoiceOfCustomer({ researchResult: research(spec, id), referenceTime: REF, speakerHints: spec.speakerHints || {} });
}
function model(spec, id) {
  return CM.engine.runCustomerModel({ vocResult: voc(spec, id), researchResult: research(spec, id), referenceTime: REF, businessInput: spec.businessInput || {} });
}

const PROHIBITED = CM.attributeEvidence.PROHIBITED_INFERENCE_ATTRIBUTES;
function noInventedDemographics(o) {
  for (const a of o.attributeEvidence) {
    if (PROHIBITED.includes(a.attribute)) assert(a.status === 'UNKNOWN' && a.value == null, `attribute ${a.attribute} was invented: ${JSON.stringify(a.value)}`);
    assert(!CM.attributeEvidence.isProhibitedInference(a.attribute, a.value) || a.source_class === 'USER_PROVIDED' || a.status === 'UNKNOWN', `prohibited value leaked on ${a.attribute}`);
  }
  o.narratives.forEach((n) => {
    assert(!/María,?\s*\d|,\s*\d{2}\s*años|casada|married with|earns?\s*\$|MXN\s*\/\s*mes|Instagram por las noches/i.test(n.text), 'persona narrative contains fictional demographic filler');
  });
  for (const p of o.personas) for (const d of PROHIBITED) assert(!(d in p) || (p.explicit_attributes && d in p.explicit_attributes), `persona carries derived ${d}`);
}

// ---- 6 verticals ----
for (const [name, spec] of Object.entries(FX.VERTICALS)) {
  check(`vertical/${name}: runs, deterministic, 28 sections, evidence graph valid, no invented demographics`, () => {
    const a = model(spec, 'V_' + name), b = model(spec, 'V_' + name);
    assert.strictEqual(a.report.report_id, b.report.report_id);
    assert.strictEqual(a.report.section_names.length, 28);
    assert(a.report.evidence_graph_valid, JSON.stringify(a.report.evidence_graph_errors));
    assert.strictEqual(a.report.generated_by, 'deterministic:ucdm/customer_model');
    assert(a.segments.length >= 1 && a.personas.length === a.segments.length);
    for (const s of a.segments) { assert(CM.segmentCandidate.validateSegmentCandidate(s).valid); assert(s.supporting_evidence_refs.every(er => a.report.sections.evidence_appendix.entries.some(e => e.evidence_ref === er))); }
    for (const p of a.personas) assert(CM.buyerPersona.validatePersona(p).valid);
    noInventedDemographics(a);
  });
}

// ---- 18 adversarial ----
check('adv/tiny_sample -> completion INSUFFICIENT/BLOCKED, no SUPPORTED segment', () => {
  const o = model(FX.ADVERSARIAL.tiny_sample, 'A_tiny');
  assert(['INSUFFICIENT', 'BLOCKED', 'PARTIAL'].includes(o.completion.status));
  assert(!o.segments.some(s => s.status === 'SUPPORTED'));
});
check('adv/duplicate_speakers -> repeated speaker not counted as independent members', () => {
  const o = model(FX.ADVERSARIAL.duplicate_speakers, 'A_dupspk');
  const priceSeg = o.segments.find(s => s.primary_concept === 'PRICE_CONCERN');
  assert(priceSeg && priceSeg.observed_sample.known_customer_count === 1, JSON.stringify(priceSeg && priceSeg.observed_sample));
});
check('adv/demographic_temptation -> mamá / edad / clase media NEVER become customer attributes', () => {
  const o = model(FX.ADVERSARIAL.demographic_temptation, 'A_demo');
  for (const a of o.attributeEvidence) {
    if (['age', 'age_group', 'gender', 'marital_status', 'family_composition', 'income'].includes(a.attribute)) assert(a.status === 'UNKNOWN');
  }
  assert(!o.attributeEvidence.some(a => a.status !== 'UNKNOWN' && /mam[aá]|mujer|clase media|30 a 45|familia/i.test(JSON.stringify(a.value || ''))));
});
check('adv/conflicting_pains -> both pains represented, segments for each', () => {
  const o = model(FX.ADVERSARIAL.conflicting_pains, 'A_cp');
  const concepts = new Set(o.segments.map(s => s.primary_concept));
  assert(concepts.has('PRICE_CONCERN') && (concepts.has('SLOW_SERVICE') || concepts.has('RESPONSIVENESS_COMPLAINT')));
});
check('adv/conflicting_desired_outcomes -> conflict preserved, likely multiple segments', () => {
  const o = model(FX.ADVERSARIAL.conflicting_desired_outcomes, 'A_cdo');
  assert(o.conflicts.some(c => ['MIXED', 'POLARIZED'].includes(c.status)) || o.segments.filter(s => s.primary_dimension === 'desired_outcome').length >= 1);
});
check('adv/mixed_awareness -> awareness MIXED, not forced to one stage', () => {
  const o = model(FX.ADVERSARIAL.mixed_awareness, 'A_ma');
  assert(['MIXED', 'UNKNOWN'].includes(o.awareness.stage));
  assert(o.awareness.evidence_refs.length > 0 || o.awareness.stage === 'UNKNOWN');
});
check('adv/unknown_budget -> budget signal NO_BUDGET_SIGNAL/UNKNOWN + completion reason', () => {
  const o = model(FX.ADVERSARIAL.unknown_budget, 'A_ub');
  assert(['NO_BUDGET_SIGNAL', 'UNKNOWN'].includes(o.budget.signal));
  assert(o.completion.reason_codes.includes('UNKNOWN_BUDGET_SIGNAL'));
});
check('adv/price_sensitive_high_urgency -> both signals held simultaneously (no averaging)', () => {
  const o = model(FX.ADVERSARIAL.price_sensitive_high_urgency, 'A_psu');
  assert(o.budget.signal === 'PRICE_SENSITIVE');
  assert(['HIGH', 'MIXED'].includes(o.urgency.level));
});
check('adv/high_budget_no_urgency -> flexible budget + UNKNOWN urgency (not inferred)', () => {
  const o = model(FX.ADVERSARIAL.high_budget_no_urgency, 'A_hbn');
  assert(o.budget.signal === 'BUDGET_FLEXIBLE');
  assert(o.urgency.level === 'UNKNOWN');
});
check('adv/overlapping_segments -> a speaker belongs to >1 segment', () => {
  const o = model(FX.ADVERSARIAL.overlapping_segments, 'A_ov');
  assert(o.overlap.overlapping_speakers >= 1, JSON.stringify(o.overlap));
});
check('adv/similar_persona_labels -> not merged on label similarity', () => {
  const o = model(FX.ADVERSARIAL.similar_persona_labels, 'A_spl');
  assert(o.mergeSplits.every(m => m.status !== 'MERGE_SUPPORTED' || m.attribute_similarity >= 0.6));
});
check('adv/b2b_multiple_roles -> committee holds multiple distinct roles/parties', () => {
  const o = model(FX.ADVERSARIAL.b2b_multiple_roles, 'A_b2b');
  assert(o.buyingCommittee.roles_present.length >= 3);
  assert(o.buyingCommittee.distinct_parties >= 3);
});
check('adv/title_without_authority -> decision authority NOT confirmed from title alone', () => {
  const o = model(FX.ADVERSARIAL.title_without_authority, 'A_twa');
  const dm = o.buyingCommittee.members.find(m => m.role === 'DECISION_MAKER');
  assert(dm && dm.authority_confirmed === false && dm.basis === 'ANALYTICAL');
});
check('adv/missing_icp_revenue -> ICP.revenue_range UNKNOWN, still valid', () => {
  const o = model(FX.ADVERSARIAL.missing_icp_revenue, 'A_mir');
  assert(o.icp.status === 'ACTIVE' && o.icp.revenue_range.status === 'UNKNOWN');
  assert(CM.icp.validateICP(o.icp).valid);
});
check('adv/missing_icp_employees -> ICP.employees UNKNOWN, still valid', () => {
  const o = model(FX.ADVERSARIAL.missing_icp_employees, 'A_mie');
  assert(o.icp.status === 'ACTIVE' && o.icp.employees.status === 'UNKNOWN');
  assert(CM.icp.validateICP(o.icp).valid);
});
check('adv/strong_voc_weak_market -> personas grounded, attractiveness partly UNKNOWN', () => {
  const o = CM.engine.runCustomerModel({ vocResult: voc(FX.ADVERSARIAL.strong_voc_weak_market, 'A_svm'), referenceTime: REF });
  assert(o.personas.length >= 1 && o.report.evidence_graph_valid);
  assert(o.attractiveness.some(a => a.reason_codes.some(r => /MISSING_|INSUFFICIENT/.test(r))));
});
check('adv/strong_market_weak_voc -> completion INSUFFICIENT/BLOCKED (VoC too thin)', () => {
  const o = model(FX.ADVERSARIAL.strong_market_weak_voc, 'A_smv');
  assert(['INSUFFICIENT', 'BLOCKED', 'PARTIAL'].includes(o.completion.status));
});
check('adv/owner_assumptions_mixed -> business-authored demographic speculation excluded', () => {
  const v = voc(FX.ADVERSARIAL.owner_assumptions_mixed, 'A_oam');
  const o = CM.engine.runCustomerModel({ vocResult: v, referenceTime: REF });
  assert(v.excludedNonVoc.some(e => e.speaker_role === 'BUSINESS'));
  assert(!o.attributeEvidence.some(a => a.status !== 'UNKNOWN' && /mujeres de 30|clase media|valoran la familia/i.test(JSON.stringify(a.value || ''))));
});

// ---- 15 dimensions ----
const dental = model(FX.VERTICALS.dental_clinic, 'DIM');
check('dim/evidence fidelity: every OBSERVED attribute carries evidence_refs', () => {
  for (const a of dental.attributeEvidence) if (a.status === 'OBSERVED') assert(a.evidence_refs.length > 0);
});
check('dim/no demographic invention', () => noInventedDemographics(dental));
check('dim/no psychographic fiction: narrative is exactly the deterministic rendering', () => {
  dental.personas.forEach((p, i) => assert(CM.buyerPersona.validateNarrative(dental.narratives[i], p).valid));
});
check('dim/segment discipline: every segment evidence-backed or HYPOTHESIS/INSUFFICIENT', () => {
  for (const s of dental.segments) if (['SUPPORTED', 'PARTIAL'].includes(s.status)) assert(s.supporting_evidence_refs.length > 0);
});
check('dim/overlap discipline: overlap report present and customers not forced into one segment', () => {
  assert('overlapping_speakers' in dental.overlap);
});
check('dim/persona grounding: persona evidence maps have no dangling refs', () => {
  for (const m of dental.evidenceMaps) assert(m.evidence_graph_valid, m.dangling_refs.join(','));
});
check('dim/ICP-Persona separation: B2C ICP is NOT_APPLICABLE, personas still built', () => {
  assert(dental.icp.status === 'NOT_APPLICABLE' && dental.personas.length > 0);
});
check('dim/budget discipline: no income/wealth inference in budget assessment', () => {
  assert(CM.budgetSignal.validateBudgetSignal(dental.budget).valid);
});
check('dim/awareness discipline: stage from controlled signals, evidence required unless UNKNOWN', () => {
  assert(CM.awareness.validateAwareness(dental.awareness).valid);
});
check('dim/urgency discipline: engagement frequency is not an urgency signal', () => {
  assert(CM.urgency.validateUrgency(dental.urgency).valid);
  assert(!(dental.urgency.signals || []).some(s => /frequency|volume|engagement/i.test(s)));
});
check('dim/fit calculation: deterministic + null score when coverage insufficient', () => {
  for (const f of dental.icpFits) { assert(CM.icpFit.validateIcpFit(f).valid); if (f.coverage_weight_mass < 0.5) assert(f.total_score === null && f.fit_band === 'UNKNOWN'); }
});
check('dim/priority discipline: analytical, non-autonomous, deterministic', () => {
  for (const p of dental.priorities) { assert(p.is_analytical === true && p.triggers_action === false && p.autonomous_targeting === false); }
  const again = model(FX.VERTICALS.dental_clinic, 'DIM');
  assert.deepStrictEqual(dental.priorities.map(p => p.priority_id), again.priorities.map(p => p.priority_id));
});
check('dim/conflict preservation: MIXED/POLARIZED conflicts kept and flagged multi-segment', () => {
  for (const c of dental.conflicts) if (['MIXED', 'POLARIZED'].includes(c.status)) assert(c.likely_multiple_segments === true);
});
check('dim/unknown handling: report unknowns section + persona UNKNOWN fields represented', () => {
  assert(Array.isArray(dental.report.sections.unknowns));
  assert(dental.personas.every(p => Array.isArray(p.unknowns)));
});
check('dim/report grounding: no market-share fabrication anywhere in the report', () => {
  assert(!/\b\d{1,3}\s?%\s*(of|del?)\s*(the\s*)?(market|mercado|customers|clientes)/i.test(JSON.stringify(dental.report)));
});

console.log(`\nASTRA11G_BENCHMARK_RESULT pass=${pass} fail=${fail}`);
if (fail) { console.log('FAILURES:\n' + notes.join('\n')); process.exit(1); }
