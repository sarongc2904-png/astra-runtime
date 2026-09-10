'use strict';
// ASTRA-11G — Buyer Persona + ICP + Segmentation Engine. Explicit W1..W60 + compat/security.
// Offline deterministic ONLY. No network, no LLM, no production DB.
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const R = require('../src/commercial/research');
const VOC = require('../src/commercial/voc');
const CM = require('../src/commercial/customer_model');
const FX = require('../benchmarks/astra11g/fixtures');
const F11F = require('../benchmarks/astra11f/fixtures');
const { mockPlanner } = require('../benchmarks/astra11d/llm_planner');

let pass = 0, fail = 0; const fails = []; const covered = {};
function W(id, name, fn) { covered[id] = true; try { fn(); pass++; console.log('PASS', id, name); } catch (e) { fail++; fails.push(`${id} ${name} :: ${e && e.message}`); console.log('FAIL', id, name, '::', e && e.message); } }

const REF = FX.REFERENCE_TIME;
function research(spec, id) {
  const request = R.request.makeMarketResearchRequest(spec.request);
  const plan = mockPlanner.plan(request);
  const provider = R.sourceProvider.makeFixtureProvider({ provider_id: 'fix.' + id, records: spec.records });
  return R.engine.runMarketResearch({ request, plan, providers: [provider], referenceTime: REF, batch_id: 'GT_' + id });
}
function voc(spec, id) {
  return VOC.engine.runVoiceOfCustomer({ researchResult: research(spec, id), referenceTime: REF, speakerHints: spec.speakerHints || {} });
}
function cm(spec, id, businessInput) {
  return CM.engine.runCustomerModel({ vocResult: voc(spec, id), researchResult: research(spec, id), referenceTime: REF, businessInput: businessInput || spec.businessInput || {} });
}
const R_ = (source_id, evidence_ref, text, opts) => FX.rev(source_id, evidence_ref, text, opts || {});
function spec(records, speakerHints, extra) {
  return { request: { business_ref: 'g', product_or_service: 'x', objectives: ['CUSTOMER_PROBLEMS'], language: 'es' }, records, speakerHints: speakerHints || {}, ...(extra || {}) };
}
const dental = () => cm(FX.VERTICALS.dental_clinic, 'dental');

