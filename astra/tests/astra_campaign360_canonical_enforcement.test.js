'use strict';
// ASTRA_CAMPAIGN360_CANONICAL_ENFORCEMENT — closes the confirmed FALSE_COMPLETE in Campaign360
// after CANONICAL_BRIEF_FACTS extraction was already correct (prior gate). Seven defects:
// (1) canonical facts invisible to the LLM prompt, (2) canonical constraints invisible to the
// LLM prompt, (3) known-fact denial not detected, (4) unlabeled new commercial ideas not
// blocked when the brief demands PROPUESTA labeling, (5) explicit brief prohibitions
// (testimonials/proof/urgency/scarcity/invented metrics) not enforced even when marked as a
// PROPUESTA, (6) positive preservation of ICP/offer/mechanism not required, (7) synthesis
// hardcoded a generic "provide price/geography" ask even when both are already known facts.
// Deterministic/fail-closed only — no LLM-based semantic detection. Offline, no network.
const assert = require('assert');
const H = require('../src/workflows/marketing_campaign_360_hardened');
const briefFacts = require('../src/workflows/campaign_brief_facts');
const fidelity = require('../src/workflows/brief_fidelity_validator');
const llmSpecialists = require('../src/specialists/llm_specialists');
const synthV2 = require('../src/synthesis/synthesis_engine_v2');
const { AgentV1Adapter } = require('../src/adapter/agent_v1_adapter');

const tests = []; let pass = 0, fail = 0;
function t(name, fn) { tests.push({ name, fn }); }

// ---------- frozen mandatory fixture, verbatim from the authorization (identical to the one in
// astra_campaign360_canonical_brief_contract.test.js) ----------
const STRUCTURED_METHOD360_BRIEF = [
  'Crea una campaña 360 para Método 360.',
  '',
  'Producto: minicurso grabado.',
  'Precio: $400 MXN.',
  'Audiencia: dueñas de estéticas en México.',
  'Geografía: México.',
  'Objetivo: vender el minicurso.',
  'Mecanismo exacto: enseña Meta Ads para generar consultas y WhatsApp para convertir consulta → conversación → cita.',
  '',
  'Restricciones obligatorias:',
  '- No cambiar el nombre Método 360.',
  '- No cambiar el precio de $400 MXN.',
  '- No cambiar la audiencia.',
  '- No cambiar el producto ni convertirlo en mentoría, servicio, membresía o asesoría.',
  '- No cambiar el mecanismo consulta → conversación → cita.',
  '- No inventar métricas, resultados, CAC, CPA, CPL, ROAS, MER, LTV, revenue, margen, conversiones, benchmarks, testimonios, proof, urgencia, escasez ni evidencia.',
  '- Cualquier dato faltante debe mantenerse como UNKNOWN.',
  '- Cualquier idea nueva debe marcarse explícitamente como PROPUESTA.',
  '- No presentar hipótesis como hechos.',
  '',
  'Estructura obligatoria:',
  'Mercado → ICP → Oferta → Funnel → Creatividad → Ads → Conversión → Medición.',
  '',
  'Prioridad comercial:',
  'Ventas > Ingresos > Oportunidades > Leads > Conversaciones > Clics > Métricas de vanidad.',
].join('\n');

const FACTS = briefFacts.extract(STRUCTURED_METHOD360_BRIEF);

// ---------- offline mock knowledge base + adapter (same pattern as astra_campaign360_brief_fidelity.test.js) ----------
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
// Neutral filler — mentions the mechanism's stages so the field-aware MECHANISM_PRESERVATION
// gate is satisfied wherever it applies (funnel/ads/whatsapp_conversion/final synthesis),
// without parroting every other canonical fact (keeps single-field adversarial overrides
// judged on their own, exactly like astra_campaign360_brief_fidelity.test.js's CLEAN_STATEMENT).
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
  return H.run(brief, { mode: 'llm', adapter: mockAdapter(), llm: buildMockLLM(overrides), retrieve: true, salt: 'canonical-enforcement' });
}

// ========== A. PROMPT_CANONICAL_FACTS_VISIBLE ==========
t('A. buildPrompt() includes CANONICAL_BRIEF_FACTS with every fact value, for every specialist type', () => {
  for (const st of Object.keys(SPEC_FIELDS)) {
    const { system } = llmSpecialists.buildPrompt({
      specialist_type: st, task_brief: { objective: 'x', business_type: 'y', language: 'es' },
      canonical_brief_facts: FACTS, selected_methods: {}, upstream_outputs: [], constraints: {}, knowledge_evidence: [],
    });
    assert(system.includes('CANONICAL_BRIEF_FACTS'), st);
    for (const v of ['Método 360', 'minicurso grabado', '400', 'MXN', 'dueñas de estéticas', 'México', 'vender el minicurso']) {
      assert(system.includes(v), `${st} missing "${v}"`);
    }
    assert(/immutable/i.test(system), st);
    assert(/UNKNOWN/.test(system), st);
    assert(/PROPUESTA/.test(system), st);
  }
});

