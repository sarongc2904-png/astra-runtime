'use strict';

// ASTRA-12 research-grounded Campaign360 wrapper.
// Keeps the hardened DAG/fidelity engine unchanged, but adds one source-verified web
// research pass and exposes it to every specialist through the existing evidence contract.

const H = require('./marketing_campaign_360_hardened');
const briefFacts = require('./campaign_brief_facts');
const { AgentV1Adapter } = require('../adapter/agent_v1_adapter');
const webMarketResearch = require('../research/web_market_research');
const researchPolicy = require('../research/research_policy');

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

function externalHits(pack, limit = 4) {
  return (pack && Array.isArray(pack.evidence) ? pack.evidence : []).slice(0, limit).map((e, i) => ({
    evidence_id: e.evidence_id || e.chunk_id || `WEB_${i + 1}`,
    source_class: 'EXTERNAL_RESEARCH',
    rank: i + 1,
    chunk_id: e.chunk_id || `WEB_${i + 1}`,
    source_id: e.source_url,
    source_pdf_name: e.source_pdf_name || `WEB_RESEARCH:${e.source_title || e.source_url} | ${e.source_url}`,
    source_url: e.source_url,
    source_title: e.source_title,
    cosine: null,
    text: e.text,
    retrieval_query: 'ASTRA-12 pre-campaign web market research',
  }));
}

function mergeRetrieval(internal, pack) {
  const web = externalHits(pack);
  const internalHits = Array.isArray(internal && internal.hits) ? internal.hits : [];
  const hits = web.concat(internalHits);
  const webText = web.map(h => `[${h.chunk_id}] ${h.text} SOURCE: ${h.source_id}`).join('\n');
  return Object.assign({}, internal || {}, {
    hits,
    evidence_count: hits.length,
    evidenceText: [webText, internal && internal.evidenceText || ''].filter(Boolean).join('\n\n'),
    astra12_external_research_count: web.length,
  });
}

class ResearchAugmentedAdapter {
  constructor(baseAdapter, pack) { this.base = baseAdapter; this.pack = pack; }
  retrieve(query, options = {}) { return mergeRetrieval(this.base.retrieve(query, options), this.pack); }
  async retrieveAsync(query, options = {}) {
    const r = typeof this.base.retrieveAsync === 'function'
      ? await this.base.retrieveAsync(query, options)
      : this.base.retrieve(query, options);
    return mergeRetrieval(r, this.pack);
  }
  config() { return typeof this.base.config === 'function' ? this.base.config() : {}; }
  getRuntimeContract() { return typeof this.base.getRuntimeContract === 'function' ? this.base.getRuntimeContract() : {}; }
  classify(query, evidenceText) { return typeof this.base.classify === 'function' ? this.base.classify(query, evidenceText) : null; }
  healthCheck() { return typeof this.base.healthCheck === 'function' ? this.base.healthCheck() : { ok: true, read_only: true }; }
}

function resolveEvidenceRef(ref, nodeRecord) {
  const raw = String(ref || '').trim();
  if (/^WEB_\d+$/i.test(raw)) return raw.toUpperCase();
  const m = /^E(\d+)$/i.exec(raw);
  if (!m || !nodeRecord || !Array.isArray(nodeRecord.evidence_chunk_ids)) return null;
  const id = nodeRecord.evidence_chunk_ids[Number(m[1]) - 1];
  return /^WEB_\d+$/i.test(String(id || '')) ? String(id).toUpperCase() : null;
}

function attachExternalProvenance(result, pack) {
  if (!result || !pack || !Array.isArray(pack.evidence)) return result;
  const byId = new Map(pack.evidence.map(e => [String(e.chunk_id).toUpperCase(), e]));
  for (const node of result.node_outputs || []) {
    const findings = node && node.output && Array.isArray(node.output.findings) ? node.output.findings : [];
    for (const finding of findings) {
      const id = resolveEvidenceRef(finding.evidence_ref, node);
      const evidence = id && byId.get(id);
      if (!evidence) continue;
      finding.source_class = 'EXTERNAL_RESEARCH';
      finding.external_evidence_ref = id;
      finding.source_url = evidence.source_url;
      finding.source_title = evidence.source_title;
    }
  }
  return result;
}

