'use strict';
// ASTRA_CAMPAIGN360_UNKNOWN_FIDELITY_REMEDIATION — confirmed live defect (job
// 3a26d98b-02db-4ce9-99ac-14606f306e13): the raw brief explicitly kept business_objective
// UNKNOWN, canonical_brief_facts.business_objective.status correctly came out UNKNOWN, yet
// final_synthesis.1_business_objective asserted the concrete "CLIENT_ACQUISITION" — sourced from
// intent_analyzer's heuristic ROUTING classification, never itself a business fact — with
// brief_fidelity_violations = []. Root cause traced through:
//   raw brief -> campaign_brief_facts.extract() (correct: business_objective.status=UNKNOWN)
//   -> marketing_campaign_360_hardened.js's [Immutable Fact Lock] (line ~191): when the canonical
//      objective is NOT a USER_PROVIDED_FACT, `brief` falls back to intent_analyzer's heuristic
//      `ia.brief` unchanged (this part is correct and intentional as a ROUTING signal for method
//      selection — untouched here)
//   -> synthesis_engine_v2.js line 40 (THE DEFECT): '1_business_objective': brief.objective ||
//      'CLIENT_ACQUISITION' — treated that routing heuristic (or its own hardcoded literal
//      fallback) as if it were an affirmed canonical fact, with no fact-awareness at all
//   -> brief_fidelity_validator.js (THE GAP): every existing check only fires when a fact IS a
//      USER_PROVIDED_FACT (substitution/denial of a KNOWN fact); nothing ever validated the
//      opposite direction — an UNKNOWN fact being promoted to a concrete affirmed value.
// Fix (both, per the two independent gaps found):
//   1. synthesis_engine_v2.js — deterministic source-level repair: when canonicalBriefFacts says
//      business_objective is UNKNOWN, '1_business_objective' now honestly reads 'UNKNOWN' instead
//      of fabricating from the heuristic/literal fallback.
//   2. brief_fidelity_validator.js — new UNKNOWN_FACT_FABRICATION check (mirror of the existing
//      KNOWN_FACT_DENIAL), wired ONLY into validateFinalSynthesis (never per-node — a specialist
//      node routinely writes ordinary tactical prose into fields like campaign_objective/
//      mechanism while the fact is legitimately UNKNOWN; flagging that is normal elaboration, not
//      fabrication, and would false-positive on the existing R1 regression test). Scoped to the
//      field keys whose entire schema purpose IS to state that exact fact.
// Offline, deterministic. No network, no real LLM calls.
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');
const synthV2 = require('../src/synthesis/synthesis_engine_v2');
const H = require('../src/workflows/marketing_campaign_360_hardened');
const { AgentV1Adapter } = require('../src/adapter/agent_v1_adapter');

const tests = []; let pass = 0, fail = 0;
function t(name, fn) { tests.push({ name, fn }); }

function factsWith(overrides) {
  const base = {
    product_name: { status: 'UNKNOWN', value: null }, product_type: { status: 'UNKNOWN', value: null },
    price: { status: 'UNKNOWN', value: null }, currency: { status: 'UNKNOWN', value: null },
    buyer: { status: 'UNKNOWN', value: null }, geography: { status: 'UNKNOWN', value: null },
    business_objective: { status: 'UNKNOWN', value: null }, mechanism: { status: 'UNKNOWN', value: null },
    constraints: { status: 'UNKNOWN', value: null },
  };
  return { ...base, ...overrides };
}

// ========== CASE 1: canonical UNKNOWN, final asserted concrete fact => DETECT ==========
t('CASE 1 business_objective UNKNOWN -> deliverable asserts CLIENT_ACQUISITION => DETECT (never violations=[])', () => {
  const facts = factsWith({});
  const synthesis = { deliverable: { '1_business_objective': 'CLIENT_ACQUISITION' } };
  const { violations } = fidelity.validateFinalSynthesis(facts, synthesis);
  assert(violations.some(v => v.type === 'UNKNOWN_FACT_FABRICATION' && v.fact_field === 'business_objective'), JSON.stringify(violations));
  assert.notDeepStrictEqual(violations, []);
});