// ========== B. PROMPT_CANONICAL_CONSTRAINTS_VISIBLE ==========
t('B. buildPrompt() exposes CANONICAL_CONSTRAINTS from canonical_brief_facts.constraints, additive to CONSTRAINTS', () => {
  const { user } = llmSpecialists.buildPrompt({
    specialist_type: 'OFFER_SPECIALIST', task_brief: { objective: 'x', business_type: 'y', language: 'es' },
    canonical_brief_facts: FACTS, selected_methods: {}, upstream_outputs: [], constraints: { budget: 'X' }, knowledge_evidence: [],
  });
  assert(user.includes('CANONICAL_CONSTRAINTS'));
  assert(user.includes('CONSTRAINTS'));
  for (const bullet of [
    'No cambiar el nombre Método 360', 'No cambiar el precio', 'No cambiar la audiencia',
    'No cambiar el producto', 'No cambiar el mecanismo', 'No inventar métricas',
    'UNKNOWN', 'PROPUESTA', 'No presentar hipótesis como hechos',
  ]) {
    assert(user.includes(bullet), `missing constraint bullet: ${bullet}`);
  }
  // Additive, not a replacement: the generic task-level constraints object must still be present.
  assert(user.includes('"budget":"X"') || user.includes('budget'));
});

// ========== C. PRICE_KNOWN_FACT_DENIAL (4 variants) ==========
const PRICE_DENIALS = ['precio desconocido', 'precio no definido', 'precio por confirmar', 'sin precio'];
for (const phrase of PRICE_DENIALS) {
  t(`C. KNOWN_FACT_DENIAL fires for "${phrase}" when price=400 is a USER_PROVIDED_FACT`, () => {
    const { violations } = fidelity.validateOutputAgainstFacts(FACTS, { downstream_payload: { offer_structure: phrase } }, { nodeId: 'offer' });
    assert(violations.some(v => v.type === 'KNOWN_FACT_DENIAL' && v.fact_field === 'price'), JSON.stringify(violations));
  });
}
t('C. KNOWN_FACT_DENIAL also covers buyer/geography/product/mechanism denial phrases', () => {
  const cases = [
    ['audiencia desconocida', 'buyer'], ['icp por definir', 'buyer'],
    ['geografía por definir', 'geography'], ['mercado por confirmar', 'geography'],
    ['producto por definir', 'product_name'], ['mecanismo por definir', 'mechanism'],
  ];
  for (const [phrase, field] of cases) {
    const { violations } = fidelity.validateOutputAgainstFacts(FACTS, { downstream_payload: { notes: phrase } }, { nodeId: 'icp' });
    assert(violations.some(v => v.type === 'KNOWN_FACT_DENIAL' && v.fact_field === field), `${phrase} -> ${JSON.stringify(violations)}`);
  }
});

// ========== D. BUYER_POSITIVE_PRESERVATION ==========
t('D. a node addressing audience that drops "dueñas de estéticas" fails POSITIVE_PRESERVATION_MISSING', () => {
  const { violations } = fidelity.validateOutputAgainstFacts(FACTS, { downstream_payload: { audience_approach: 'audiencia: profesionales con poco tiempo, ocupados' } }, { nodeId: 'ads' });
  assert(violations.some(v => v.type === 'POSITIVE_PRESERVATION_MISSING' && v.fact_field === 'buyer'), JSON.stringify(violations));
});
t('D. a node that preserves "dueñas de estéticas" (or a clear equivalent) passes', () => {
  const { violations } = fidelity.validateOutputAgainstFacts(FACTS, { downstream_payload: { audience_approach: 'público objetivo: dueñas de estéticas en México, saturadas de trabajo' } }, { nodeId: 'ads' });
  assert.deepStrictEqual(violations.filter(v => v.type === 'POSITIVE_PRESERVATION_MISSING'), []);
});

// ========== E. MECHANISM_SUBSTITUTION ==========
t('E. funnel substituting webinar->checkout for consulta->conversación->cita fails closed', () => {
  const { violations } = fidelity.validateOutputAgainstFacts(FACTS, { downstream_payload: { stages: 'funnel principal: webinar -> checkout' } }, { nodeId: 'funnel' });
  assert(violations.some(v => v.type === 'MECHANISM_SUBSTITUTION'), JSON.stringify(violations));
});
t('E. funnel preserving consulta -> conversación -> cita passes mechanism preservation', () => {
  const { violations } = fidelity.validateOutputAgainstFacts(FACTS, { downstream_payload: { stages: 'consulta -> conversación -> cita via WhatsApp' } }, { nodeId: 'funnel' });
  assert.deepStrictEqual(violations.filter(v => v.type === 'MECHANISM_SUBSTITUTION'), []);
});