function publicResearchPack(pack) {
  if (!pack) return null;
  return {
    status: pack.status,
    source_class: 'EXTERNAL_RESEARCH',
    model: pack.model,
    retrieved_at: pack.retrieved_at,
    market_summary: pack.market_summary,
    patterns: pack.patterns || [],
    gaps: pack.gaps || [],
    source_count: pack.source_count || 0,
    evidence: (pack.evidence || []).map(e => ({
      evidence_ref: e.chunk_id,
      kind: e.kind,
      claim: e.text,
      source_title: e.source_title,
      source_url: e.source_url,
      retrieved_at: e.retrieved_at,
    })),
    usage: pack.usage || {},
  };
}

function addResearchUsage(result, pack) {
  if (!result || !pack) return;
  result.cost = result.cost || { mode: 'llm', model_calls: 0, retries: 0, tokens: { prompt: 0, completion: 0 } };
  result.cost.model_calls = (result.cost.model_calls || 0) + 1;
  result.cost.tokens = result.cost.tokens || { prompt: 0, completion: 0 };
  result.cost.tokens.prompt = (result.cost.tokens.prompt || 0) + (pack.usage && pack.usage.input_tokens || 0);
  result.cost.tokens.completion = (result.cost.tokens.completion || 0) + (pack.usage && pack.usage.output_tokens || 0);
  result.cost.web_research = {
    calls: 1,
    model: pack.model,
    evidence_count: (pack.evidence || []).length,
    source_count: pack.source_count || 0,
    input_tokens: pack.usage && pack.usage.input_tokens || 0,
    output_tokens: pack.usage && pack.usage.output_tokens || 0,
  };
}

async function run(rawRequest, options = {}) {
  if (options.webResearch === false) return H.run(rawRequest, options);

  const originalCanonicalFacts = briefFacts.extract(rawRequest);
  const researchProvider = options.webResearchProvider || webMarketResearch;
  let pack;
  try {
    pack = await researchProvider.research({
      rawRequest,
      canonicalBriefFacts: originalCanonicalFacts,
      env: options.researchEnv || process.env,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.webResearchTimeoutMs,
    });
  } catch (err) {
    return {
      mode: options.mode || 'llm',
      workflow_id: 'WF_MC360H',
      workflow_state_status: 'FAILED',
      reason: 'WEB_MARKET_RESEARCH_FAILED',
      canonical_brief_facts: originalCanonicalFacts,
      research_policy: researchPolicy.provenancePolicySummary(),
      web_research: { status: 'FAILED', error: { code: err.code || 'WEB_MARKET_RESEARCH_FAILED', message: String(err.message || err) } },
      node_outputs: [], selected_methods_by_node: {}, synthesis: null,
      cost: { mode: options.mode || 'llm', model_calls: 0, retries: 0, tokens: { prompt: 0, completion: 0 }, web_research: { calls: 1, failed: true } },
    };
  }

  const normalizedRequest = researchPolicy.normalizeResearchRequest(rawRequest);
  const baseAdapter = options.adapter || new AgentV1Adapter(options.adapterOpts || {});
  const adapter = new ResearchAugmentedAdapter(baseAdapter, pack);
  const result = await H.run(normalizedRequest, Object.assign({}, options, { adapter }));

  // Canonical user facts remain exactly derived from the original brief. The hardened
  // engine's normalized policy facts are retained separately for auditability.
  result.operational_brief_facts = clone(result.canonical_brief_facts);
  result.canonical_brief_facts = originalCanonicalFacts;
  result.research_policy = researchPolicy.provenancePolicySummary();
  result.web_research = publicResearchPack(pack);
  attachExternalProvenance(result, pack);
  addResearchUsage(result, pack);
  return result;
}

module.exports = {
  run,
  ResearchAugmentedAdapter,
  mergeRetrieval,
  externalHits,
  attachExternalProvenance,
  publicResearchPack,
};