// ========== CASE 2: canonical UNKNOWN, final "PROPUESTA: ..." => permitted (does not replace) ==========
t('CASE 2 business_objective UNKNOWN -> deliverable leads with PROPUESTA marker => PASS (labeled proposal, not silent replacement)', () => {
  const facts = factsWith({});
  const synthesis = { deliverable: { '1_business_objective': 'PROPUESTA: explorar adquisición de clientes como objetivo inicial, a validar' } };
  const { violations } = fidelity.validateFinalSynthesis(facts, synthesis);
  assert.deepStrictEqual(violations.filter(v => v.type === 'UNKNOWN_FACT_FABRICATION'), []);
});

// ========== CASE 3: canonical KNOWN = exact value, final exact value => PASS ==========
t('CASE 3 business_objective KNOWN = "vender el minicurso", deliverable echoes it exactly => PASS', () => {
  const facts = factsWith({ business_objective: { status: 'USER_PROVIDED_FACT', value: 'vender el minicurso' } });
  const synthesis = { deliverable: { '1_business_objective': 'vender el minicurso' } };
  const { violations } = fidelity.validateFinalSynthesis(facts, synthesis);
  assert.deepStrictEqual(violations, []);
});

// ========== CASE 4: canonical KNOWN, final contradictory value => DETECT ==========
t('CASE 4 business_objective KNOWN = "vender el minicurso", node output asserts CLIENT_ACQUISITION => DETECT', () => {
  const facts = factsWith({ business_objective: { status: 'USER_PROVIDED_FACT', value: 'vender el minicurso' } });
  const { violations } = fidelity.validateOutputAgainstFacts(facts, { downstream_payload: { campaign_objective: 'objective: CLIENT_ACQUISITION, generar leads' } }, { nodeId: 'ads' });
  assert(violations.some(v => v.type === 'BUSINESS_OBJECTIVE_SUBSTITUTION'), JSON.stringify(violations));
});

