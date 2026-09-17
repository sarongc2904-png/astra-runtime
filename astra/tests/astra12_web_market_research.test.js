'use strict';

const assert = require('assert');
const policy = require('../src/research/research_policy');
const research = require('../src/research/web_market_research');
const provenance = require('../src/research/research_provenance_validator');
const wrapper = require('../src/workflows/marketing_campaign_360_research');
const fidelity = require('../src/workflows/brief_fidelity_validator');
const adapterIntegration = require('../src/integration/gpt_supabase_adapter');

const tests = []; let pass = 0; let fail = 0;
function t(name, fn) { tests.push({ name, fn }); }

const RAW_BRIEF = `
Producto: CRM con IA para estéticas.
Mercado: México.
Precio: $1,397 MXN al mes.
Oferta: demo de 3 días.
Canal principal: WhatsApp.
Agenda: Google Calendar.
Objetivo: adquisición de clientes para el CRM.
Restricciones:
- No inventar métricas, resultados, CAC, CPL, CPA, ROAS o conversiones.
- No inventar testimonios.
- No usar testimonios inventados.
- No inventar descuentos.
- No inventar presupuesto publicitario.
- Sin testimonios disponibles.
- Cualquier dato no proporcionado debe mantenerse como UNKNOWN.
- Cualquier nueva recomendación debe identificarse como PROPUESTA.
`;

function packFixture() {
  return {
    status: 'COMPLETE', source_class: 'EXTERNAL_RESEARCH', model: 'test-web-model', retrieved_at: '2026-09-17T20:00:00.000Z',
    market_summary: 'Mercado investigado.', patterns: ['Automatización y agenda'], gaps: ['Implementación'], source_count: 3,
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
    evidence: [
      { chunk_id: 'WEB_1', evidence_id: 'WEB_1', kind: 'review', text: 'Reseñas públicas mencionan respuesta tardía.', source_title: 'Reviews A', source_url: 'https://reviews.example.com/a', retrieved_at: '2026-09-17T20:00:00.000Z' },
      { chunk_id: 'WEB_2', evidence_id: 'WEB_2', kind: 'pricing', text: 'Competidor publica precio mensual.', source_title: 'Competidor A', source_url: 'https://example.com/pricing', retrieved_at: '2026-09-17T20:00:00.000Z' },
      { chunk_id: 'WEB_3', evidence_id: 'WEB_3', kind: 'offer', text: 'Competidor integra agenda.', source_title: 'Competidor B', source_url: 'https://example.org/features', retrieved_at: '2026-09-17T20:00:00.000Z' },
    ],
  };
}

function groundedNode(id, ref = 'E1', payload = {}) {
  return {
    work_unit_id: id,
    evidence_chunk_ids: ['WEB_1', 'WEB_2', 'WEB_3', 'INT_1'],
    output: {
      findings: [{ claim: `${id} web finding`, support_class: 'DIRECTLY_SUPPORTED', source_class: 'INTERNAL_KNOWLEDGE', evidence_ref: ref }],
      recommendations: [], downstream_payload: payload,
    },
  };
}

function completeRuntimeResult() {
  return {
    workflow_state_status: 'COMPLETE', workflow_id: 'WF_TEST',
    canonical_brief_facts: { constraints: { value: 'operational', status: 'USER_PROVIDED_FACT' } },
    node_outputs: [
      groundedNode('market_context', 'E1', { problem_context: 'Contexto', market_assumptions: 'Supuestos', constraints: 'Reglas' }),
      groundedNode('icp', 'E1', { pains: 'Dolores', desired_outcomes: 'Resultados deseados' }),
      groundedNode('offer', 'E2', {
        value_proposition: 'PROPUESTA: posicionamiento basado en investigación.',
        offer_structure: 'PROPUESTA: oferta principal.', mechanism: 'PROPUESTA: mecanismo.',
        risk_reduction: 'PROPUESTA: demo de 3 días.',
        value_stack: 'PROPUESTA: CRM + clasificación de leads + agenda Google Calendar + onboarding.', constraints: 'Mantener 1,397 MXN.',
      }),
    ],
    selected_methods_by_node: {},
    synthesis: { deliverable: { '17_current_research_required': [], '16_known_limitations': [] } },
    cost: { mode: 'llm', model_calls: 3, retries: 0, tokens: { prompt: 300, completion: 150 } },
  };
}