// ========== F. UNLABELED_NEW_IDEA ==========
const UNSUPPORTED_ADDITIONS = ['webinar demo', '3 plantillas descargables', 'curso de 90 minutos', 'muestra gratis', 'testimonios', 'oferta limitada', 'deadline', 'nurture por email', 'Calendly'];
for (const idea of UNSUPPORTED_ADDITIONS) {
  t(`F. "${idea}" unlabeled (no PROPUESTA marker) fails UNLABELED_PROPOSAL`, () => {
    const { violations } = fidelity.validateOutputAgainstFacts(FACTS, { downstream_payload: { offer_structure: `incluimos ${idea} como parte de la oferta` } }, { nodeId: 'offer' });
    assert(violations.some(v => v.type === 'UNLABELED_PROPOSAL'), `${idea} -> ${JSON.stringify(violations)}`);
  });
}

// ========== G. LABELED_PROPOSAL ==========
t('G. the same ideas, correctly marked PROPUESTA and non-replacing, pass', () => {
  const { violations } = fidelity.validateOutputAgainstFacts(FACTS, {
    downstream_payload: { offer_structure: 'Oferta principal: Método 360, minicurso grabado, 400 MXN. PROPUESTA: probar webinar demo y 3 plantillas descargables como lead magnet secundario, sin sustituir el producto.' },
  }, { nodeId: 'offer' });
  assert.deepStrictEqual(violations.filter(v => v.type === 'UNLABELED_PROPOSAL'), []);
});

// ========== H. EXPLICIT_PROHIBITION ==========
const PROHIBITED_UNLABELED = ['usar testimonios de clientes', 'oferta limitada por tiempo', 'ROAS objetivo de 3x'];
for (const phrase of PROHIBITED_UNLABELED) {
  t(`H. "${phrase}" fails EXPLICIT_PROHIBITION even when constraints prohibit it`, () => {
    const { violations } = fidelity.validateOutputAgainstFacts(FACTS, { downstream_payload: { creative_testing: phrase } }, { nodeId: 'ads' });
    assert(violations.some(v => v.type === 'EXPLICIT_PROHIBITION'), `${phrase} -> ${JSON.stringify(violations)}`);
  });
}
for (const phrase of ['caso de estudio real', 'deadline de inscripción', 'garantizamos resultados']) {
  t(`H. "${phrase}" is not an EXPLICIT_PROHIBITION when its own category is absent from constraints`, () => {
    const { violations } = fidelity.validateOutputAgainstFacts(FACTS, { downstream_payload: { creative_testing: phrase } }, { nodeId: 'ads' });
    assert.deepStrictEqual(violations.filter(v => v.type === 'EXPLICIT_PROHIBITION'), [], JSON.stringify(violations));
  });
}
t('H. a PROPUESTA-marked prohibited category still fails (no marker escape for explicit prohibitions)', () => {
  const { violations } = fidelity.validateOutputAgainstFacts(FACTS, { downstream_payload: { creative_testing: 'PROPUESTA: usar testimonios de clientes satisfechos' } }, { nodeId: 'ads' });
  assert(violations.some(v => v.type === 'EXPLICIT_PROHIBITION'), JSON.stringify(violations));
});
t('H. negated mentions of a prohibited category do NOT fail ("no usar testimonios", "testimonios = UNKNOWN", "sin proof disponible")', () => {
  for (const phrase of ['no usar testimonios', 'testimonios = UNKNOWN', 'sin proof disponible']) {
    const { violations } = fidelity.validateOutputAgainstFacts(FACTS, { downstream_payload: { creative_testing: phrase } }, { nodeId: 'ads' });
    assert.deepStrictEqual(violations, [], `${phrase} -> ${JSON.stringify(violations)}`);
  }
});