// ---------- W1..W10 ----------
W('W1', 'observed customer attribute accepted', () => { const o = dental(); assert(o.attributeEvidence.some(a => a.status === 'OBSERVED' && a.source_class === 'OBSERVED' && a.evidence_refs.length > 0)); });
W('W2', 'analytical attribute marked analytical', () => {
  const o = cm(F11F.ADVERSARIAL.unknown_speaker, 'W2');
  // unknown-speaker VoC observations are ANALYTICAL -> their attribute evidence stays ANALYTICAL, never OBSERVED
  const derived = o.attributeEvidence.filter(a => a.derived_from && String(a.derived_from).startsWith('cae') === false && a.scope === 'CUSTOMER');
  assert(derived.length > 0 && derived.every(a => a.status === 'ANALYTICAL'));
  assert(!derived.some(a => a.status === 'OBSERVED'));
});
W('W3', 'unsupported demographic remains UNKNOWN', () => {
  const o = cm(FX.ADVERSARIAL.demographic_temptation, 'W3');
  for (const attr of ['age', 'gender', 'marital_status', 'income', 'education', 'religion']) {
    const rows = o.attributeEvidence.filter(a => a.attribute === attr);
    assert(rows.length && rows.every(a => a.status === 'UNKNOWN' && a.value == null), attr);
  }
});
W('W4', 'age not invented', () => { const o = cm(FX.ADVERSARIAL.demographic_temptation, 'W4'); assert(!o.attributeEvidence.some(a => a.status !== 'UNKNOWN' && /\b\d{2}\s*a\s*\d{2}|30 a 45|edad|años\b/i.test(JSON.stringify(a.value || '')))); assert(o.personas.every(p => !('age' in p))); });
W('W5', 'gender not invented', () => { const o = cm(FX.ADVERSARIAL.demographic_temptation, 'W5'); assert(!o.attributeEvidence.some(a => a.status !== 'UNKNOWN' && /\b(mujer|hombre|mam[aá]|pap[aá]|female|male)\b/i.test(JSON.stringify(a.value || '')))); });
W('W6', 'income not invented', () => { const o = cm(FX.ADVERSARIAL.demographic_temptation, 'W6'); assert(!o.attributeEvidence.some(a => a.status !== 'UNKNOWN' && /income|salario|ingresos|clase (alta|media|baja)/i.test(JSON.stringify(a.value || '')))); assert(CM.budgetSignal.validateBudgetSignal(o.budget).valid); });
W('W7', 'hobbies not invented', () => { const o = cm(FX.ADVERSARIAL.demographic_temptation, 'W7'); const rows = o.attributeEvidence.filter(a => a.attribute === 'hobbies' || a.attribute === 'lifestyle'); assert(rows.every(a => a.status === 'UNKNOWN')); });
W('W8', 'controlled segment dimensions', () => {
  const o = dental();
  for (const s of o.segments) for (const dv of s.dimension_values) assert(CM.segmentTaxonomy.SEGMENT_DIMENSIONS.includes(dv.dimension));
  assert.strictEqual(CM.segmentTaxonomy.SEGMENT_DIMENSION_TAXONOMY_VERSION, 'cm-segment-dimension-v1');
});
W('W9', 'unknown dimension allowed', () => {
  assert(CM.segmentTaxonomy.SEGMENT_DIMENSIONS.includes('UNKNOWN'));
  const n = CM.segmentTaxonomy.normalizeDimensionValue('made_up_dim', 'x');
  assert(n.dimension === 'UNKNOWN' && n.ok === false);
});
W('W10', 'segment requires evidence', () => {
  const bad = { status: 'SUPPORTED', label: 'x', dimension_values: [{ dimension: 'problem' }], supporting_evidence_refs: [] };
  assert(!CM.segmentCandidate.validateSegmentCandidate(bad).valid);
  const o = dental();
  for (const s of o.segments) if (['SUPPORTED', 'PARTIAL'].includes(s.status)) assert(s.supporting_evidence_refs.length > 0);
});

// ---------- W11..W20 ----------
W('W11', 'segment overlap allowed', () => { const o = cm(FX.ADVERSARIAL.overlapping_segments, 'W11'); assert(o.overlap.overlapping_speakers >= 1); });
W('W12', 'customer not forced into one segment', () => {
  const o = cm(FX.ADVERSARIAL.overlapping_segments, 'W12');
  const bySpk = {};
  for (const m of o.memberships) if (m.status === 'CONFIRMED') (bySpk[m.speaker_pseudonym] = bySpk[m.speaker_pseudonym] || new Set()).add(m.segment_id);
  assert(Object.values(bySpk).some(s => s.size >= 2));
});
W('W13', 'observed sample size deterministic', () => {
  const a = cm(FX.VERTICALS.dental_clinic, 'W13'), b = cm(FX.VERTICALS.dental_clinic, 'W13');
  assert.deepStrictEqual(a.segments.map(s => s.observed_sample), b.segments.map(s => s.observed_sample));
  assert.deepStrictEqual(a.metrics.map(m => m.observed_sample_count), b.metrics.map(m => m.observed_sample_count));
});
W('W14', 'market segment size not fabricated', () => {
  const o = dental();
  for (const m of o.metrics) {
    assert.strictEqual(m.estimated_external_market_size.basis, 'UNKNOWN');
    assert(CM.segmentMetrics.validateSegmentMetrics(m).valid);
  }
  assert(!/\b\d{1,3}\s?%\s*(of|del?)\s*(the\s*)?(market|mercado)/i.test(JSON.stringify(o.report)));
});
W('W15', 'BuyerPersona allows UNKNOWN fields', () => { const o = dental(); assert(o.personas.some(p => Object.values(p).some(v => v && v.status === 'UNKNOWN'))); assert(o.personas.every(p => Array.isArray(p.unknowns))); });
W('W16', 'primary problem evidence-backed', () => { const o = dental(); const p = o.personas.find(x => x.primary_problem && x.primary_problem.status !== 'UNKNOWN'); assert(p && p.primary_problem.evidence_refs.length > 0); });
W('W17', 'desired outcome evidence-backed', () => { const o = dental(); const p = o.personas.find(x => Array.isArray(x.desired_outcomes)); assert(p && p.desired_outcomes.every(d => d.evidence_refs.length > 0)); });
W('W18', 'emotional pain evidence-backed', () => { const o = dental(); const p = o.personas.find(x => Array.isArray(x.emotional_pains) && x.emotional_pains.length); assert(p && p.emotional_pains.every(d => d.evidence_refs.length > 0)); });
W('W19', 'fear evidence-backed', () => { const o = dental(); const p = o.personas.find(x => Array.isArray(x.fears) && x.fears.length); assert(p && p.fears.every(d => d.evidence_refs.length > 0)); });
W('W20', 'objection evidence-backed', () => { const o = dental(); const p = o.personas.find(x => Array.isArray(x.objections) && x.objections.length); assert(p && p.objections.every(d => d.evidence_refs.length > 0)); });

