'use strict';
// ASTRA_CAMPAIGN360_OFFER_CONSTRAINT_ADHERENCE_AND_NEGATIVE_CONSTRAINT_SEMANTICS_REMEDIATION —
// confirmed live defects (job 58a4113f-9e0a-413f-b84f-094a7132298a, request
// 262bcd8f-ed1c-4689-8da2-0f56e526011a; workflow FAILED at node "offer"):
//
// DEFECT A — OFFER CONSTRAINT ADHERENCE. offer.value_proposition = "PROPUESTA:Llena citas y
// aumenta ventas usando WhatsApp con tácticas prácticas en minicurso" under a canonical constraint
// prohibiting invented "resultados". The validator correctly caught this (2 TRUE POSITIVE
// invented_result violations, "citas"/"aumenta") and correctly failed the node closed — that part
// of the architecture is untouched and non-negotiable (EXPLICIT_PROHIBITION is deliberately never
// auto-repaired; see marketing_campaign_360_hardened.js's REPAIRABLE_VIOLATION_TYPES). The actual
// gap: the GENERATION never had a fair chance — CANONICAL_CONSTRAINTS reached the offer specialist
// only as raw brief text, with no actionable translation of what "resultados" means for a
// naturally outcome-oriented schema field like "value_proposition", and no explicit statement
// that PROPUESTA never lifts a prohibition. llm_specialists.js's buildPrompt() now derives
// concrete, per-category directives from the SAME activeExplicitProhibitionCategories() detector
// the validator itself uses (no duplicate/drifting classification) — reused, not reinvented.
//
// DEFECT B — NEGATIVE CONSTRAINT FALSE POSITIVE. offer.constraints =
// "PROPUESTA:No declarar métricas ni testimonios" flagged "testimonios" as a testimonials
// violation — mentioning a prohibited category INSIDE a negative instruction (the constraints
// field literally restating/echoing a prohibition) is not using or inventing it. Fixed in
// brief_fidelity_validator.js's checkExplicitProhibition() negation handling: "declarar" was
// missing from the negatable-verb list, and "evitar X" / bare "sin X" had no negation cue at all.
//
// Offline, deterministic. No network, no real LLM calls.
const assert = require('assert');
const H = require('../src/workflows/marketing_campaign_360_hardened');
const fidelity = require('../src/workflows/brief_fidelity_validator');
const llmSpecialists = require('../src/specialists/llm_specialists');
const { AgentV1Adapter } = require('../src/adapter/agent_v1_adapter');

const tests = []; let pass = 0, fail = 0;
function t(name, fn) { tests.push({ name, fn }); }

const CANONICAL_CONSTRAINT = 'No inventes métricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia.';
const LIVE_NATURAL_BRIEF = [
  'Crea una campaña 360 para Método 360.',
  '',
  'Es un minicurso grabado de $400 MXN dirigido a dueñas de estéticas en México.',
  '',
  'Objetivo: vender el minicurso.',
  '',
  'Enseña Meta Ads para generar consultas y WhatsApp para convertir:',
  'consulta → conversación → cita.',
  '',
  CANONICAL_CONSTRAINT,
].join('\n');

// ---------- helpers ----------
function violations(nodeId, fieldKey, text, constraintValue = CANONICAL_CONSTRAINT) {
  const facts = { constraints: { status: 'USER_PROVIDED_FACT', value: constraintValue } };
  return fidelity.validateOutputAgainstFacts(facts, { downstream_payload: { [fieldKey]: text } }, { nodeId }).violations;
}
function categories(v) { return v.map(x => x.category).filter(Boolean); }