t('research policy removes anti-fabrication blockers but preserves business facts', () => {
  const normalized = policy.normalizeResearchRequest(RAW_BRIEF);
  assert.match(normalized, /\$1,397 MXN al mes/);
  assert.match(normalized, /Mercado: México/);
  assert.match(normalized, /WhatsApp/);
  assert.match(normalized, /Google Calendar/);
  assert.doesNotMatch(normalized, /No inventar testimonios/i);
  assert.doesNotMatch(normalized, /No usar testimonios inventados/i);
  assert.doesNotMatch(normalized, /No inventar descuentos/i);
  assert.doesNotMatch(normalized, /No inventar métricas/i);
  assert.doesNotMatch(normalized, /Sin testimonios disponibles/i);
  assert.match(normalized, /investigación externa verificable y trazable/i);
  assert.match(normalized, /debe identificarse como PROPUESTA/i);
});

t('normalized research policy no longer activates testimonial/metric hard bans', () => {
  const normalized = policy.normalizeResearchRequest(RAW_BRIEF);
  const active = fidelity.activeExplicitProhibitionCategories(normalized);
  assert.equal(active.has('testimonials'), false);
  assert.equal(active.has('invented_metric'), false);
  assert.equal(active.has('invented_result'), false);
});

t('genuine content bans remain bans outside the ASTRA-12 provenance rewrite', () => {
  const active = fidelity.activeExplicitProhibitionCategories('No usar testimonios. No incluir urgencia.');
  assert.equal(active.has('testimonials'), true);
  assert.equal(active.has('urgency'), true);
});

t('web provider admits only source-verified evidence and tags EXTERNAL_RESEARCH', async () => {
  let posted = null;
  const fakeFetch = async (_url, options) => {
    posted = JSON.parse(options.body);
    const modelJson = JSON.stringify({
      market_summary: 'Mercado con alternativas SaaS y preocupación por respuesta rápida.',
      evidence: [
        { kind: 'pricing', claim: 'Competidor A publica plan mensual.', source_title: 'Competidor A', source_url: 'https://example.com/pricing', excerpt: '$999 MXN.' },
        { kind: 'review', claim: 'Reseñas mencionan lentitud de respuesta.', source_title: 'Reseñas A', source_url: 'https://reviews.example.com/a', excerpt: 'La respuesta tarda.' },
        { kind: 'offer', claim: 'Competidor B ofrece agenda integrada.', source_title: 'Competidor B', source_url: 'https://example.org/features', excerpt: 'Agenda incluida.' },
        { kind: 'testimonial', claim: 'URL inventada debe ser rechazada.', source_title: 'Fake', source_url: 'https://fake.invalid/x', excerpt: 'No admitir.' },
      ],
      patterns: ['Automatización + agenda'], gaps: ['Poca claridad de implementación'],
    });
    return {
      ok: true, status: 200,
      json: async () => ({
        output: [
          { type: 'web_search_call', action: { type: 'search', sources: [
            { url: 'https://example.com/pricing', title: 'Competidor A' },
            { url: 'https://reviews.example.com/a', title: 'Reseñas A' },
            { url: 'https://example.org/features', title: 'Competidor B' },
          ] } },
          { type: 'message', content: [{ type: 'output_text', text: modelJson, annotations: [] }] },
        ],
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      }),
    };
  };
  const out = await research.research({
    rawRequest: RAW_BRIEF,
    canonicalBriefFacts: { geography: { value: 'México', status: 'USER_PROVIDED_FACT' } },
    env: { OPENAI_API_KEY: 'test-key', ASTRA_WEB_RESEARCH_MODEL: 'gpt-5.6-luna' },
    fetchImpl: fakeFetch,
  });
  assert.equal(posted.tools[0].type, 'web_search');
  assert(posted.include.includes('web_search_call.action.sources'));
  assert.equal(out.status, 'COMPLETE');
  assert.equal(out.evidence.length, 3);
  assert(out.evidence.every(e => e.source_class === 'EXTERNAL_RESEARCH'));
  assert.deepStrictEqual(out.evidence.map(e => e.chunk_id), ['WEB_1', 'WEB_2', 'WEB_3']);
  assert.equal(out.usage.total_tokens, 150);
});

t('research augmented adapter prepends external evidence without mutating internal contract', async () => {
  const base = {
    retrieveAsync: async () => ({ corpus: 'kb_chunks_v2', pipeline: 'Strategy-F', hits: [{ chunk_id: 'INT_1', text: 'internal', source_pdf_name: 'kb.pdf' }], evidenceText: 'internal', evidence_count: 1 }),
  };
  const a = new wrapper.ResearchAugmentedAdapter(base, packFixture());
  const r = await a.retrieveAsync('mercado', { top_k: 5 });
  assert.equal(r.hits[0].chunk_id, 'WEB_1');
  assert.equal(r.hits[0].source_class, 'EXTERNAL_RESEARCH');
  assert.equal(r.hits[3].chunk_id, 'INT_1');
  assert.match(r.evidenceText, /Reseñas públicas/);
});

