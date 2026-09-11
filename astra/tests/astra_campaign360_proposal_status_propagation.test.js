'use strict';
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');
const briefFacts = require('../src/workflows/campaign_brief_facts');
const LLM = require('../src/specialists/llm_specialists');
const H = require('../src/workflows/marketing_campaign_360_hardened');
const { AgentV1Adapter } = require('../src/adapter/agent_v1_adapter');
const synth = require('../src/synthesis/synthesis_engine_v2');
const tests = []; function t(name, fn) { tests.push({ name, fn }); }
const BRIEF = ['Crea una campaña 360 para Método 360.', '',
  'Es un minicurso grabado de $400 MXN dirigido a dueñas de estéticas en México.', '',
  'Objetivo: vender el minicurso.', '',
  'Enseña Meta Ads para generar consultas y WhatsApp para convertir:',
  'consulta → conversación → cita.', '',
  'No inventes métricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia.'].join('\n');
const facts = briefFacts.extract(BRIEF);
const OFFER = 'PROPUESTA: Minicurso grabado 400 MXN venta directa; upsell consultoría cita.';
const FUNNEL = 'Upsell consultoría cita';
const WA = 'Confirmar compra→enviar comprobante→ofrecer agendar consultoría.';
const TYPE = 'UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION';
function check(downstream, upstream = 'PROPUESTA: upsell consultoría cita', f = facts) {
  return fidelity.validateOutputAgainstFacts(f, { downstream_payload: { stages: downstream } }, {
    nodeId: 'funnel', upstream_outputs: upstream == null ? [] : [{ work_unit_id: 'offer', downstream_payload: { offer_structure: upstream } }],
  }).violations.filter(v => v.type === TYPE);
}
function fails(downstream, upstream, f) { assert(check(downstream, upstream, f).length, JSON.stringify({ downstream, upstream })); }
function passes(downstream, upstream, f) { assert.deepStrictEqual(check(downstream, upstream, f), []); }
t('A unmarked reuse fails without user proposal constraint', () => {
  assert(!/propuesta/i.test(facts.constraints.value)); fails(FUNNEL);
  assert.equal(check(FUNNEL)[0].path, 'node_outputs.funnel.downstream_payload.stages');
});
t('B marked reuse passes', () => passes('PROPUESTA: ' + FUNNEL));
t('retained live offer label covers its semicolon continuation', () => passes(OFFER, OFFER));
t('C no upstream proposal and canonical mechanism pass', () => passes(facts.mechanism.value, null));
t('D canonical facts are not tainted by an upstream label', () => {
  passes(facts.mechanism.value, 'PROPUESTA: ' + facts.mechanism.value);
  passes('Minicurso grabado 400 MXN', OFFER);
  passes('Ofrecer agendar consultoría.', undefined, { ...facts, mechanism: { status: 'USER_PROVIDED_FACT', value: 'Ofrecer agendar consultoría.' } });
});
t('E downstream rejects proposal', () => passes('No incluir consultoría'));
t('F exact live offer to funnel fails; retained marker passes', () => { fails(FUNNEL, OFFER); passes('PROPUESTA: ' + FUNNEL, OFFER); });
t('G funnel to WhatsApp operationalization fails; retained marker passes', () => { fails(WA, 'PROPUESTA: ' + FUNNEL); passes('PROPUESTA: ' + WA, 'PROPUESTA: ' + FUNNEL); });
t('novel anchors are upstream driven, not a consulting blocklist', () => { fails('Activar auditoría.', 'PROPUESTA: upsell auditoría'); passes('Activar consultoría.', 'PROPUESTA: upsell auditoría'); });
t('UNKNOWN and CURRENT_RESEARCH_REQUIRED are not assertions', () => {
  for (const text of ['UNKNOWN', 'CURRENT_RESEARCH_REQUIRED', 'consultoría = UNKNOWN', 'CURRENT_RESEARCH_REQUIRED: consultoría', { status: 'UNKNOWN', value: 'consultoría' }]) passes(text);
});
t('placeholder upstream is not proposal taint', () => { passes('UNKNOWN', 'PROPUESTA: UNKNOWN'); passes('CURRENT_RESEARCH_REQUIRED', 'PROPUESTA: CURRENT_RESEARCH_REQUIRED'); });
t('no backwards marker exemption', () => fails('Ofrecer consultoría; PROPUESTA: upsell consultoría'));
t('a later sentence without marker fails', () => fails('PROPUESTA: upsell consultoría. Agendar consultoría.'));
t('rejection scope does not forgive affirmative clause', () => {
  for (const join of ['pero', 'aunque', 'sin embargo']) fails('No incluir consultoría, ' + join + ' ofrecer consultoría.');
  fails('No incluir consultoría y ofrecer consultoría.');
  fails('No incluir consultoría; ofrecer consultoría.');
  fails('No incluir consultoría y ofrece consultoría.');
});
t('sibling and array markers do not leak', () => {
  fails(['PROPUESTA: upsell consultoría', 'Agendar consultoría']);
  fails({ marked: 'PROPUESTA: upsell consultoría', unmarked: 'Agendar consultoría' });
});
t('keys alone are not proposal content', () => passes({ consultoria: 'UNKNOWN' }));
t('upstream source and canonical facts remain immutable', () => {
  const before = JSON.stringify(facts); check(WA, OFFER); assert.equal(JSON.stringify(facts), before);
});
t('prompt explicitly preserves reuse, paraphrase, derivative and dependency', () => {
  const { system } = LLM.buildPrompt({ specialist_type: 'FUNNEL_SPECIALIST', task_brief: {}, canonical_brief_facts: facts });
  assert(system.includes('Any upstream content already labeled PROPUESTA is tainted as proposal.'));
  assert(system.includes('reuse, paraphrase, derivative, operationalization or downstream dependency'));
  assert(system.includes('Never convert upstream PROPUESTA into an unmarked fact/decision.'));
});
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


