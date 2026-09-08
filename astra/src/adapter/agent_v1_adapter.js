'use strict';
// AgentV1Adapter — READ-ONLY bridge to the frozen Agent V1 knowledge engine.
// Only calls approved read-only exports (groundedRetrieve, classifyEvidenceSufficiency, loadConfig).
// Pins the runtime contract (corpus=kb_chunks_v2, pipeline=Strategy-F) and FAILS CLOSED on mismatch.
// Never exposes the API key. Never mutates Agent V1 state.
const path = require('path');
const { execFile } = require('child_process');
const { MAX_EVIDENCE_PER_STEP, DEFAULT_TOP_K } = require('../../config/context_budgets');

// [ASTRA-10X] Async (non-event-loop-blocking) counterpart to knowledge.js's retrieveStrategyF(),
// which uses execFileSync and therefore blocks the whole Node process while the Python subprocess
// runs. This wrapper is ASTRA-local only: it does not change knowledge.js's contract (still used
// synchronously by chat.js, app/server.js, adjuntos.js, imagen.js, and other non-ASTRA consumers).
// It replicates, byte-for-byte, the same invocation knowledge.js performs: same script path (built
// from kb.AGENTE, the same exported constant knowledge.js itself uses), same python resolution order
// (STRATEGY_F_PYTHON -> PYTHON -> 'python'), same CLI args, same encoding/maxBuffer/timeout (120000ms),
// same stdout JSON parsing, same {error} propagation. Each invocation is a fresh, isolated OS process
// (no shared memory with any concurrent invocation), so retrieval_strategy_f.py's internal `global
// _CORPUS` state is never shared across concurrent calls.
function strategyFPythonBin() { return process.env.STRATEGY_F_PYTHON || process.env.PYTHON || 'python'; }
function retrieveStrategyFAsync(kb, query, topK) {
  const script = path.join(kb.AGENTE, 'retrieval_strategy_f.py');
  return new Promise((resolve, reject) => {
    execFile(strategyFPythonBin(), [script, '--query', String(query), '--top-k', String(topK)],
      { encoding: 'utf8', maxBuffer: 96 * 1024 * 1024, timeout: 120000 },
      (err, stdout) => {
        if (err) return reject(err);
        let parsed;
        try { parsed = JSON.parse(stdout); } catch (e) { return reject(e); }
        if (parsed.error) return reject(new Error(`Strategy-F retrieval: ${parsed.error}`));
        resolve(parsed);
      });
  });
}

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
  // Shared post-processing for both retrieve() and retrieveAsync(): identical contract validation
  // and identical hit/evidence shaping — kept in one place so the two entry points can never diverge.
  _shapeResult(r, query, topK) {
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
  // Read-only retrieval. Validates the returned contract; fails closed on mismatch.
  // SYNCHRONOUS — unchanged since before ASTRA-10X. Still used as-is by orchestrator_core.js and the
  // base (non-hardened) marketing_campaign_360.js; blocks the event loop via knowledge.js's execFileSync.
  retrieve(query, options = {}) {
    this._guard('groundedRetrieve');
    const topK = Math.min(options.top_k || DEFAULT_TOP_K, DEFAULT_TOP_K);
    const r = this.kb.groundedRetrieve(String(query), topK);
    return this._shapeResult(r, query, topK);
  }
  // [ASTRA-10X] Non-blocking counterpart of retrieve(), used only by the hardened workflow so
  // parallel DAG waves can retrieve concurrently without serializing on the Node event loop.
  // Same contract, same validation, same shaped result as retrieve() — only the transport differs
  // (execFile instead of execFileSync). Does not call knowledge.js at all; reads only its already-
  // exported AGENTE path constant to build the identical script path.
  async retrieveAsync(query, options = {}) {
    this._guard('groundedRetrieve');
    const topK = Math.min(options.top_k || DEFAULT_TOP_K, DEFAULT_TOP_K);
    // Test doubles may inject kb.retrieveStrategyFAsync directly (offline, deterministic, no
    // subprocess) — same injection pattern already used for kb.groundedRetrieve. Production (real
    // knowledge.js, which exports no such function) falls through to the real execFile invocation.
    const raw = typeof this.kb.retrieveStrategyFAsync === 'function'
      ? await this.kb.retrieveStrategyFAsync(String(query), topK)
      : await retrieveStrategyFAsync(this.kb, String(query), topK);
    const r = this.kb.buildStrategyFEvidence(raw);
    return this._shapeResult(r, query, topK);
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
