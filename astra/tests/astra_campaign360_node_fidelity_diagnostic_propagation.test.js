'use strict';
// ASTRA_CAMPAIGN360_NODE_FIDELITY_DIAGNOSTIC_PROPAGATION — confirmed live defect: a node-level
// BRIEF_FIDELITY_VIOLATION (thrown by processNode(), already carrying .code/.briefFidelityViolations/
// .wfTransition) escaped the wave-execution try/catch as a raw throw, which astra_tool_router.js's
// generic error handling then degraded into an opaque RUNTIME_FAILED — discarding
// canonical_brief_facts and the exact violation paths. H.run() must instead resolve normally with
// the same structured FAILED/BRIEF_FIDELITY_VIOLATION shape the final-synthesis fidelity gate
// already produces. Any OTHER error (technical/provider/infra) must still throw unchanged.
// Offline, deterministic (mock LLM only). No network, no real LLM calls.
const assert = require('assert');
const H = require('../src/workflows/marketing_campaign_360_hardened');
const gptAdapter = require('../src/integration/gpt_supabase_adapter');
const briefFacts = require('../src/workflows/campaign_brief_facts');
const { AgentV1Adapter } = require('../src/adapter/agent_v1_adapter');

const tests = []; let pass = 0, fail = 0;
function t(name, fn) { tests.push({ name, fn }); }

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
].join('\n');

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
  return H.run(brief, { mode: 'llm', adapter: mockAdapter(), llm: buildMockLLM(overrides), retrieve: true, salt: 'node-fidelity-diagnostic' });
}

// ========== A/B. NODE_FIDELITY_RESULT_NOT_THROW / NODE_FIDELITY_WORKFLOW_STATUS ==========
t('A/B. a funnel-node BRIEF_FIDELITY_VIOLATION resolves H.run() normally (no reject/throw), status FAILED, reason BRIEF_FIDELITY_VIOLATION', async () => {
  let threw = false, r;
  try {
    r = await runWith(STRUCTURED_METHOD360_BRIEF, { FUNNEL_SPECIALIST: { stages: 'funnel principal: webinar -> checkout' } });
  } catch (e) { threw = true; }
  assert.equal(threw, false, 'H.run() must not throw for a node-level BRIEF_FIDELITY_VIOLATION');
  assert.equal(r.workflow_state_status, 'FAILED');
  assert.equal(r.reason, 'BRIEF_FIDELITY_VIOLATION');
  assert(Array.isArray(r.brief_fidelity_violations) && r.brief_fidelity_violations.length > 0);
  assert.equal(r.synthesis, null);
});

// ========== C. EXACT_VIOLATIONS_PRESERVED ==========
t('C. violation objects are propagated unchanged (type/fact_field/field_key/node/path)', async () => {
  const r = await runWith(STRUCTURED_METHOD360_BRIEF, { FUNNEL_SPECIALIST: { stages: 'webinar demo sin marcar como propuesta' } });
  assert.equal(r.workflow_state_status, 'FAILED');
  const v = r.brief_fidelity_violations.find(x => x.type === 'UNLABELED_PROPOSAL' && x.node === 'funnel');
  assert(v, JSON.stringify(r.brief_fidelity_violations));
  assert.equal(v.field_key, 'stages');
  assert.equal(v.path, 'node_outputs.funnel.downstream_payload.stages');
  assert.equal(v.fact_field, null);
});

// ========== D. CANONICAL_FACTS_PRESERVED ==========
t('D. canonical_brief_facts survives intact on a FAILED node-fidelity result', async () => {
  const r = await runWith(STRUCTURED_METHOD360_BRIEF, { FUNNEL_SPECIALIST: { stages: 'funnel: webinar -> checkout' } });
  assert.equal(r.workflow_state_status, 'FAILED');
  const f = r.canonical_brief_facts;
  assert.equal(f.product_name.value, 'Método 360');
  assert.equal(f.product_type.value, 'minicurso grabado');
  assert.equal(f.price.value, '400'); assert.equal(f.currency.value, 'MXN');
  assert.equal(f.buyer.value, 'dueñas de estéticas');
  assert.equal(f.geography.value, 'México');
  assert.equal(f.business_objective.value, 'vender el minicurso');
  assert(/Meta Ads/.test(f.mechanism.value));
  assert.equal(f.constraints.status, 'USER_PROVIDED_FACT');
});

