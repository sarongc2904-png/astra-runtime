'use strict';
// AgentV1Adapter — READ-ONLY bridge to the frozen Agent V1 knowledge engine.
// Only calls approved read-only exports (groundedRetrieve, classifyEvidenceSufficiency, loadConfig).
// Pins the runtime contract (corpus=kb_chunks_v2, pipeline=Strategy-F) and FAILS CLOSED on mismatch.
// Never exposes the API key. Never mutates Agent V1 state.
const path = require('path');
const { MAX_EVIDENCE_PER_STEP, DEFAULT_TOP_K } = require('../../config/context_budgets');

const EXPECTED_CORPUS = 'kb_chunks_v2';
const EXPECTED_PIPELINE = 'Strategy-F';
// allow-list of Agent V1 methods this adapter may ever call (read-only)
const ALLOWED = new Set(['loadConfig', 'groundedRetrieve', 'classifyEvidenceSufficiency']);

class AgentV1Adapter {
  // kb may be injected (tests); defaults to the real ../../../knowledge.js
  constructor(opts = {}) {
    this.kb = opts.kb || require(path.join(__dirname, '..', '..', '..', 'knowledge.js'));
    this._config = null;
  }
  _guard(name) { if (!ALLOWED.has(name)) throw new Error(`AgentV1Adapter: method not allow-listed (read-only): ${name}`); }
  config() {
    this._guard('loadConfig');
    if (!this._config) this._config = this.kb.loadConfig();
    // NEVER expose apiKey
    return { model: this._config.model, baseUrl: this._config.baseUrl };
  }
  getRuntimeContract() {
    return { expected_corpus: EXPECTED_CORPUS, expected_pipeline: EXPECTED_PIPELINE, model: this.config().model };
  }
  // Read-only retrieval. Validates the returned contract; fails closed on mismatch.
  retrieve(query, options = {}) {
    this._guard('groundedRetrieve');
    const topK = Math.min(options.top_k || DEFAULT_TOP_K, DEFAULT_TOP_K);
    const r = this.kb.groundedRetrieve(String(query), topK);
    if (!r || r.corpus !== EXPECTED_CORPUS || r.pipeline !== EXPECTED_PIPELINE) {
      throw new Error(`AgentV1Adapter: runtime contract mismatch (corpus=${r && r.corpus}, pipeline=${r && r.pipeline}) — FAIL CLOSED`);
    }
    const hits = (r.hits || []).map((h, i) => ({
      evidence_id: 'E' + (i + 1),
      source_class: 'INTERNAL_KNOWLEDGE',
      rank: h.rank, chunk_id: h.chunk_id, source_pdf_name: h.source_pdf_name, pdf_page_refs: h.pdf_page_refs,
      rag_decision: h.rag_decision, quality_status: h.quality_status, warning_flags: h.warning_flags,
      cosine: h.original_query_cosine, text: h.content, retrieval_query: String(query),
    }));
    let evidenceText = String(r.evidenceText || '');
    if (evidenceText.length > MAX_EVIDENCE_PER_STEP) evidenceText = evidenceText.slice(0, MAX_EVIDENCE_PER_STEP); // budget-bound
    return {
      corpus: r.corpus, pipeline: r.pipeline, query: String(query), top_k: topK,
      evidence_count: hits.length, hits, evidenceText, advisory_top1_cosine: r.advisoryTop1Cosine,
      read_only: true,
    };
  }
  // Optional: classify sufficiency (cached, operationally deterministic). Read-only through Agent V1.
  classify(query, evidenceText) {
    this._guard('classifyEvidenceSufficiency');
    const cfg = this._config || this.kb.loadConfig();
    const out = this.kb.classifyEvidenceSufficiency(cfg, cfg.model, String(query), String(evidenceText || ''));
    return out; // caller reads .decision / .cache — adapter does not mutate cache
  }
  // lightweight smoke check without a live API call
  healthCheck() {
    const contract = this.getRuntimeContract();
    return {
      ok: contract.expected_corpus === EXPECTED_CORPUS && contract.expected_pipeline === EXPECTED_PIPELINE,
      contract, exposes_api_key: false, read_only: true, allow_listed_methods: [...ALLOWED],
    };
  }
}

module.exports = { AgentV1Adapter, EXPECTED_CORPUS, EXPECTED_PIPELINE, ALLOWED };
