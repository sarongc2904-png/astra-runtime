'use strict';

const assert = require('assert');
const policy = require('../src/research/research_policy');
const research = require('../src/research/web_market_research');
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
    retrieveAsync: async () => ({
      corpus: 'kb_chunks_v2', pipeline: 'Strategy-F', hits: [{ chunk_id: 'INT_1', text: 'internal', source_pdf_name: 'kb.pdf' }], evidenceText: 'internal', evidence_count: 1,
    }),
  };
  const pack = { evidence: [
    { chunk_id: 'WEB_1', source_url: 'https://a.example', source_title: 'A', source_pdf_name: 'WEB_RESEARCH:A | https://a.example', text: 'Precio público observado', source_class: 'EXTERNAL_RESEARCH' },
  ] };
  const a = new wrapper.ResearchAugmentedAdapter(base, pack);
  const r = await a.retrieveAsync('mercado', { top_k: 5 });
  assert.equal(r.hits[0].chunk_id, 'WEB_1');
  assert.equal(r.hits[0].source_class, 'EXTERNAL_RESEARCH');
  assert.equal(r.hits[1].chunk_id, 'INT_1');
  assert.match(r.evidenceText, /Precio público observado/);
});

t('external finding provenance is remapped from E-index to WEB source URL', () => {
  const result = { node_outputs: [{
    work_unit_id: 'offer', evidence_chunk_ids: ['WEB_1', 'INT_1'],
    output: { findings: [{ claim: 'Precio competidor', support_class: 'DIRECTLY_SUPPORTED', source_class: 'INTERNAL_KNOWLEDGE', evidence_ref: 'E1' }] },
  }] };
  const pack = { evidence: [{ chunk_id: 'WEB_1', source_url: 'https://a.example', source_title: 'A' }] };
  wrapper.attachExternalProvenance(result, pack);
  const f = result.node_outputs[0].output.findings[0];
  assert.equal(f.source_class, 'EXTERNAL_RESEARCH');
  assert.equal(f.external_evidence_ref, 'WEB_1');
  assert.equal(f.source_url, 'https://a.example');
});

t('Campaign360 public payload exposes research separately from canonical facts', () => {
  const out = adapterIntegration.campaignPayload({
    workflow_state_status: 'COMPLETE', workflow_id: 'WF', node_outputs: [], selected_methods_by_node: {}, synthesis: null,
    canonical_brief_facts: { price: { value: '1397', currency: 'MXN', status: 'USER_PROVIDED_FACT' } },
    research_policy: policy.provenancePolicySummary(),
    web_research: { status: 'COMPLETE', evidence: [{ evidence_ref: 'WEB_1', source_url: 'https://a.example' }] },
    cost: { model_calls: 1 },
  });
  assert.equal(out.canonical_brief_facts.price.value, '1397');
  assert.equal(out.research_policy.researched_facts, 'EXTERNAL_RESEARCH');
  assert.equal(out.web_research.status, 'COMPLETE');
});

(async () => {
  for (const x of tests) {
    try { await x.fn(); pass += 1; console.log('PASS', x.name); }
    catch (err) { fail += 1; console.log('FAIL', x.name, '::', err.stack || err.message); }
  }
  console.log(`ASTRA12_WEB_MARKET_RESEARCH_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) process.exit(1);
})();