// ========== CASE 5: explicit_unknown + heuristic/classifier supplies value => full pipeline repair ==========
t('CASE 5 full H.run(): business_objective never stated (heuristic would say CLIENT_ACQUISITION) -> deliverable honestly preserves UNKNOWN, COMPLETE, never violations hidden', async () => {
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
  const CLEAN_STATEMENT = 'Contenido determinístico de prueba para este nodo, sin afirmar un objetivo de negocio no declarado.';
  function specTypeFromSystem(sys) { const m = /You are ASTRA's ([A-Z_]+)/.exec(sys); return m ? m[1] : 'UNKNOWN'; }
  const llm = async (system) => {
    const st = specTypeFromSystem(system);
    const fields = SPEC_FIELDS[st] || [];
    const payload = {}; for (const f of fields) payload[f] = CLEAN_STATEMENT;
    const current = /META_ADS/.test(st) ? ['CAPI', 'current attribution'] : (/WHATSAPP/.test(st) ? ['current WhatsApp API mechanics'] : []);
    return {
      raw: JSON.stringify({
        findings: [{ claim: 'grounded finding', support_class: 'DIRECTLY_SUPPORTED', evidence_ref: 'E1' }],
        recommendations: [{ recommendation: 'action', support_class: 'INFERENCE', basis: 'method' }],
        decisions: [{ decision: 'd', rationale: 'r' }], assumptions: ['needs USER_PROVIDED_FACTS: budget'], conflicts: [], confidence: 0.7,
        current_research_required: current, downstream_payload: payload,
      }),
      usage: { prompt: 10, completion: 10 },
    };
  };
  const adapter = new AgentV1Adapter({ kb: mockKb() });
  const r = await H.run('Create a client acquisition campaign for a dental clinic.', { mode: 'llm', adapter, llm, retrieve: true, salt: 'unknown-fidelity-remediation' });
  assert.equal(r.canonical_brief_facts.business_objective.status, 'UNKNOWN', 'fixture must reproduce the confirmed UNKNOWN precondition');
  assert.equal(r.workflow_state_status, 'COMPLETE');
  assert.notEqual(r.reason, 'BRIEF_FIDELITY_VIOLATION');
  assert.equal(r.synthesis.deliverable['1_business_objective'], 'UNKNOWN', 'must never fabricate CLIENT_ACQUISITION from the routing heuristic');
  assert.notEqual(r.synthesis.deliverable['1_business_objective'], 'CLIENT_ACQUISITION');
  // Defense in depth: even if a future change reintroduced the fabrication, the final-synthesis
  // gate would now catch it deterministically — confirmed directly, not just by absence.
  const wouldBeCaught = fidelity.validateFinalSynthesis(r.canonical_brief_facts, { deliverable: { '1_business_objective': 'CLIENT_ACQUISITION' } });
  assert(wouldBeCaught.violations.some(v => v.type === 'UNKNOWN_FACT_FABRICATION'));
});

// ========== CASE 6: brief forbids invented metrics, output invents numeric metric => DETECT ==========
t('CASE 6 brief forbids invented metrics -> output states "ROAS objetivo 4x" => DETECT', () => {
  const facts = factsWith({ constraints: { status: 'USER_PROVIDED_FACT', value: 'No inventes métricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia.' } });
  const { violations } = fidelity.validateOutputAgainstFacts(facts, { downstream_payload: { measurement: 'ROAS objetivo 4x.' } }, { nodeId: 'measurement' });
  assert(violations.some(v => v.type === 'EXPLICIT_PROHIBITION' && v.category === 'invented_metric'), JSON.stringify(violations));
});

// ========== CASE 7: brief forbids proof/testimonials, PROPUESTA does not escape it => DETECT ==========
t('CASE 7 brief forbids testimonials -> "PROPUESTA: case studies, pilot results" still fails (no marker escape for explicit prohibitions)', () => {
  const facts = factsWith({ constraints: { status: 'USER_PROVIDED_FACT', value: 'No inventes proof ni testimonios.' } });
  const { violations } = fidelity.validateOutputAgainstFacts(facts, { downstream_payload: { creative_testing: 'PROPUESTA: case studies, pilot results, testimonios de clientes' } }, { nodeId: 'ads' });
  assert(violations.some(v => v.type === 'EXPLICIT_PROHIBITION' && (v.category === 'testimonials' || v.category === 'proof')), JSON.stringify(violations));
});

// ========== CASE 8: allowed new idea correctly tagged PROPUESTA => PASS ==========
t('CASE 8 a new strategic idea correctly tagged PROPUESTA and non-replacing => PASS', () => {
  const facts = factsWith({
    product_name: { status: 'USER_PROVIDED_FACT', value: 'Método 360' },
    product_type: { status: 'USER_PROVIDED_FACT', value: 'minicurso grabado' },
  });
  const { violations } = fidelity.validateOutputAgainstFacts(facts, {
    downstream_payload: { offer_structure: 'Oferta principal: Método 360, minicurso grabado. PROPUESTA: probar webinar demo como lead magnet secundario, sin sustituir el producto.' },
  }, { nodeId: 'offer' });
  assert.deepStrictEqual(violations.filter(v => v.type === 'UNLABELED_PROPOSAL'), []);
});

// ========== CASE 9: node output tagged PROPUESTA, final synthesis loses the tag => DETECT ==========
t('CASE 9 a PROPUESTA-marked idea reaching final synthesis unmarked (tag lost) => DETECT', () => {
  const facts = factsWith({ constraints: { status: 'USER_PROVIDED_FACT', value: 'Cualquier idea nueva debe marcarse explícitamente como PROPUESTA.' } });
  // Simulates synthesis_engine_v2 re-embedding only the idea text and dropping the upstream
  // "PROPUESTA:" prefix the node itself used — the final synthesis gate must still catch it,
  // using the existing UNLABELED_PROPOSAL mechanism (already wired into validateFinalSynthesis).
  const synthesis = { deliverable: { '7_creative_strategy': 'testimonios de clientes satisfechos' } };
  const { violations } = fidelity.validateFinalSynthesis(facts, synthesis);
  assert(violations.some(v => v.type === 'UNLABELED_PROPOSAL'), JSON.stringify(violations));
});
t('CASE 9b the same idea, tag preserved through to final synthesis => PASS', () => {
  const facts = factsWith({ constraints: { status: 'USER_PROVIDED_FACT', value: 'Cualquier idea nueva debe marcarse explícitamente como PROPUESTA.' } });
  const synthesis = { deliverable: { '7_creative_strategy': 'PROPUESTA: testimonios de clientes satisfechos' } };
  const { violations } = fidelity.validateFinalSynthesis(facts, synthesis);
  assert.deepStrictEqual(violations.filter(v => v.type === 'UNLABELED_PROPOSAL'), []);
});

// ========== CASE 10: all canonical facts known and preserved => no false positive ==========
t('CASE 10 all canonical facts known and faithfully preserved in the deliverable => no false positive', () => {
  const facts = factsWith({
    product_name: { status: 'USER_PROVIDED_FACT', value: 'Método 360' },
    price: { status: 'USER_PROVIDED_FACT', value: '400' },
    buyer: { status: 'USER_PROVIDED_FACT', value: 'dueñas de estéticas' },
    geography: { status: 'USER_PROVIDED_FACT', value: 'México' },
    business_objective: { status: 'USER_PROVIDED_FACT', value: 'vender el minicurso' },
  });
  const synthesis = { deliverable: { '1_business_objective': 'vender el minicurso' } };
  const { violations } = fidelity.validateFinalSynthesis(facts, synthesis);
  assert.deepStrictEqual(violations, []);
});

// ========== Regression guard: node-level tactical fields must stay lenient (R1 protection) ==========
t('REGRESSION GUARD: campaign_objective/mechanism generic node prose while the fact is UNKNOWN must NOT be flagged (per-node check intentionally not extended — see R1)', () => {
  const facts = factsWith({});
  const { violations } = fidelity.validateOutputAgainstFacts(facts, {
    downstream_payload: {
      campaign_objective: 'Contenido determinístico de prueba para este nodo.',
      mechanism: 'Contenido determinístico de prueba para este nodo.',
    },
  }, { nodeId: 'ads' });
  assert.deepStrictEqual(violations.filter(v => v.type === 'UNKNOWN_FACT_FABRICATION'), []);
});

// ========== synthesize() unit-level: source repair ==========
t('synthesize() source repair: business_objective UNKNOWN -> deliverable section is literally UNKNOWN, never CLIENT_ACQUISITION', () => {
  const node_outputs = [{ work_unit_id: 'icp', output: { downstream_payload: {}, recommendations: [], assumptions: [], conflicts: [], current_research_required: [], evidence_used: [] } }];
  const facts = factsWith({});
  const r = synthV2.synthesize({ brief: { objective: 'CLIENT_ACQUISITION' }, node_outputs, selected_methods_by_node: {}, canonicalBriefFacts: facts });
  assert.equal(r.deliverable['1_business_objective'], 'UNKNOWN');
});
t('synthesize() still uses the true canonical value when business_objective IS a USER_PROVIDED_FACT', () => {
  const node_outputs = [{ work_unit_id: 'icp', output: { downstream_payload: {}, recommendations: [], assumptions: [], conflicts: [], current_research_required: [], evidence_used: [] } }];
  const facts = factsWith({ business_objective: { status: 'USER_PROVIDED_FACT', value: 'vender el minicurso' } });
  const r = synthV2.synthesize({ brief: { objective: 'vender el minicurso' }, node_outputs, selected_methods_by_node: {}, canonicalBriefFacts: facts });
  assert.equal(r.deliverable['1_business_objective'], 'vender el minicurso');
});
t('synthesize() legacy call (no canonicalBriefFacts) keeps the untouched fallback for backward compatibility', () => {
  const node_outputs = [{ work_unit_id: 'icp', output: { downstream_payload: {}, recommendations: [], assumptions: [], conflicts: [], current_research_required: [], evidence_used: [] } }];
  const r = synthV2.synthesize({ brief: { objective: null }, node_outputs, selected_methods_by_node: {} });
  assert.equal(r.deliverable['1_business_objective'], 'CLIENT_ACQUISITION');
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (e) { fail += 1; console.log('FAIL', x.name, '::', e && e.message); }
  }
  console.log(`\nASTRA_CAMPAIGN360_UNKNOWN_FIDELITY_REMEDIATION_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
