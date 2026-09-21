'use strict';
const assert = require('assert');
const R = require('../src/workflows/marketing_campaign_360_research');

const pack = {
  evidence: [
    { chunk_id:'WEB_1', kind:'pricing', source_url:'https://example.com/p', source_title:'pricing', text:'Competitor plan $400 MXN' },
    { chunk_id:'WEB_2', kind:'pain', source_url:'https://example.com/pain', source_title:'pain', text:'Owners report missed WhatsApp follow-up' },
    { chunk_id:'WEB_3', kind:'objection', source_url:'https://example.com/o', source_title:'objection', text:'Concern about setup complexity' },
    { chunk_id:'WEB_4', kind:'offer', source_url:'https://example.com/offer', source_title:'offer', text:'Competitor offers 14-day trial' },
    { chunk_id:'WEB_5', kind:'language', source_url:'https://example.com/l', source_title:'language', text:'Customers say mensajes pendientes' },
  ],
};

const internal = { hits:[{ chunk_id:'INT_1', text:'internal ICP method', source_class:'INTERNAL_KNOWLEDGE' }], evidenceText:'internal ICP method' };

const icp = R.mergeRetrieval(internal, pack, { campaign360_node_id:'icp' });
assert(!icp.hits.some(h => h.chunk_id === 'WEB_1'), 'ICP must not receive competitor pricing');
assert(!icp.hits.some(h => h.chunk_id === 'WEB_4'), 'ICP must not receive competitor offer mechanics');
assert(icp.hits.some(h => h.chunk_id === 'WEB_2'), 'ICP should receive pain evidence');
assert(icp.hits.some(h => h.chunk_id === 'WEB_3'), 'ICP should receive objection evidence');
assert(icp.hits.some(h => h.chunk_id === 'WEB_5'), 'ICP should receive language evidence');
assert(!String(icp.evidenceText).includes('$400'), 'ICP evidence text must not contain competitor price');

const offer = R.mergeRetrieval(internal, pack, { campaign360_node_id:'offer' });
assert(offer.hits.some(h => h.chunk_id === 'WEB_1'), 'Offer should receive pricing evidence');
assert(offer.hits.some(h => h.chunk_id === 'WEB_4'), 'Offer should receive offer evidence');

const market = R.mergeRetrieval(internal, pack, { campaign360_node_id:'market_context' });
assert(market.hits.some(h => h.chunk_id === 'WEB_1'), 'Market context should retain all market evidence');

console.log('ASTRA_CAMPAIGN360_ICP_RESEARCH_KIND_SCOPE_TEST_RESULT pass=1 fail=0');