t('external finding provenance is remapped from E-index to WEB source URL', () => {
  const result = { node_outputs: [groundedNode('offer')] };
  wrapper.attachExternalProvenance(result, packFixture());
  const f = result.node_outputs[0].output.findings[0];
  assert.equal(f.source_class, 'EXTERNAL_RESEARCH');
  assert.equal(f.external_evidence_ref, 'WEB_1');
  assert.equal(f.source_url, 'https://reviews.example.com/a');
});

t('research provenance gate passes only when market ICP offer cite WEB and offer has PROPUESTA value stack', () => {
  const result = completeRuntimeResult();
  wrapper.attachExternalProvenance(result, packFixture());
  const check = provenance.validate(result, packFixture());
  assert.deepStrictEqual(check.violations, []);
  assert.equal(check.grounding.market_context.external_evidence_count, 1);
  assert.equal(check.grounding.icp.external_evidence_count, 1);
  assert.equal(check.grounding.offer.external_evidence_count, 1);
});

t('research provenance gate fails when offer ignores WEB evidence', () => {
  const result = completeRuntimeResult();
  result.node_outputs.find(n => n.work_unit_id === 'offer').output.findings[0].evidence_ref = 'E4';
  wrapper.attachExternalProvenance(result, packFixture());
  const check = provenance.validate(result, packFixture());
  assert(check.violations.some(v => v.type === 'EXTERNAL_RESEARCH_NOT_CITED' && v.node === 'offer'));
});

t('wrapper preserves original canonical facts and COMPLETE after deterministic research provenance PASS', async () => {
  const researchProvider = { research: async () => packFixture() };
  const hardenedRuntime = async (normalizedRequest, options) => {
    assert.match(normalizedRequest, /POLÍTICA DE PROCEDENCIA ASTRA-12/);
    assert(options.adapter instanceof wrapper.ResearchAugmentedAdapter);
    return completeRuntimeResult();
  };
  const out = await wrapper.run(RAW_BRIEF, { mode: 'llm', webResearchProvider: researchProvider, hardenedRuntime, adapter: { retrieveAsync: async () => ({ hits: [], evidenceText: '' }) } });
  assert.equal(out.workflow_state_status, 'COMPLETE');
  assert.equal(out.reason || null, null);
  assert.equal(out.web_research.status, 'COMPLETE');
  assert.equal(out.research_provenance_violations.length, 0);
  assert.equal(String(out.canonical_brief_facts.price.value), '1397');
  assert.equal(out.cost.web_research.calls, 1);
});

t('wrapper fails closed when generated strategy did not use research evidence', async () => {
  const researchProvider = { research: async () => packFixture() };
  const hardenedRuntime = async () => {
    const out = completeRuntimeResult();
    for (const node of out.node_outputs) node.output.findings[0].evidence_ref = 'E4';
    return out;
  };
  const out = await wrapper.run(RAW_BRIEF, { mode: 'llm', webResearchProvider: researchProvider, hardenedRuntime, adapter: { retrieveAsync: async () => ({ hits: [], evidenceText: '' }) } });
  assert.equal(out.workflow_state_status, 'FAILED');
  assert.equal(out.reason, 'RESEARCH_PROVENANCE_VIOLATION');
  assert.equal(out.synthesis, null);
  assert(out.research_provenance_violations.some(v => v.type === 'EXTERNAL_RESEARCH_NOT_CITED'));
});

t('Campaign360 public payload exposes research and provenance diagnostics separately from canonical facts', () => {
  const out = adapterIntegration.campaignPayload({
    workflow_state_status: 'COMPLETE', workflow_id: 'WF', node_outputs: [], selected_methods_by_node: {}, synthesis: null,
    canonical_brief_facts: { price: { value: '1397', currency: 'MXN', status: 'USER_PROVIDED_FACT' } },
    research_policy: policy.provenancePolicySummary(),
    web_research: { status: 'COMPLETE', evidence: [{ evidence_ref: 'WEB_1', source_url: 'https://a.example' }] },
    research_grounding: { offer: { external_evidence_refs: ['WEB_1'], external_evidence_count: 1 } },
    research_provenance_violations: [], cost: { model_calls: 1 },
  });
  assert.equal(out.canonical_brief_facts.price.value, '1397');
  assert.equal(out.research_policy.researched_facts, 'EXTERNAL_RESEARCH');
  assert.equal(out.web_research.status, 'COMPLETE');
  assert.equal(out.research_grounding.offer.external_evidence_count, 1);
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (err) { fail += 1; console.log('FAIL', x.name, '::', err.stack || err.message); }
  }
  console.log(`ASTRA12_WEB_MARKET_RESEARCH_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
