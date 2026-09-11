'use strict';
const assert = require('assert');
const fidelity = require('../src/workflows/brief_fidelity_validator');
const briefFacts = require('../src/workflows/campaign_brief_facts');
const H = require('../src/workflows/marketing_campaign_360_hardened');
const { AgentV1Adapter } = require('../src/adapter/agent_v1_adapter');
const CANONICAL = 'No inventes métricas, resultados, CAC, ROAS, LTV, testimonios ni evidencia.';
const BRIEF = [
  'Crea una campaña 360 para Método 360.', '',
  'Es un minicurso grabado de $400 MXN dirigido a dueñas de estéticas en México.', '',
  'Objetivo: vender el minicurso.', '',
  'Enseña Meta Ads para generar consultas y WhatsApp para convertir:',
  'consulta → conversación → cita.', '', CANONICAL,
].join('\n');
const facts = briefFacts.extract(BRIEF);
const tests = [];
function t(name, fn) { tests.push({ name, fn }); }
function validate(text, nodeId = 'market_context', key = 'constraints') {
  return fidelity.validateOutputAgainstFacts(facts, { downstream_payload: { [key]: text } }, { nodeId }).violations;
}
function blocked(text, category = 'testimonials') {
  const v = validate(text);
  assert(v.some(x => x.type === 'EXPLICIT_PROHIBITION' && x.category === category), JSON.stringify({ text, v }));
}
t('A EXACT_CANONICAL_CONSTRAINT_ECHO', () => assert.deepStrictEqual(validate(CANONICAL), []));
t('B PARAPHRASED_NEGATIVE_CONSTRAINT', () => assert.deepStrictEqual(validate('No inventar testimonios ni evidencia.'), []));
for (const text of ['No usar testimonios.', 'testimonios = UNKNOWN.', 'sin proof disponible.', 'no hay evidencia disponible.', 'No inventen testimonios.', 'No incluir testimonios.', 'No utilizar testimonios.', 'No presentar testimonios.', 'No afirmar testimonios.', 'No mencionar testimonios.', 'No hay testimonios disponibles.']) {
  t('C EXISTING_NEGATION_FORMS ' + text, () => assert.deepStrictEqual(validate(text), []));
}
t('D AFFIRMATIVE_TESTIMONIALS_STILL_FAIL', () => blocked('Usar testimonios de clientes.'));
for (const conjunction of ['pero', 'sin embargo', 'aunque']) {
  t('E MIXED_CLAUSE_FAILS ' + conjunction, () => {
    const v = validate('No inventes testimonios, ' + conjunction + ' usa testimonios reales.');
    assert.equal(v.filter(x => x.type === 'EXPLICIT_PROHIBITION').length, 1);
    assert.equal(v.find(x => x.type === 'EXPLICIT_PROHIBITION').category, 'testimonials');
  });
}
t('F MULTI_SENTENCE_FAILS', () => blocked('No inventes testimonios. Usa testimonios de clientes.'));
t('G AFFIRMATIVE_PROOF_FAILS', () => blocked('Agregar proof social.', 'proof'));
for (const text of ['ROAS objetivo 4x.', 'CAC esperado de $100.']) t('H METRIC_INVENTION_STILL_FAILS ' + text, () => blocked(text, 'invented_metric'));
t('I MARKET_CONTEXT_LIVE_FIXTURE', () => {
  assert.deepStrictEqual(validate(CANONICAL, 'market_context'), []);
  const v = validate('Usar testimonios.', 'market_context')[0];
  assert.equal(v.path, 'node_outputs.market_context.downstream_payload.constraints');
});
t('J OFFER_CONSTRAINT_ECHO', () => assert.deepStrictEqual(validate(CANONICAL, 'offer'), []));
t('L EXTRACTION_UNCHANGED', () => {
  assert.equal(facts.constraints.status, 'USER_PROVIDED_FACT');
  assert.equal(facts.constraints.value, CANONICAL);
});
for (const text of [
  'No inventes testimonios, usa testimonios reales.',
  'No inventes testimonios y usa testimonios reales.',
  'testimonios = UNKNOWN y usar testimonios reales.',
  'Usar testimonios; no usar testimonios.',
  'No inventes métricas\nUsar testimonios.',
  'No usar proof. Usar testimonios.',
  'No usar proof, testimonios = UNKNOWN, usar testimonios reales.',
]) t('adversarial ' + text, () => blocked(text));
t('same category occurrences counted individually', () => assert.equal(validate('Usar testimonios y presentar testimonios.').length, 2));
t('negative enumeration preserved in any field', () => assert.deepStrictEqual(validate(CANONICAL, 'offer', 'notes'), []));
t('final synthesis uses same scope protection', () => {
  assert.deepStrictEqual(fidelity.validateFinalSynthesis(facts, { deliverable: { constraints: CANONICAL } }).violations, []);
  assert(fidelity.validateFinalSynthesis(facts, { deliverable: { constraints: 'No usar testimonios, pero usar testimonios.' } }).violations.some(v => v.type === 'EXPLICIT_PROHIBITION'));
});
t('K FULL_NATURAL_METHOD360_FIRST_WAVE', async () => {
  const calls = [];
  const adapter = new AgentV1Adapter({ kb: {
    async retrieveStrategyFAsync(query) {
      return { top5: Array.from({ length: 5 }, (_, i) => ({ rank: i + 1, chunk_id: 'c' + i, source_pdf_name: 'S.pdf', pdf_page_refs: '1', content: 'evidence ' + query, original_query_cosine: 0.6, rag_decision: 'CITE', quality_status: 'OK', warning_flags: [] })), advisory_top1_cosine: 0.6 };
    },
    buildStrategyFEvidence(raw) { return { evidenceText: raw.top5.map(h => h.content).join('\n'), hits: raw.top5, advisoryTop1Cosine: 0.6, pipeline: 'Strategy-F', corpus: 'kb_chunks_v2' }; },
  } });
  const llm = async system => {
    const st = /You are ASTRA's ([A-Z_]+)/.exec(system)[1];
    calls.push(st);
    const downstream_payload = st === 'MARKET_CONTEXT_SPECIALIST'
      ? { problem_context: 'Método 360 para dueñas de estéticas.', market_assumptions: 'UNKNOWN', constraints: CANONICAL }
      : { pains: 'Usar testimonios de clientes.', desired_outcomes: 'UNKNOWN', objections: 'UNKNOWN', buying_triggers: 'UNKNOWN', qualification_signals: 'UNKNOWN', non_fit_signals: 'UNKNOWN' };
    return { raw: JSON.stringify({ findings: [{ claim: 'grounded finding', support_class: 'DIRECTLY_SUPPORTED', evidence_ref: 'E1' }], recommendations: [{ recommendation: 'action', support_class: 'INFERENCE', basis: 'method' }], decisions: [{ decision: 'd', rationale: 'r' }], assumptions: ['needs USER_PROVIDED_FACTS: budget'], conflicts: [], confidence: 0.7, current_research_required: [], downstream_payload }), usage: { prompt: 10, completion: 10 } };
  };
  const r = await H.run(BRIEF, { mode: 'llm', adapter, llm, retrieve: true, salt: 'negation-first-wave' });
  assert.deepStrictEqual(calls, ['MARKET_CONTEXT_SPECIALIST', 'ICP_SPECIALIST']);
  assert.deepStrictEqual(r.node_outputs.map(n => n.work_unit_id), ['market_context']);
  assert.equal(r.reason, 'BRIEF_FIDELITY_VIOLATION');
  assert(r.brief_fidelity_violations.every(v => v.node === 'icp'));
  assert(r.brief_fidelity_violations.some(v => v.type === 'EXPLICIT_PROHIBITION'));
  assert.deepStrictEqual(r.canonical_brief_facts.constraints, facts.constraints);
});
(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log('PASS', name); }
    catch (e) { fail++; console.log('FAIL', name, e.stack); }
  }
  console.log(`PROHIBITION_NEGATION_SCOPE_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exitCode = 1;
})();