// ---------- W21..W30 ----------
W('W21', 'trigger evidence-backed', () => {
  const o = cm(spec([
    R_('t1', 'e_t1', 'Está muy caro pero es urgente, no puede esperar.', { rating: 2 }),
    R_('t2', 'e_t2', 'El dolor aumentó y ya no aguanto.', { rating: 2 }),
  ], { t1: { speaker_ref: 'a' }, t2: { speaker_ref: 'b' } }), 'W21');
  assert(o.attributeEvidence.some(a => a.attribute === 'trigger' && a.evidence_refs.length > 0));
});
W('W22', 'alternative evidence-backed', () => { const o = cm(F11F.ADVERSARIAL.customer_mentions_competitor, 'W22'); assert(o.attributeEvidence.some(a => a.attribute === 'alternative' && a.evidence_refs.length > 0)); });
W('W23', 'decision criterion evidence-backed', () => { const o = dental(); assert(o.attributeEvidence.some(a => a.attribute === 'decision_criterion' && a.evidence_refs.length > 0)); });
W('W24', 'reason_to_buy evidence-backed', () => {
  const o = cm(spec([
    R_('q1', 'e_q1', 'Excelente, muy recomendable, quedé feliz.', { rating: 5 }),
    R_('q2', 'e_q2', 'Me encantó, muy bueno.', { rating: 5 }),
  ], { q1: { speaker_ref: 'a' }, q2: { speaker_ref: 'b' } }), 'W24');
  const p = o.personas.find(x => Array.isArray(x.reasons_to_buy) && x.reasons_to_buy.length);
  assert(p && p.reasons_to_buy.every(d => d.evidence_refs.length > 0));
});
W('W25', 'reason_not_to_buy evidence-backed', () => {
  const o = cm(spec([
    R_('g1', 'e_g1', '¿Tienen garantía si no funciona?', { rating: 3 }),
    R_('g2', 'e_g2', 'Quiero saber la política de devolución y reembolso.', { rating: 3 }),
  ], { g1: { speaker_ref: 'a' }, g2: { speaker_ref: 'b' } }), 'W25');
  assert(o.attributeEvidence.some(a => a.attribute === 'reason_not_to_buy' && a.evidence_refs.length > 0));
});
W('W26', 'buying language references exact VOC', () => {
  const o = dental();
  const p = o.personas.find(x => x.buying_language_refs && x.buying_language_refs.status !== 'UNKNOWN');
  assert(p, 'expected at least one persona with buying language');
  const blIds = new Set(Object.keys(o.report.downstream_schema_versions));
  assert.strictEqual(p.buying_language_refs.library_id, o.report.sections.buying_language.library_id);
  for (const phrases of Object.values(p.buying_language_refs.by_aspect)) for (const ph of phrases) assert(ph.evidence_refs.length > 0);
});
W('W27', 'generated copy cannot become buying language', () => {
  const o = dental();
  for (const p of o.personas) if (p.buying_language_refs && p.buying_language_refs.status !== 'UNKNOWN') assert.strictEqual(p.buying_language_refs.contains_generated_copy, false);
  const tampered = { ...o.personas[0], buying_language_refs: { library_id: 'x', contains_generated_copy: true, by_aspect: {} } };
  assert(!CM.buyerPersona.validatePersona(tampered).valid);
});
W('W28', 'Persona narrative adds no new facts', () => {
  const o = dental();
  o.narratives.forEach((n, i) => assert(CM.buyerPersona.validateNarrative(n, o.personas[i]).valid));
  const bad = { ...o.narratives[0], text: o.narratives[0].text + '\nMaría, 37 años, casada, gana $35,000 MXN/mes.' };
  assert(!CM.buyerPersona.validateNarrative(bad, o.personas[0]).valid);
});
W('W29', 'Persona evidence graph valid', () => {
  const o = dental();
  for (const m of o.evidenceMaps) { assert(m.evidence_graph_valid, m.dangling_refs.join(',')); assert(CM.personaEvidence.validatePersonaEvidenceMap(m).valid); }
  assert(!CM.personaEvidence.validatePersonaEvidenceMap({ evidence_graph_valid: false, dangling_refs: ['x'] }).valid);
});
W('W30', 'awareness UNKNOWN allowed', () => {
  const o = cm(spec([R_('a1', 'e_a1', 'Me da miedo que duela.', { rating: 3 }), R_('a2', 'e_a2', 'Tengo miedo.', { rating: 3 })], { a1: { speaker_ref: 'a' }, a2: { speaker_ref: 'b' } }), 'W30');
  assert(CM.awareness.AWARENESS_STAGES.includes('UNKNOWN'));
  // a fear-only sample still resolves to a stage OR UNKNOWN; either way it must be valid
  assert(CM.awareness.validateAwareness(o.awareness).valid);
});