// ========== E. PARTIAL_NODE_OUTPUTS_CORRECT ==========
t('E. node_outputs on FAILED contains only prior-wave-completed nodes; funnel and its wave-sibling creative_strategy are never COMPLETE', async () => {
  const r = await runWith(STRUCTURED_METHOD360_BRIEF, { FUNNEL_SPECIALIST: { stages: 'funnel: webinar -> checkout' } });
  assert.equal(r.workflow_state_status, 'FAILED');
  const ids = r.node_outputs.map(n => n.work_unit_id);
  assert.deepStrictEqual(ids, ['market_context', 'icp', 'offer']);
  assert(!ids.includes('funnel'), 'the violating node must not appear as completed');
  assert(!ids.includes('creative_strategy'), 'a same-wave sibling settling concurrently must not appear as completed either');
  assert(!('funnel' in r.selected_methods_by_node));
  assert(!('creative_strategy' in r.selected_methods_by_node));
  assert.deepStrictEqual(Object.keys(r.selected_methods_by_node).sort(), ['icp', 'market_context', 'offer']);
});

// ========== F. GPT_ADAPTER_PASSTHROUGH ==========
t('F. campaignPayload() surfaces status/reason/canonical_brief_facts/brief_fidelity_violations, final_synthesis null, without modification', async () => {
  const r = await runWith(STRUCTURED_METHOD360_BRIEF, { FUNNEL_SPECIALIST: { stages: 'funnel: webinar -> checkout' } });
  const payload = gptAdapter.campaignPayload(r);
  assert.equal(payload.status, 'FAILED');
  assert.equal(payload.reason, 'BRIEF_FIDELITY_VIOLATION');
  assert(payload.canonical_brief_facts, 'canonical_brief_facts missing from campaignPayload output');
  assert(Array.isArray(payload.brief_fidelity_violations) && payload.brief_fidelity_violations.length > 0);
  assert.notEqual(payload.status, 'RUNTIME_FAILED');
});

// ========== G. ASYNC_TERMINAL_FAILURE ==========
t('G. campaign_async surfaces a resolved node-fidelity FAILED result as job.status FAILED, never RUNTIME_FAILED', async () => {
  const asyncJobs = require('../src/integration/campaign_async');
  asyncJobs.resetForTests();
  // Mirrors exactly the shape H.run() now RESOLVES with (this gate's fix) for a node-level
  // BRIEF_FIDELITY_VIOLATION — simulating campaignRuntime end-to-end through the real
  // campaign_async.js + astra_tool_router.js + gpt_supabase_adapter.js path, none of which are
  // modified by this gate.
  const fixtureFacts = briefFacts.extract(STRUCTURED_METHOD360_BRIEF);
  const campaignRuntime = async () => ({
    mode: 'llm', intent: 'MARKETING_CAMPAIGN_360', brief: { objective: 'vender el minicurso' },
    canonical_brief_facts: fixtureFacts, workflow_id: 'WF_MC360H',
    node_order: ['market_context', 'icp', 'offer', 'funnel', 'creative_strategy', 'ads', 'whatsapp_conversion', 'measurement', 'final_synthesis'],
    workflow_state_status: 'FAILED', reason: 'BRIEF_FIDELITY_VIOLATION',
    brief_fidelity_violations: [{ type: 'UNLABELED_PROPOSAL', fact_field: null, field_key: 'stages', node: 'funnel', path: 'node_outputs.funnel.downstream_payload.stages' }],
    node_outputs: [{ work_unit_id: 'market_context' }, { work_unit_id: 'icp' }, { work_unit_id: 'offer' }],
    selected_methods_by_node: { market_context: { primary_method: 'M1' }, icp: { primary_method: 'M2' }, offer: { primary_method: 'M3' } },
    synthesis: null, cost: { model_calls: 3 },
  });
  const KEY = 'runtime-test-key-with-adequate-entropy';
  const ENV = { ASTRA_GPT_API_KEYS: KEY };
  const HEADERS = { authorization: `Bearer ${KEY}` };
  const started = asyncJobs.start({ input: 'campaign' }, { campaignRuntime }, ENV, HEADERS);
  assert.equal(started.statusCode, 202);
  const jobId = started.body.job_id;
  let res = asyncJobs.result(jobId, {});
  for (let i = 0; i < 40 && (res.body.status === 'RUNNING' || res.body.status === 'QUEUED'); i += 1) {
    await new Promise(r => setTimeout(r, 15));
    res = asyncJobs.result(jobId, {});
  }
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'FAILED');
  assert.equal(res.body.result.body.status, 'FAILED');
  assert.equal(res.body.result.body.reason, 'BRIEF_FIDELITY_VIOLATION');
  assert(res.body.result.body.brief_fidelity_violations.length > 0);
  assert.notEqual(res.body.result.body.status, 'RUNTIME_FAILED');
  assert.notEqual(res.body.error && res.body.error.code, 'RUNTIME_FAILED');
});

