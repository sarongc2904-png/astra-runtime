'use strict';
// Campaign360 fidelity diagnostic passthrough. marketing_campaign_360_hardened.js already
// computes canonical_brief_facts + brief_fidelity_violations on a BRIEF_FIDELITY_VIOLATION (and
// on a clean COMPLETE); campaignPayload() used to discard both, leaving a GPT only the generic
// reason string. This proves campaignPayload() now surfaces both, through response.sanitize(),
// without leaking prompts/evidence text/secrets. Offline, deterministic — no network, no LLM.
const assert = require('assert');
const { campaignPayload } = require('../src/integration/gpt_supabase_adapter');
const H = require('../src/workflows/marketing_campaign_360_hardened');
const briefFacts = require('../src/workflows/campaign_brief_facts');
const { AgentV1Adapter } = require('../src/adapter/agent_v1_adapter');

const tests = []; let pass = 0, fail = 0;
function t(name, fn) { tests.push({ name, fn }); }

// ---------- A. FAILED_BRIEF_FIDELITY_PASSTHROUGH ----------
t('A1 FAILED_BRIEF_FIDELITY_PASSTHROUGH: campaignPayload preserves canonical_brief_facts and brief_fidelity_violations with exact paths', () => {
  const facts = briefFacts.extract('Producto: Método 360\nComprador: dueñas de estéticas\nObjetivo: vender el minicurso');
  const result = {
    workflow_state_status: 'FAILED', workflow_id: 'WF_1', reason: 'BRIEF_FIDELITY_VIOLATION',
    canonical_brief_facts: facts,
    brief_fidelity_violations: [
      { type: 'PRODUCT_NAME_SUBSTITUTION', fact_field: 'product_name', canonical_value: 'Método 360', field_key: 'offer_structure', node: 'offer', path: 'node_outputs.offer.downstream_payload.offer_structure' },
    ],
    node_outputs: [{ work_unit_id: 'offer' }], synthesis: null, cost: { mode: 'llm', model_calls: 3 },
  };
  const payload = campaignPayload(result);
  assert.equal(payload.status, 'FAILED');
  assert.equal(payload.reason, 'BRIEF_FIDELITY_VIOLATION');
  assert.deepStrictEqual(payload.canonical_brief_facts, facts);
  assert.equal(payload.brief_fidelity_violations.length, 1);
  assert.equal(payload.brief_fidelity_violations[0].path, 'node_outputs.offer.downstream_payload.offer_structure');
  assert.equal(payload.brief_fidelity_violations[0].fact_field, 'product_name');
  assert.equal(payload.brief_fidelity_violations[0].canonical_value, 'Método 360');
});
t('A2 multiple violations each keep their own exact path', () => {
  const result = {
    workflow_state_status: 'FAILED', reason: 'BRIEF_FIDELITY_VIOLATION',
    canonical_brief_facts: briefFacts.extract('Producto: X'),
    brief_fidelity_violations: [
      { type: 'PRICE_SUBSTITUTION', fact_field: 'price', field_key: 'offer_structure', node: 'offer', path: 'node_outputs.offer.downstream_payload.offer_structure' },
      { type: 'GEOGRAPHY_SUBSTITUTION', fact_field: 'geography', field_key: 'problem_context', node: 'market_context', path: 'node_outputs.market_context.downstream_payload.problem_context' },
    ],
  };
  const payload = campaignPayload(result);
  assert.equal(payload.brief_fidelity_violations.length, 2);
  const paths = payload.brief_fidelity_violations.map(v => v.path);
  assert(paths.includes('node_outputs.offer.downstream_payload.offer_structure'));
  assert(paths.includes('node_outputs.market_context.downstream_payload.problem_context'));
});
t('A3 an end-to-end mock-LLM run that actually violates fidelity surfaces the same fields through campaignPayload', async () => {
  const mockKb = () => ({
    async retrieveStrategyFAsync(query) { const hits = Array.from({ length: 5 }, (_, i) => ({ rank: i + 1, chunk_id: 'c' + i, source_pdf_name: 'S.pdf', content: 'evidence ' + query })); return { top5: hits, advisory_top1_cosine: 0.6 }; },
    buildStrategyFEvidence(raw) { const hits = raw.top5 || []; return { evidenceText: hits.map(h => h.content).join('\n'), hits, advisoryTop1Cosine: raw.advisory_top1_cosine, pipeline: 'Strategy-F', corpus: 'kb_chunks_v2' }; },
  });
  const specTypeFromSystem = sys => { const m = /You are ASTRA's ([A-Z_]+)/.exec(sys); return m ? m[1] : 'UNKNOWN'; };
  const llm = async system => {
    const st = specTypeFromSystem(system);
    const payload = { pains: 'contenido neutro', desired_outcomes: 'contenido neutro' };
    if (st === 'ICP_SPECIALIST') payload.pains = 'nuestro ICP son consumidoras de servicios estéticos';
    const obj = { findings: [], recommendations: [], decisions: [], assumptions: [], conflicts: [], confidence: 0.5, current_research_required: [], downstream_payload: payload };
    return { raw: JSON.stringify(obj), usage: { prompt: 1, completion: 1 } };
  };
  // [ASTRA_CAMPAIGN360_NODE_FIDELITY_DIAGNOSTIC_PROPAGATION] a node-level BRIEF_FIDELITY_VIOLATION
  // no longer escapes H.run() as a thrown exception (that was exactly the confirmed defect: the
  // generic router catch degraded it to opaque RUNTIME_FAILED) — it now resolves as the same
  // structured FAILED shape the final-synthesis fidelity gate already produced.
  const result = await H.run('Producto: Método 360\nComprador: dueñas de estéticas\nObjetivo: vender el minicurso', { mode: 'llm', adapter: new AgentV1Adapter({ kb: mockKb() }), llm, retrieve: true, salt: 'diag-passthrough' });
  assert.equal(result.workflow_state_status, 'FAILED');
  assert.equal(result.reason, 'BRIEF_FIDELITY_VIOLATION');
  const payload = campaignPayload(result);
  assert(payload.brief_fidelity_violations.length > 0);
  assert.equal(payload.brief_fidelity_violations[0].fact_field, 'buyer');
});

// ---------- B. COMPLETE_PASSTHROUGH ----------
t('B1 COMPLETE_PASSTHROUGH: a normal COMPLETE result is unaffected — same fields as before, plus empty diagnostics', () => {
  const result = {
    workflow_state_status: 'COMPLETE', workflow_id: 'WF_2',
    node_outputs: [{ work_unit_id: 'market_context' }, { work_unit_id: 'icp' }],
    selected_methods_by_node: { market_context: { primary_method: 'METHOD_SMP' } },
    synthesis: { deliverable: { '16_known_limitations': ['l1'], '17_current_research_required': ['r1'] } },
    cost: { mode: 'llm', model_calls: 8 },
  };
  const payload = campaignPayload(result);
  assert.equal(payload.status, 'COMPLETE');
  assert.equal(payload.workflow_id, 'WF_2');
  assert.deepStrictEqual(payload.completed_nodes, ['market_context', 'icp']);
  assert.deepStrictEqual(payload.selected_methods, { market_context: 'METHOD_SMP' });
  assert.deepStrictEqual(payload.limitations, ['l1']);
  assert.deepStrictEqual(payload.current_research_required, ['r1']);
  assert.equal(payload.reason, null);
  // new diagnostic fields present but empty/null when the run never computed them
  assert.equal(payload.canonical_brief_facts, null);
  assert.deepStrictEqual(payload.brief_fidelity_violations, []);
});
t('B2 COMPLETE with canonical_brief_facts present (e.g. Método 360 clean run) passes it through with no violations', async () => {
  const briefText = [
    'Producto: Método 360', 'Tipo: minicurso grabado', 'Precio: 400 MXN', 'Comprador: dueñas de estéticas',
    'Geografía: México', 'Objetivo: vender el minicurso', 'Mecanismo: Meta Ads y WhatsApp consulta -> cita',
  ].join('\n');
  const mockKb = () => ({
    async retrieveStrategyFAsync(query) { const hits = Array.from({ length: 5 }, (_, i) => ({ rank: i + 1, chunk_id: 'c' + i, source_pdf_name: 'S.pdf', content: 'evidence ' + query })); return { top5: hits, advisory_top1_cosine: 0.6 }; },
    buildStrategyFEvidence(raw) { const hits = raw.top5 || []; return { evidenceText: hits.map(h => h.content).join('\n'), hits, advisoryTop1Cosine: raw.advisory_top1_cosine, pipeline: 'Strategy-F', corpus: 'kb_chunks_v2' }; },
  });
  const specTypeFromSystem = sys => { const m = /You are ASTRA's ([A-Z_]+)/.exec(sys); return m ? m[1] : 'UNKNOWN'; };
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
  const llm = async system => {
    const st = specTypeFromSystem(system);
    const payload = {}; for (const f of (SPEC_FIELDS[st] || [])) payload[f] = 'contenido determinístico de prueba, sin cambiar oferta ni público';
    const current = /META_ADS/.test(st) ? ['CAPI'] : (/WHATSAPP/.test(st) ? ['current WhatsApp API mechanics'] : []);
    const obj = { findings: [{ claim: 'g', support_class: 'DIRECTLY_SUPPORTED', evidence_ref: 'E1' }], recommendations: [{ recommendation: 'a', support_class: 'INFERENCE', basis: 'm' }], decisions: [{ decision: 'd', rationale: 'r' }], assumptions: ['needs USER_PROVIDED_FACTS: budget'], conflicts: [], confidence: 0.7, current_research_required: current, downstream_payload: payload };
    return { raw: JSON.stringify(obj), usage: { prompt: 1, completion: 1 } };
  };
  const result = await H.run(briefText, { mode: 'llm', adapter: new AgentV1Adapter({ kb: mockKb() }), llm, retrieve: true, salt: 'diag-complete' });
  assert.equal(result.workflow_state_status, 'COMPLETE');
  const payload = campaignPayload(result);
  assert.equal(payload.status, 'COMPLETE');
  assert.deepStrictEqual(payload.brief_fidelity_violations, []);
  assert.equal(payload.canonical_brief_facts.product_name.value, 'Método 360');
  assert.equal(payload.canonical_brief_facts.buyer.value, 'dueñas de estéticas');
});

// ---------- C. EMPTY_DIAGNOSTICS ----------
t('C1 EMPTY_DIAGNOSTICS: no canonical_brief_facts / brief_fidelity_violations on the input -> null / [] on the payload', () => {
  const result = { workflow_state_status: 'WAITING_FOR_INPUT', required_inputs: ['business_type'] };
  const payload = campaignPayload(result);
  assert.equal(payload.canonical_brief_facts, null);
  assert.deepStrictEqual(payload.brief_fidelity_violations, []);
});
t('C2 EMPTY_DIAGNOSTICS: an explicit empty violations array round-trips as empty, not null', () => {
  const result = { workflow_state_status: 'COMPLETE', canonical_brief_facts: { product_name: { value: 'X', status: 'USER_PROVIDED_FACT' } }, brief_fidelity_violations: [] };
  const payload = campaignPayload(result);
  assert.deepStrictEqual(payload.brief_fidelity_violations, []);
  assert.deepStrictEqual(payload.canonical_brief_facts, { product_name: { value: 'X', status: 'USER_PROVIDED_FACT' } });
});

// ---------- D. SANITIZATION ----------
t('D1 SANITIZATION: a secret-looking key inside canonical_brief_facts is redacted, not leaked', () => {
  const result = {
    workflow_state_status: 'FAILED', reason: 'BRIEF_FIDELITY_VIOLATION',
    canonical_brief_facts: { product_name: { value: 'Método 360', status: 'USER_PROVIDED_FACT' }, api_key: 'sk-should-not-leak-1234567890' },
    brief_fidelity_violations: [{ type: 'PRODUCT_NAME_SUBSTITUTION', fact_field: 'product_name', detail: 'contains Bearer abc.def.secretvalue123 leaked by mistake' }],
  };
  const payload = campaignPayload(result);
  const blob = JSON.stringify(payload);
  assert(!blob.includes('sk-should-not-leak'));
  assert(!blob.includes('secretvalue123'));
  assert.equal(payload.canonical_brief_facts.api_key, '[REDACTED]');
});
t('D2 SANITIZATION: no raw prompt/system/user text is ever included by campaignPayload (fields not in its allowlist)', () => {
  const result = {
    workflow_state_status: 'FAILED', reason: 'BRIEF_FIDELITY_VIOLATION',
    canonical_brief_facts: { product_name: { value: 'Método 360', status: 'USER_PROVIDED_FACT' } },
    brief_fidelity_violations: [{ type: 'PRODUCT_NAME_SUBSTITUTION', fact_field: 'product_name' }],
    // fields the workflow may also carry internally but campaignPayload must not surface
    _state: { some: 'internal-only' }, prompt: 'SYSTEM PROMPT TEXT', raw_llm_response: 'raw response text',
  };
  const payload = campaignPayload(result);
  assert(!('prompt' in payload)); assert(!('raw_llm_response' in payload)); assert(!('_state' in payload));
});
t('D3 SANITIZATION: response.sanitize() still runs over the whole payload (existing behavior unchanged)', () => {
  const result = { workflow_state_status: 'COMPLETE', synthesis: { deliverable: { authorization: 'Bearer abc.def.ghijk', '16_known_limitations': [], '17_current_research_required': [] } } };
  const payload = campaignPayload(result);
  assert.equal(payload.final_synthesis.authorization, '[REDACTED]');
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (e) { fail += 1; console.log('FAIL', x.name, '::', e && e.message); }
  }
  console.log(`\nASTRA_CAMPAIGN360_FIDELITY_DIAGNOSTIC_PASSTHROUGH_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