// ========== I. SYNTHESIS_FACT_AWARE_UNKNOWN ==========
t('I. synthesize() with all facts known never asks to provide price or geography', () => {
  const node_outputs = [{ work_unit_id: 'icp', output: { downstream_payload: {}, recommendations: [], assumptions: [], conflicts: [], current_research_required: [], evidence_used: [] } }];
  const r = synthV2.synthesize({ brief: { objective: 'x' }, node_outputs, selected_methods_by_node: {}, canonicalBriefFacts: FACTS });
  const actions = r.deliverable['18_recommended_next_actions'].join(' | ');
  assert(!/provide user_provided_facts.*\bprice\b/i.test(actions), actions);
  assert(!/provide user_provided_facts.*geography/i.test(actions), actions);
});
t('I. synthesize() can request a field that is genuinely UNKNOWN (buyer, when Audiencia: is absent)', () => {
  const noAudience = STRUCTURED_METHOD360_BRIEF.replace(/^Audiencia:.*$/m, '');
  const factsNoBuyer = briefFacts.extract(noAudience);
  assert.equal(factsNoBuyer.buyer.status, 'UNKNOWN');
  const node_outputs = [{ work_unit_id: 'icp', output: { downstream_payload: {}, recommendations: [], assumptions: [], conflicts: [], current_research_required: [], evidence_used: [] } }];
  const r = synthV2.synthesize({ brief: { objective: 'x' }, node_outputs, selected_methods_by_node: {}, canonicalBriefFacts: factsNoBuyer });
  const actions = r.deliverable['18_recommended_next_actions'].join(' | ');
  assert(/buyer/i.test(actions), actions);
});
t('I. legacy call (no canonicalBriefFacts) keeps the generic fallback line for backward compatibility', () => {
  const node_outputs = [{ work_unit_id: 'icp', output: { downstream_payload: {}, recommendations: [], assumptions: [], conflicts: [], current_research_required: [], evidence_used: [] } }];
  const r = synthV2.synthesize({ brief: { objective: 'x' }, node_outputs, selected_methods_by_node: {} });
  const actions = r.deliverable['18_recommended_next_actions'].join(' | ');
  assert(/Provide USER_PROVIDED_FACTS \(price\/margin, capacity, geography, promos\)/.test(actions), actions);
});

// ========== J. FULL_METHOD360_ADVERSARIAL — full pipeline sim of the confirmed E2E failure ==========
t('J. full adversarial Método 360 run does NOT reach COMPLETE and fails closed with BRIEF_FIDELITY_VIOLATION', async () => {
  // [ASTRA_CAMPAIGN360_NODE_FIDELITY_DIAGNOSTIC_PROPAGATION] a node-level BRIEF_FIDELITY_VIOLATION
  // now resolves H.run() with a structured FAILED result (never a thrown exception, and never
  // COMPLETE) — see astra_campaign360_node_fidelity_diagnostic_propagation.test.js for the
  // dedicated coverage of that contract change itself.
  const r = await runWith(STRUCTURED_METHOD360_BRIEF, {
    ICP_SPECIALIST: { pains: 'ICP: profesionales adultos con poco tiempo, ocupados' },
    OFFER_SPECIALIST: { offer_structure: 'incluimos webinar demo, 3 plantillas descargables y muestra gratis; usamos testimonios de clientes; oferta limitada con deadline' },
    FUNNEL_SPECIALIST: { stages: 'curso de 90 minutos, funnel webinar -> checkout directo' },
    MARKET_CONTEXT_SPECIALIST: { problem_context: 'precio por confirmar, sin precio definido aún' },
  });
  assert.notEqual(r.workflow_state_status, 'COMPLETE');
  assert.equal(r.workflow_state_status, 'FAILED');
  assert.equal(r.reason, 'BRIEF_FIDELITY_VIOLATION');
  assert(Array.isArray(r.brief_fidelity_violations) && r.brief_fidelity_violations.length > 0);
  for (const v of r.brief_fidelity_violations) assert(typeof v.type === 'string' && v.node);
});

// ========== K. CLEAN_METHOD360 — faithful output must COMPLETE ==========
t('K. a faithful full-pipeline Método 360 run (no unlabeled additions, every fact preserved) reaches COMPLETE', async () => {
  const r = await runWith(STRUCTURED_METHOD360_BRIEF);
  assert.equal(r.workflow_state_status, 'COMPLETE');
  assert.notEqual(r.reason, 'BRIEF_FIDELITY_VIOLATION');
  assert.equal(r.canonical_brief_facts.product_name.value, 'Método 360');
  assert.equal(r.canonical_brief_facts.price.value, '400');
  assert.equal(r.canonical_brief_facts.buyer.value, 'dueñas de estéticas');
  assert.equal(r.brief.objective, 'vender el minicurso');
  for (const no of r.node_outputs) {
    const { violations } = fidelity.validateOutputAgainstFacts(r.canonical_brief_facts, no.output, { nodeId: no.work_unit_id });
    assert.deepStrictEqual(violations, [], `${no.work_unit_id}: ${JSON.stringify(violations)}`);
  }
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (e) { fail += 1; console.log('FAIL', x.name, '::', e && e.message); }
  }
  console.log(`\nASTRA_CAMPAIGN360_CANONICAL_ENFORCEMENT_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