// ========== H. NON_FIDELITY_EXCEPTION_UNCHANGED ==========
t('H. a genuine technical error (no BRIEF_FIDELITY_VIOLATION code) still throws from H.run(), unchanged', async () => {
  const llm = async () => { throw new Error('provider exploded'); };
  await assert.rejects(
    () => H.run(STRUCTURED_METHOD360_BRIEF, { mode: 'llm', adapter: mockAdapter(), llm, retrieve: true, salt: 'technical-error' }),
    err => { assert.notEqual(err.code, 'BRIEF_FIDELITY_VIOLATION'); return true; }
  );
});

// ========== I. FINAL_SYNTHESIS_FIDELITY_UNCHANGED ==========
t('I. the existing final-synthesis fidelity gate (all nodes clean, final deliverable violates) still returns the identical structured FAILED shape', async () => {
  // Positive preservation is evaluated on the final synthesis too (nodeId=null) — dropping the
  // buyer at the ads node's audience_approach while every other node stays clean exercises the
  // final-synthesis-only path (ads is checked at node-level AND folded into the deliverable).
  const r = await runWith(STRUCTURED_METHOD360_BRIEF, { META_ADS_SPECIALIST: { audience_approach: 'audiencia: profesionales con poco tiempo, ocupados' } });
  assert.equal(r.workflow_state_status, 'FAILED');
  assert.equal(r.reason, 'BRIEF_FIDELITY_VIOLATION');
  assert(Array.isArray(r.brief_fidelity_violations) && r.brief_fidelity_violations.length > 0);
});

// ========== J. CLEAN_METHOD360_UNCHANGED ==========
t('J. the clean Método 360 fixture from gate 33ea969 still reaches COMPLETE unchanged', async () => {
  const r = await runWith(STRUCTURED_METHOD360_BRIEF);
  assert.equal(r.workflow_state_status, 'COMPLETE');
  assert.notEqual(r.reason, 'BRIEF_FIDELITY_VIOLATION');
  assert.equal(r.canonical_brief_facts.product_name.value, 'Método 360');
  assert.equal(r.canonical_brief_facts.price.value, '400');
  assert.equal(r.canonical_brief_facts.buyer.value, 'dueñas de estéticas');
});

// ========== K. ADVERSARIAL_METHOD360_UNCHANGED ==========
t('K. the full adversarial Método 360 content still fails closed (no rule relaxed) — now resolved, not thrown', async () => {
  let threw = false;
  const r = await runWith(STRUCTURED_METHOD360_BRIEF, {
    ICP_SPECIALIST: { pains: 'ICP: profesionales adultos con poco tiempo, ocupados' },
    OFFER_SPECIALIST: { offer_structure: 'incluimos webinar demo, 3 plantillas descargables y muestra gratis; usamos testimonios de clientes; oferta limitada con deadline' },
    MARKET_CONTEXT_SPECIALIST: { problem_context: 'precio por confirmar, sin precio definido aún' },
  }).catch(() => { threw = true; return null; });
  assert.equal(threw, false, 'an adversarial run should now resolve as structured FAILED, not throw');
  assert.equal(r.workflow_state_status, 'FAILED');
  assert.equal(r.reason, 'BRIEF_FIDELITY_VIOLATION');
  assert(r.brief_fidelity_violations.length > 0);
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (e) { fail += 1; console.log('FAIL', x.name, '::', e && e.message); }
  }
  console.log(`\nASTRA_CAMPAIGN360_NODE_FIDELITY_DIAGNOSTIC_PROPAGATION_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