// ---------- W31..W40 ----------
W('W31', 'awareness mixed preserved', () => { const o = cm(FX.ADVERSARIAL.mixed_awareness, 'W31'); assert.strictEqual(o.awareness.stage, 'MIXED'); assert(Object.keys(o.awareness.stage_hits).length >= 2); });
W('W32', 'urgency evidence required', () => {
  const o = dental();
  if (o.urgency.level !== 'UNKNOWN') assert(o.urgency.evidence_refs.length > 0);
  assert(!CM.urgency.validateUrgency({ level: 'HIGH', evidence_refs: [], signals: [] }).valid);
});
W('W33', 'engagement frequency does not imply urgency', () => {
  const o = cm(FX.ADVERSARIAL.duplicate_speakers, 'W33');
  assert.strictEqual(o.urgency.level, 'UNKNOWN');
  assert(!(o.urgency.signals || []).some(s => /frequency|volume|engagement/i.test(s)));
});
W('W34', 'personal income not inferred', () => {
  const o = cm(spec([R_('b1', 'e_b1', 'Muy caro para mí.', { rating: 2 }), R_('b2', 'e_b2', 'Está caro.', { rating: 2 })], { b1: { speaker_ref: 'a' }, b2: { speaker_ref: 'b' } }), 'W34');
  assert.strictEqual(o.budget.signal, 'PRICE_SENSITIVE');
  assert(!/income|salary|wealth|net worth|ingresos|clase (alta|media|baja)/i.test(JSON.stringify(o.budget).replace(o.budget.note, '')));
  assert(!o.attributeEvidence.some(a => ['income', 'wealth', 'net_worth'].includes(a.attribute) && a.status !== 'UNKNOWN'));
});
W('W35', 'budget signal taxonomy controlled', () => { const o = dental(); assert(CM.budgetSignal.BUDGET_SIGNALS.includes(o.budget.signal)); });
W('W36', 'financing need represented without income inference', () => {
  const o = cm(spec([
    R_('f1', 'e_f1', '¿Tienen meses sin intereses? Necesito financiamiento.', { rating: 3 }),
    R_('f2', 'e_f2', '¿Puedo pagar a plazos?', { rating: 3 }),
  ], { f1: { speaker_ref: 'a' }, f2: { speaker_ref: 'b' } }), 'W36');
  assert.strictEqual(o.budget.signal, 'FINANCING_REQUIRED');
  assert(CM.budgetSignal.validateBudgetSignal(o.budget).valid);
});
W('W37', 'ICP distinct from Persona', () => {
  const o = cm(FX.ADVERSARIAL.b2b_multiple_roles, 'W37');
  assert.strictEqual(o.icp.kind, 'IdealCustomerProfile');
  assert(o.personas.every(p => p.kind === 'BuyerPersona'));
  for (const f of ['functional_pains', 'emotional_pains', 'fears', 'buying_language_refs']) assert(!(f in o.icp));
});
W('W38', 'ICP allows unknown revenue', () => { const o = cm(FX.ADVERSARIAL.missing_icp_revenue, 'W38'); assert(o.icp.revenue_range.status === 'UNKNOWN'); assert(CM.icp.validateICP(o.icp).valid); });
W('W39', 'ICP allows unknown employee count', () => { const o = cm(FX.ADVERSARIAL.missing_icp_employees, 'W39'); assert(o.icp.employees.status === 'UNKNOWN'); assert(CM.icp.validateICP(o.icp).valid); });
W('W40', 'B2C may omit ICP', () => { const o = dental(); assert.strictEqual(o.icp.status, 'NOT_APPLICABLE'); assert.strictEqual(o.buyingCommittee.status, 'NOT_APPLICABLE'); });