t('I/J complete natural mock pipeline preserves proposals at synthesis input and output', async () => {
  const original = synth.synthesize;
  let received;
  synth.synthesize = input => { received = input; return original(input); };
  try {
    const r = await runWith(BRIEF, {
      OFFER_SPECIALIST: { offer_structure: OFFER },
      FUNNEL_SPECIALIST: { stages: 'PROPUESTA: ' + FUNNEL },
      WHATSAPP_SALES_SPECIALIST: { appointment_closing: 'PROPUESTA: ' + WA },
    });
    assert.equal(r.workflow_state_status, 'COMPLETE', JSON.stringify(r.brief_fidelity_violations));
    assert(received); assert.equal(received.node_outputs.length, 8);
    assert.equal(r.synthesis.deliverable['6_funnel'].stages, 'PROPUESTA: ' + FUNNEL);
    assert.equal(r.synthesis.deliverable['12_whatsapp_followup_closing'].closing, 'PROPUESTA: ' + WA);
  } finally { synth.synthesize = original; }
});
for (const target of ['funnel', 'whatsapp_conversion']) {
  t('I/J lost status at ' + target + ' fails closed before synthesis', async () => {
    const original = synth.synthesize; let called = false;
    synth.synthesize = () => { called = true; throw new Error('invalid input reached synthesis'); };
    try {
      const r = await runWith(BRIEF, {
        OFFER_SPECIALIST: { offer_structure: OFFER },
        FUNNEL_SPECIALIST: { stages: target === 'funnel' ? FUNNEL : 'PROPUESTA: ' + FUNNEL },
        WHATSAPP_SALES_SPECIALIST: { appointment_closing: WA },
      });
      assert.equal(called, false);
      assert.equal(r.workflow_state_status, 'FAILED');
      assert.equal(r.reason, 'BRIEF_FIDELITY_VIOLATION');
      assert(r.brief_fidelity_violations.some(v => v.type === TYPE && v.node === target));
      assert.equal(r.synthesis, null);
      assert(!r.node_outputs.some(n => n.work_unit_id === target));
    } finally { synth.synthesize = original; }
  });
}
(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log('PASS', name); }
    catch (e) { fail++; console.log('FAIL', name, e.stack); }
  }
  console.log(`PROPOSAL_STATUS_PROPAGATION_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exitCode = 1;
})();
