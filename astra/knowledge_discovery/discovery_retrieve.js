'use strict';
// ASTRA-03 discovery retrieval — read-only Agent V1 (Strategy-F over kb_chunks_v2).
// Bounded queries from discovery_queries.json; captures top5 provenance + short snippets.
// Does NOT classify, generate, or mutate anything.
const fs = require('fs');
const path = require('path');
const { AgentV1Adapter } = require('../src/adapter/agent_v1_adapter');

const DIR = __dirname;
const queries = JSON.parse(fs.readFileSync(path.join(DIR, 'discovery_queries.json'), 'utf8')).queries;
const adapter = new AgentV1Adapter();

function snippet(t, n = 240) { return String(t || '').replace(/\s+/g, ' ').trim().slice(0, n); }

(async () => {
  const out = { captured_at: new Date().toISOString(), corpus: 'kb_chunks_v2', pipeline: 'Strategy-F', results: [] };
  const health = adapter.healthCheck();
  out.health = { ok: health.ok, exposes_api_key: health.exposes_api_key };
  for (const q of queries) {
    try {
      const r = adapter.retrieve(q.query, { top_k: 5 });
      out.results.push({
        id: q.id, category: q.category, domain: q.domain, query: q.query,
        corpus: r.corpus, pipeline: r.pipeline, evidence_count: r.evidence_count,
        hits: r.hits.map(h => ({ evidence_id: h.evidence_id, chunk_id: h.chunk_id, source_pdf_name: h.source_pdf_name, pdf_page_refs: h.pdf_page_refs, cosine: h.cosine, snippet: snippet(h.text) })),
      });
      console.log(`${q.id} ${q.category} -> ${r.evidence_count} hits top_cos=${(r.hits[0] && r.hits[0].cosine || 0).toFixed(3)}`);
    } catch (e) { out.results.push({ id: q.id, error: e.message }); console.log(`${q.id} ERROR ${e.message}`); }
  }
  fs.writeFileSync(path.join(DIR, 'retrieval_raw.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('DISCOVERY_DONE queries=' + out.results.length);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