// ---------- W41..W50 ----------
W('W41', 'buying committee supports multiple roles', () => {
  const o = cm(FX.ADVERSARIAL.b2b_multiple_roles, 'W41');
  assert(o.buyingCommittee.roles_present.length >= 3 && o.buyingCommittee.distinct_parties >= 3);
  for (const r of o.buyingCommittee.members) assert(CM.buyingRoles.validateBuyingRole(r).valid);
});
W('W42', 'job title alone does not prove authority', () => {
  const o = cm(FX.ADVERSARIAL.title_without_authority, 'W42');
  const dm = o.buyingCommittee.members.find(m => m.role === 'DECISION_MAKER');
  assert(dm.authority_confirmed === false && dm.basis === 'ANALYTICAL' && /job title/i.test(dm.note));
});
W('W43', 'ICP fit deterministic', () => {
  const a = cm(FX.ADVERSARIAL.b2b_multiple_roles, 'W43'), b = cm(FX.ADVERSARIAL.b2b_multiple_roles, 'W43');
  assert.deepStrictEqual(a.icpFits.map(f => f.fit_id), b.icpFits.map(f => f.fit_id));
  for (const f of a.icpFits) assert(CM.icpFit.validateIcpFit(f).valid);
});
W('W44', 'configurable fit weights', () => {
  const custom = { problem_fit: 0.5, urgency_fit: 0.1, budget_fit: 0.1, solution_fit: 0.1, geographic_fit: 0.05, implementation_fit: 0.05, maturity_fit: 0.05, strategic_fit: 0.05 };
  const bi = { ...FX.ADVERSARIAL.b2b_multiple_roles.businessInput, fit_weights: custom };
  const o = cm(FX.ADVERSARIAL.b2b_multiple_roles, 'W44', bi);
  assert(o.icpFits.every(f => f.weights_version === 'custom'));
  const base = cm(FX.ADVERSARIAL.b2b_multiple_roles, 'W44b');
  assert(JSON.stringify(o.icpFits[0].weights) !== JSON.stringify(base.icpFits[0].weights));
});
W('W45', 'insufficient fit coverage -> UNKNOWN', () => {
  const o = cm(spec([R_('x1', 'e_x1', 'Muy caro.', { rating: 2 }), R_('x2', 'e_x2', 'Está caro.', { rating: 2 })], { x1: { speaker_ref: 'a' }, x2: { speaker_ref: 'b' } }), 'W45', { mode: 'B2B', icp_input: {} });
  assert(o.icpFits.some(f => f.total_score === null && f.fit_band === 'UNKNOWN' && f.reason_codes.includes('INSUFFICIENT_FIT_COVERAGE')));
});
W('W46', 'attractiveness distinct from market size', () => {
  const o = dental();
  for (const a of o.attractiveness) { assert(/INDEPENDENT OF MARKET SIZE/.test(a.market_size.note)); assert(CM.attractiveness.validateAttractiveness(a).valid); }
});
W('W47', 'attractiveness deterministic', () => {
  const a = cm(FX.VERTICALS.dental_clinic, 'W47'), b = cm(FX.VERTICALS.dental_clinic, 'W47');
  assert.deepStrictEqual(a.attractiveness.map(x => x.attractiveness_id), b.attractiveness.map(x => x.attractiveness_id));
});
W('W48', 'priority deterministic', () => {
  const a = cm(FX.VERTICALS.dental_clinic, 'W48'), b = cm(FX.VERTICALS.dental_clinic, 'W48');
  assert.deepStrictEqual(a.priorities.map(x => x.priority_id), b.priorities.map(x => x.priority_id));
  for (const p of a.priorities) assert(CM.priority.validatePriority(p).valid);
});
W('W49', 'priority does not trigger action', () => {
  const o = dental();
  for (const p of o.priorities) assert(p.is_analytical === true && p.triggers_action === false && p.autonomous_targeting === false);
});
W('W50', 'disqualification evidence-backed', () => {
  const o = cm(FX.VERTICALS.dental_clinic, 'W50', { disqualifiers: [
    { type: 'OUTSIDE_SERVICE_GEOGRAPHY', description: 'outside the metro area we serve', evidence_refs: ['e_d1'] },
    { type: 'CANNOT_IMPLEMENT', description: 'no chair-side capacity', evidence_refs: [] },
  ] });
  const geo = o.disqualifiers.find(d => d.disqualifier_type === 'OUTSIDE_SERVICE_GEOGRAPHY');
  assert(geo && !geo.rejected && geo.evidence_refs.length > 0);
  const noEv = o.disqualifiers.find(d => d.disqualifier_type === 'CANNOT_IMPLEMENT');
  assert(noEv && noEv.rejected && /evidence/i.test(noEv.rejection_reason));
});

