'use strict';
// Regression: external competitor pricing research must not leak into operational Campaign360 nodes.
const assert = require('assert');
const R = require('../src/workflows/marketing_campaign_360_research');

const pack = {
  evidence: [
    {
      chunk_id: 'WEB_1',
      evidence_id: 'WEB_1',
      source_url: 'https://example.com/agenda',
      source_title: 'Competitor pricing',
      text: 'Agenda competitor Premium costs $4,500 MXN per month.',
    },
  ],
};

const base = {
  retrieve(query, options) {
    return {
      hits: [{ chunk_id: 'INT_1', source_id: 'kb', source_pdf_name: 'internal.md', source_class: 'INTERNAL_KNOWLEDGE', text: 'WhatsApp sales handling method', cosine: 0.7 }],
      evidenceText: 'WhatsApp sales handling method',
    };
  },
  async retrieveAsync(query, options) { return this.retrieve(query, options); },
};

(async () => {
  const a = new R.ResearchAugmentedAdapter(base, pack);

  // Market/ICP/Offer are the only nodes that may receive market competitor evidence.
  for (const nodeId of ['market_context', 'icp', 'offer']) {
    const r = await a.retrieveAsync('q', { campaign360_node_id: nodeId, top_k: 5 });
    assert(r.hits.some(h => h.chunk_id === 'WEB_1'), nodeId + ' should receive WEB evidence');
    assert.equal(r.astra12_external_research_count, 1);
  }

  // Operational nodes must not receive competitor pricing/research.
  for (const nodeId of ['funnel', 'creative_strategy', 'ads', 'whatsapp_conversion', 'measurement']) {
    const r = await a.retrieveAsync('q', { campaign360_node_id: nodeId, top_k: 5 });
    assert(!r.hits.some(h => /^WEB_/.test(String(h.chunk_id))), nodeId + ' leaked WEB evidence');
    assert(!String(r.evidenceText).includes('4,500'), nodeId + ' leaked competitor price');
    assert.equal(r.astra12_external_research_count, 0);
  }

  assert.equal(R.shouldInjectExternalResearch({ campaign360_node_id: 'whatsapp_conversion' }), false);
  assert.equal(R.shouldInjectExternalResearch({ campaign360_node_id: 'offer' }), true);
  assert.deepStrictEqual([...R.EXTERNAL_RESEARCH_NODES].sort(), ['icp', 'market_context', 'offer']);

  console.log('ASTRA_CAMPAIGN360_RESEARCH_SCOPE_ISOLATION_TEST_RESULT pass=1 fail=0');
})().catch(e => { console.error(e); process.exit(1); });