function mockKb() {
  return {
    async retrieveStrategyFAsync(query) {
      const hits = Array.from({ length: 5 }, (_, i) => ({ rank: i + 1, chunk_id: 'c' + i, source_pdf_name: 'S.pdf', pdf_page_refs: '1', content: 'evidence ' + query, original_query_cosine: 0.6, rag_decision: 'CITE', quality_status: 'OK', warning_flags: [] }));
      return { top5: hits, advisory_top1_cosine: 0.6 };
    },
    buildStrategyFEvidence(raw) {
      const hits = raw.top5 || [];
      return { evidenceText: hits.map(h => h.content).join('\n'), hits, advisoryTop1Cosine: raw.advisory_top1_cosine, pipeline: 'Strategy-F', corpus: 'kb_chunks_v2' };
    },
  };
}
function mockAdapter() { return new AgentV1Adapter({ kb: mockKb() }); }
function specTypeFromSystem(sys) { const m = /You are ASTRA's ([A-Z_]+)/.exec(sys); return m ? m[1] : 'UNKNOWN'; }
const SPEC_FIELDS = {
  MARKET_CONTEXT_SPECIALIST: ['problem_context', 'market_assumptions', 'constraints'],
  ICP_SPECIALIST: ['pains', 'desired_outcomes', 'objections', 'buying_triggers', 'qualification_signals', 'non_fit_signals'],
  OFFER_SPECIALIST: ['value_proposition', 'offer_structure', 'mechanism', 'risk_reduction', 'value_stack', 'constraints'],
  FUNNEL_SPECIALIST: ['stages', 'transitions', 'conversion_intent', 'qualification_points', 'drop_off_risks', 'dependencies'],
  CREATIVE_STRATEGY_SPECIALIST: ['core_idea', 'single_minded_proposition', 'angles', 'creative_territories', 'hooks', 'proof', 'objection_coverage'],
  META_ADS_SPECIALIST: ['campaign_objective', 'audience_approach', 'structure', 'creative_testing', 'qualification', 'measurement', 'limitations'],
  WHATSAPP_SALES_SPECIALIST: ['qualification', 'discovery', 'objection_handling', 'appointment_closing', 'follow_up', 'recovery', 'conversational_logic', 'limitations'],
  MEASUREMENT_CRO_SPECIALIST: ['primary_outcome', 'leading_indicators', 'funnel_metrics', 'conversion_metrics', 'diagnostic_metrics', 'optimization_triggers', 'measurement_cadence'],
};
const CLEAN_STATEMENT = 'Contenido determinístico de prueba para este nodo, alineado al brief original del cliente Método 360, sin cambiar la oferta ni el público declarados. Flujo: consulta → conversación → cita.';
function buildMockLLM(overrides = {}) {
  return async (system) => {
    const st = specTypeFromSystem(system);
    const fields = SPEC_FIELDS[st] || [];
    const payload = {};
    for (const f of fields) payload[f] = CLEAN_STATEMENT;
    Object.assign(payload, overrides[st] || {});
    const current = /META_ADS/.test(st) ? ['CAPI', 'current attribution'] : (/WHATSAPP/.test(st) ? ['current WhatsApp API mechanics'] : []);
    const obj = {
      findings: [{ claim: 'grounded finding', support_class: 'DIRECTLY_SUPPORTED', evidence_ref: 'E1' }],
      recommendations: [{ recommendation: 'action for ' + st, support_class: 'INFERENCE', basis: 'method' }],
      decisions: [{ decision: 'd', rationale: 'r' }], assumptions: ['needs USER_PROVIDED_FACTS: budget'], conflicts: [], confidence: 0.7,
      current_research_required: current, downstream_payload: payload,
    };
    return { raw: JSON.stringify(obj), usage: { prompt: 10, completion: 10 } };
  };
}
function runWith(brief, overrides = {}) {
  return H.run(brief, { mode: 'llm', adapter: mockAdapter(), llm: buildMockLLM(overrides), retrieve: true, salt: 'offer-adherence' });
}

// ========== LIVE FIXTURE — reproduce exactly ==========
t('LIVE FIXTURE: the 2 live TRUE POSITIVE invented_result violations are still caught (plus "Llena" itself, a genuine gap closed by CASE A2), and the testimonials FALSE POSITIVE is gone', () => {
  const facts = { constraints: { status: 'USER_PROVIDED_FACT', value: CANONICAL_CONSTRAINT } };
  const output = {
    downstream_payload: {
      value_proposition: 'PROPUESTA:Llena citas y aumenta ventas usando WhatsApp con tácticas prácticas en minicurso',
      constraints: 'PROPUESTA:No declarar métricas ni testimonios',
    },
  };
  const { violations: v } = fidelity.validateOutputAgainstFacts(facts, output, { nodeId: 'offer' });
  const invented = v.filter(x => x.category === 'invented_result');
  const testimonial = v.filter(x => x.category === 'testimonials');
  // Both live TRUE POSITIVEs remain — never weakened.
  assert(invented.some(x => x.matched_text === 'citas'), JSON.stringify(v));
  assert(invented.some(x => x.matched_text === 'aumenta'), JSON.stringify(v));
  assert.deepStrictEqual(testimonial, [], JSON.stringify(v)); // FALSE POSITIVE — now fixed
});

// ========== TEST 1 — direct validator preservation ==========
t('TEST 1: direct validator call on "PROPUESTA: Llena citas y aumenta ventas" still DETECTS invented_result', () => {
  const v = violations('offer', 'value_proposition', 'PROPUESTA: Llena citas y aumenta ventas');
  assert(categories(v).includes('invented_result'), JSON.stringify(v));
});

// ========== TEST 2 — offer node never accepts a prohibited candidate as valid output ==========
t('TEST 2: offer node under "No inventes resultados" never reaches COMPLETE with a prohibited value_proposition candidate', async () => {
  const r = await runWith(LIVE_NATURAL_BRIEF, { OFFER_SPECIALIST: { value_proposition: 'PROPUESTA: Llena citas y aumenta ventas usando WhatsApp' } });
  assert.equal(r.workflow_state_status, 'FAILED');
  assert.equal(r.reason, 'BRIEF_FIDELITY_VIOLATION');
  assert(r.brief_fidelity_violations.some(v => v.category === 'invented_result' && v.node === 'offer'));
});

// ========== CASE A1-A3, A8-A10: prohibited candidates never accepted, whole pipeline ==========
const BLOCKED_CANDIDATES = [
  ['A1', 'PROPUESTA: Aumenta tus ventas con anuncios y WhatsApp', 'invented_result'],
  ['A2', 'PROPUESTA: Llena citas con WhatsApp', 'invented_result'],
  ['A3', 'PROPUESTA: Consigue más clientes', 'invented_result'],
  ['A8', 'PROPUESTA: Aumenta ventas 30% en 30 días', 'invented_result'],
  ['A9', 'PROPUESTA: Resultados garantizados', 'invented_result'],
  ['A10', 'PROPUESTA: Scripts WhatsApp probados', 'invented_evidence'],
];
for (const [label, candidate, expectedCategory] of BLOCKED_CANDIDATES) {
  t(`CASE ${label}: "${candidate}" is never accepted as offer output (pipeline FAILED, category=${expectedCategory})`, async () => {
    const r = await runWith(LIVE_NATURAL_BRIEF, { OFFER_SPECIALIST: { value_proposition: candidate } });
    assert.equal(r.workflow_state_status, 'FAILED');
    assert.equal(r.reason, 'BRIEF_FIDELITY_VIOLATION');
    assert(r.brief_fidelity_violations.some(v => v.category === expectedCategory && v.node === 'offer'), JSON.stringify(r.brief_fidelity_violations));
  });
}

// ========== CASE A4-A7: legitimate mechanism/process language stays permitted ==========
const VALID_CANDIDATES = [
  ['A4', 'PROPUESTA: Aprende a crear anuncios y gestionar conversaciones por WhatsApp'],
  ['A5', 'PROPUESTA: Aprende a usar Meta Ads para generar consultas'],
  ['A6', 'PROPUESTA: Aprende a convertir consulta → conversación → cita por WhatsApp'],
  ['A7', 'PROPUESTA: Te enseñamos un proceso para gestionar consultas hasta la cita'],
];
for (const [label, candidate] of VALID_CANDIDATES) {
  t(`CASE ${label}: "${candidate}" (mechanism/process description) triggers NO invented_result`, () => {
    const v = violations('offer', 'value_proposition', candidate);
    assert.deepStrictEqual(categories(v).filter(c => c === 'invented_result'), [], JSON.stringify(v));
  });
}

// ========== CASE A11: no result-prohibiting constraint -> no new universal prohibition ==========
t('CASE A11: without a result-prohibiting constraint, "Aumenta ventas" is unaffected (existing architecture, no new global censorship)', () => {
  const v = violations('offer', 'value_proposition', 'PROPUESTA: Aumenta ventas', 'No inventes testimonios.');
  assert.deepStrictEqual(categories(v).filter(c => c === 'invented_result'), []);
});

// ========== PROMPT GUIDANCE — buildPrompt derives concrete guidance from active categories ==========
t('PROMPT: buildPrompt() injects CONSTRAINT-DERIVED PROHIBITIONS when invented_result is active, for the offer specialist', () => {
  const canonical_brief_facts = { constraints: { value: CANONICAL_CONSTRAINT, status: 'USER_PROVIDED_FACT' } };
  const { system } = llmSpecialists.buildPrompt({
    specialist_type: 'OFFER_SPECIALIST', task_brief: { objective: 'x', business_type: 'y', language: 'es' },
    canonical_brief_facts, selected_methods: {}, upstream_outputs: [], constraints: {}, knowledge_evidence: [],
  });
  assert(system.includes('CONSTRAINT-DERIVED PROHIBITIONS'), system);
  assert(/business RESULT/i.test(system));
  assert(/mechanism\/process\/content/i.test(system));
  assert(/PROPUESTA.*never lifts a prohibition/i.test(system));
});
t('PROMPT: no CONSTRAINT-DERIVED PROHIBITIONS section is injected when no explicit prohibition is active (no new universal restriction)', () => {
  const canonical_brief_facts = { constraints: { value: null, status: 'UNKNOWN' } };
  const { system } = llmSpecialists.buildPrompt({
    specialist_type: 'OFFER_SPECIALIST', task_brief: { objective: 'x', business_type: 'y', language: 'es' },
    canonical_brief_facts, selected_methods: {}, upstream_outputs: [], constraints: {}, knowledge_evidence: [],
  });
  assert(!system.includes('CONSTRAINT-DERIVED PROHIBITIONS'), system);
});
t('PROMPT: the guidance applies identically to any specialist (generalizable, not hardcoded to offer/Método 360)', () => {
  const canonical_brief_facts = { constraints: { value: 'No inventes testimonios ni evidencia.', status: 'USER_PROVIDED_FACT' } };
  const { system } = llmSpecialists.buildPrompt({
    specialist_type: 'WHATSAPP_SALES_SPECIALIST', task_brief: { objective: 'x', business_type: 'y', language: 'es' },
    canonical_brief_facts, selected_methods: {}, upstream_outputs: [], constraints: {}, knowledge_evidence: [],
  });
  assert(system.includes('CONSTRAINT-DERIVED PROHIBITIONS'));
  assert(/customer testimonial/i.test(system));
  assert(!/business RESULT/i.test(system)); // invented_result not active for this constraint text
});

// ========== DEFECT B — CASE B1-B12 ==========
const NEG_PASS = [
  ['B1', 'No declarar testimonios'],
  ['B2', 'No usar testimonios'],
  ['B3', 'Evitar testimonios'],
  ['B4', 'Sin testimonios'],
  ['B5', 'No inventar evidencia ni testimonios'],
  ['B8', 'No declarar métricas ni testimonios'],
  ['B11', 'PROPUESTA: No declarar testimonios'],
];
for (const [label, text] of NEG_PASS) {
  t(`CASE ${label}: constraints field "${text}" produces NO testimonials/evidence violation`, () => {
    const v = violations('offer', 'constraints', text);
    assert.deepStrictEqual(categories(v).filter(c => c === 'testimonials' || c === 'invented_evidence'), [], JSON.stringify(v));
  });
}
t('CASE B6: ad_copy "Testimonio: Ana duplicó sus ventas" still DETECTS testimonials', () => {
  const v = violations('ads', 'ad_copy', 'Testimonio: Ana duplicó sus ventas');
  assert(categories(v).includes('testimonials'), JSON.stringify(v));
});
t('CASE B9: constraints "Usar testimonios reales" still DETECTS (no blanket field escape)', () => {
  const v = violations('offer', 'constraints', 'Usar testimonios reales');
  assert(categories(v).includes('testimonials'), JSON.stringify(v));
});
t('CASE B10: constraints "Incluir testimonios" still DETECTS (no blanket field escape)', () => {
  const v = violations('offer', 'constraints', 'Incluir testimonios');
  assert(categories(v).includes('testimonials'), JSON.stringify(v));
});
t('CASE B12: constraints "PROPUESTA: incluir testimonios" still DETECTS (no PROPUESTA bypass)', () => {
  const v = violations('offer', 'constraints', 'PROPUESTA: incluir testimonios');
  assert(categories(v).includes('testimonials'), JSON.stringify(v));
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (e) { fail += 1; console.log('FAIL', x.name, '::', e && e.message); }
  }
  console.log(`\nASTRA_CAMPAIGN360_OFFER_CONSTRAINT_ADHERENCE_AND_NEGATIVE_CONSTRAINT_SEMANTICS_REMEDIATION_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