// ---------- W51..W60 ----------
W('W51', 'demographic disqualification rejected', () => {
  const o = cm(FX.VERTICALS.dental_clinic, 'W51', { disqualifiers: [{ type: 'WRONG_USE_CASE', description: 'exclude low-income women over 50', evidence_refs: ['e_d1'] }] });
  const d = o.disqualifiers[0];
  assert(d.rejected && /demographic|identity/i.test(d.rejection_reason));
  assert(!CM.disqualification.validateDisqualifier({ ...d, rejected: false }).valid);
});
W('W52', 'Persona conflicts preserved', () => {
  const o = cm(FX.ADVERSARIAL.conflicting_pains, 'W52');
  // price + slowness both present as segments; nothing averaged away
  const concepts = new Set(o.segments.map(s => s.primary_concept));
  assert(concepts.size >= 2);
  for (const c of o.conflicts) assert(CM.conflicts.PERSONA_CONFLICT_STATUS.includes(c.status));
});
W('W53', 'conflict may produce separate segments', () => {
  const o = cm(spec([
    R_('p1', 'e_p1', 'Muy caro.', { rating: 2 }), R_('p2', 'e_p2', 'Está caro.', { rating: 2 }), R_('p3', 'e_p3', 'Demasiado caro.', { rating: 2 }),
    R_('a1', 'e_a1', 'No me pareció caro, vale la pena.', { rating: 5 }), R_('a2', 'e_a2', 'Buen precio, vale lo que cuesta.', { rating: 5 }), R_('a3', 'e_a3', 'Precio justo, excelente valor.', { rating: 5 }),
  ], { p1: { speaker_ref: 'a' }, p2: { speaker_ref: 'b' }, p3: { speaker_ref: 'c' }, a1: { speaker_ref: 'd' }, a2: { speaker_ref: 'e' }, a3: { speaker_ref: 'f' } }), 'W53');
  const c = o.conflicts.find(x => x.theme === 'price');
  assert(c && ['MIXED', 'POLARIZED'].includes(c.status) && c.likely_multiple_segments === true);
});
W('W54', 'Persona merge not based on label similarity', () => {
  const o = cm(FX.ADVERSARIAL.similar_persona_labels, 'W54');
  for (const m of o.mergeSplits) {
    if (m.status === 'MERGE_SUPPORTED') assert(m.attribute_similarity >= 0.6);
    assert(m.destructive_merge_performed === false);
    assert(CM.mergeSplit.validateMergeSplit(m).valid);
  }
});
W('W55', 'merge conflict -> REVIEW_REQUIRED', () => {
  const o = cm(spec([
    R_('p1', 'e_p1', 'Muy caro.', { rating: 2 }), R_('p2', 'e_p2', 'Está caro.', { rating: 2 }), R_('p3', 'e_p3', 'Demasiado caro.', { rating: 2 }),
    R_('a1', 'e_a1', 'No me pareció caro, vale la pena.', { rating: 5 }), R_('a2', 'e_a2', 'Buen precio.', { rating: 5 }), R_('a3', 'e_a3', 'Precio justo.', { rating: 5 }),
  ], { p1: { speaker_ref: 'a' }, p2: { speaker_ref: 'b' }, p3: { speaker_ref: 'c' }, a1: { speaker_ref: 'd' }, a2: { speaker_ref: 'e' }, a3: { speaker_ref: 'f' } }), 'W55');
  assert(o.mergeSplits.length >= 1 && o.mergeSplits.some(m => m.status === 'REVIEW_REQUIRED'));
});
W('W56', 'completion deterministic', () => {
  const a = cm(FX.VERTICALS.dental_clinic, 'W56'), b = cm(FX.VERTICALS.dental_clinic, 'W56');
  assert.strictEqual(a.completion.completion_id, b.completion.completion_id);
  assert(CM.completion.COMPLETION_STATUS.includes(a.completion.status));
  assert.strictEqual(a.completion.generated_by, 'deterministic:ucdm/customer_model/completion');
});
W('W57', 'low VOC coverage reason', () => {
  const o = cm(spec([R_('s1', 'e_s1', 'Muy caro.', { rating: 2 }), R_('s2', 'e_s2', 'Está caro.', { rating: 2 })], { s1: { speaker_ref: 'a' }, s2: { speaker_ref: 'b' } }), 'W57');
  assert(o.completion.reason_codes.includes('LOW_VOC_COVERAGE'));
});
W('W58', 'missing desired outcome reason', () => {
  const o = cm(FX.ADVERSARIAL.conflicting_pains, 'W58');
  assert(o.completion.reason_codes.includes('MISSING_DESIRED_OUTCOME'));
});
W('W59', 'report evidence graph valid', () => {
  const o = dental();
  assert(o.report.evidence_graph_valid, JSON.stringify(o.report.evidence_graph_errors));
  assert(o.report.section_names.length === 28);
});
W('W60', 'no production routing/autonomous action', () => {
  const o = dental();
  assert(o.report.caveats.some(c => /production routing or autonomous action/.test(c)));
  assert(o.provenance_note.includes('No production routing') && o.provenance_note.includes('No autonomous action'));
  assert(o.priorities.every(p => p.triggers_action === false));
});

// ---------- compatibility / security ----------
W('C1', 'ASTRA-11B compatibility', () => {
  assert.strictEqual(CM.UCDM_SCHEMA_VERSION, require('../src/commercial/schema/entities').SCHEMA_VERSION);
  const o = dental();
  for (const a of o.attributeEvidence) assert(require('../src/commercial/provenance/provenance').SOURCE_CLASSES.includes(a.source_class));
});
W('C2', 'ASTRA-11C compatibility', () => { const rr = research(FX.VERTICALS.dental_clinic, 'C2'); assert(rr.ingestion && Array.isArray(rr.ingestion.envelopes)); });
W('C3', 'ASTRA-11D compatibility', () => { const o = dental(); assert(o.coverage.market_fact_count >= 0 && 'market_evidence_present' in o.coverage); });
W('C4', 'ASTRA-11E compatibility', () => { assert.strictEqual(CM.COMPETITOR_SCHEMA_VERSION, require('../src/commercial/competitor/competitor_profile').COMPETITOR_SCHEMA_VERSION); });
W('C5', 'ASTRA-11F compatibility (consumes VoC result unchanged)', () => {
  const v = voc(FX.VERTICALS.dental_clinic, 'C5');
  const before = v.report.report_id;
  CM.engine.runCustomerModel({ vocResult: v, referenceTime: REF });
  assert.strictEqual(v.report.report_id, before);
  assert.strictEqual(CM.VOC_SCHEMA_VERSION, 'ucdm-voc-1.0.0');
});
W('C6', 'no network dependency', () => {
  let src = '';
  for (const f of fs.readdirSync(path.join(__dirname, '../src/commercial/customer_model'))) src += fs.readFileSync(path.join(__dirname, '../src/commercial/customer_model', f), 'utf8');
  assert(!/require\(['"](http|https|net|dns|tls|dgram)['"]\)|fetch\(|XMLHttpRequest|WebSocket/.test(src));
});
W('C7', 'no production DB dependency', () => {
  for (const f of fs.readdirSync(path.join(__dirname, '../src/commercial/customer_model'))) {
    const s = fs.readFileSync(path.join(__dirname, '../src/commercial/customer_model', f), 'utf8');
    assert(!/supabase|createClient|\bpg\b|mysql|mongodb|@vercel|kv\.set/i.test(s));
  }
});
W('C8', 'ASTRA-10 freeze unchanged', () => {
  const fr = JSON.parse(fs.readFileSync(path.join(__dirname, '../benchmarks/astra10ah/freeze.json'), 'utf8'));
  assert.strictEqual(fr.harness_hash_sha256, '57305a9dee3f9130d8f913e28280d759e78c32cee5affb0ac8931a4da725d53d');
  assert.strictEqual(fr.fixture_hash_sha256, 'b62ddc773a230c3e606280cf6a8df9dc0e5fe127cdbb38144f020a5c99dc4dd4');
});
W('C9', 'stable hashes', () => {
  const a = dental(), b = dental();
  assert.strictEqual(a.report.report_id, b.report.report_id);
  assert.strictEqual(a.report.content_hash, a.report.report_id);
});
W('C10', 'benchmark isolation', () => {
  const src = fs.readFileSync(path.join(__dirname, '../benchmarks/astra11g/run_customer_model_benchmark.js'), 'utf8');
  assert(!/writeFileSync|writeFile\(|appendFile|\.\.\/\.\.\/\.\.\//.test(src));
  assert(/ASTRA11G_BENCHMARK_RESULT/.test(src));
});

// ---------- W-matrix completeness ----------
const allW = [];
for (let i = 1; i <= 60; i++) allW.push('W' + i);
for (const c of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10']) allW.push(c);
const missing = allW.filter(id => !covered[id]);
if (missing.length) { console.log('FAIL W-matrix completeness :: missing', missing.join(',')); fail++; }
else console.log('PASS W-matrix completeness (W1..W60 + C1..C10 all have explicit test evidence)');

console.log(`\nASTRA11G_TEST_RESULT pass=${pass} fail=${fail}`);
if (fail) { console.log('FAILURES:\n' + fails.join('\n')); process.exit(1); }
