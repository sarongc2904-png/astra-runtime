'use strict';

// ASTRA-12 research-grounded Campaign360 wrapper.
// Keeps the hardened DAG/fidelity engine intact, adds one source-verified web
// research pass, injects that evidence through the existing adapter contract,
// then applies a deterministic provenance gate before COMPLETE is allowed.

const H = require('./marketing_campaign_360_hardened');
const briefFacts = require('./campaign_brief_facts');
const { AgentV1Adapter } = require('../adapter/agent_v1_adapter');
const webMarketResearch = require('../research/web_market_research');
const researchPolicy = require('../research/research_policy');
const researchProvenance = require('../research/research_provenance_validator');
const diag = require('../integration/diag');

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

const EXTERNAL_RESEARCH_KIND_SCOPE = Object.freeze({
  market_context: null, // all verified market evidence
  icp: new Set(['pain', 'objection', 'language', 'review', 'testimonial', 'trend', 'other']),
  offer: new Set(['competitor', 'pricing', 'offer', 'discount', 'review', 'objection', 'trend', 'other']),
});

function externalHits(pack, limit = 4, allowedKinds = null) {
  const all = pack && Array.isArray(pack.evidence) ? pack.evidence : [];
  const filtered = allowedKinds instanceof Set ? all.filter(e => allowedKinds.has(String(e && e.kind || 'other').toLowerCase())) : all;
  return filtered.slice(0, limit).map((e, i) => ({
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

const EXTERNAL_RESEARCH_NODES = new Set(['market_context', 'icp', 'offer']);

function shouldInjectExternalResearch(options = {}) {
  const nodeId = String(options.campaign360_node_id || '').trim();
  return EXTERNAL_RESEARCH_NODES.has(nodeId);
}

function redactExternalMoneyForICP(text) {
  return String(text || '').replace(/\$\s*[\d][\d,.]*(?:\s*(?:MXN|USD|pesos?|d[oó]lares?))?/gi, '[PRECIO_EXTERNO_OCULTO_PARA_ICP]');
}

function externalResearchKindsForNode(options = {}) {
  const nodeId = String(options.campaign360_node_id || '').trim();
  return Object.prototype.hasOwnProperty.call(EXTERNAL_RESEARCH_KIND_SCOPE, nodeId)
    ? EXTERNAL_RESEARCH_KIND_SCOPE[nodeId]
    : new Set();
}

function mergeRetrieval(internal, pack, options = {}) {
  const allowedKinds = externalResearchKindsForNode(options);
  let web = shouldInjectExternalResearch(options) ? externalHits(pack, 4, allowedKinds) : [];
  if (String(options.campaign360_node_id || '').trim() === 'icp') {
    web = web.map(h => ({ ...h, text: redactExternalMoneyForICP(h.text) }));
  }
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
  retrieve(query, options = {}) { return mergeRetrieval(this.base.retrieve(query, options), this.pack, options); }
  async retrieveAsync(query, options = {}) {
    const r = typeof this.base.retrieveAsync === 'function'
      ? await this.base.retrieveAsync(query, options)
      : this.base.retrieve(query, options);
    return mergeRetrieval(r, this.pack, options);
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

async function executeHardened(runtime, request, options) {
  if (typeof runtime === 'function') return runtime(request, options);
  if (runtime && typeof runtime.run === 'function') return runtime.run(request, options);
  throw new Error('invalid hardened Campaign360 runtime');
}

const RETRYABLE_WEB_RESEARCH_ERRORS = new Set([
  'WEB_MARKET_RESEARCH_TIMEOUT',
  'WEB_MARKET_RESEARCH_REQUEST_FAILED',
  'WEB_MARKET_RESEARCH_PROVIDER_FAILED',
  'WEB_MARKET_RESEARCH_EMPTY',
  'WEB_MARKET_RESEARCH_INVALID_JSON',
]);

function isRetryableWebResearchError(err) {
  return !!err && RETRYABLE_WEB_RESEARCH_ERRORS.has(String(err.code || ''));
}

async function run(rawRequest, options = {}) {
  if (options.webResearch === false) return H.run(rawRequest, options);
  const emitProgress = payload => {
    try { if (typeof options.onProgress === 'function') options.onProgress(payload); } catch (_) {}
  };

  const originalCanonicalFacts = briefFacts.extract(rawRequest);
  emitProgress({ phase: 'WEB_RESEARCH', current_node: 'market_context', active_nodes: ['market_context'], completed_nodes: [] });
  const researchProvider = options.webResearchProvider || webMarketResearch;
  let pack;
  const maxResearchAttempts = Math.max(1, Math.min(2, Number(options.webResearchAttempts || 2)));
  let researchErr = null;
  let researchAttempts = 0;
  for (let attempt = 1; attempt <= maxResearchAttempts; attempt++) {
    researchAttempts = attempt;
    try {
      pack = await researchProvider.research({
        rawRequest,
        canonicalBriefFacts: originalCanonicalFacts,
        env: options.researchEnv || process.env,
        fetchImpl: options.fetchImpl,
        timeoutMs: options.webResearchTimeoutMs,
      });
      researchErr = null;
      break;
    } catch (err) {
      researchErr = err;
      if (!isRetryableWebResearchError(err) || attempt >= maxResearchAttempts) break;
      emitProgress({ phase: 'WEB_RESEARCH_RETRY', current_node: 'market_context', active_nodes: ['market_context'], completed_nodes: [], attempt: attempt + 1, error_code: err.code || 'WEB_MARKET_RESEARCH_FAILED' });
    }
  }
  if (researchErr) {
    const specificCode = researchErr.code || 'WEB_MARKET_RESEARCH_FAILED';
    emitProgress({ phase: 'FAILED', current_node: 'market_context', active_nodes: [], completed_nodes: [] });
    return {
      mode: options.mode || 'llm',
      workflow_id: 'WF_MC360H',
      workflow_state_status: 'FAILED',
      reason: specificCode,
      failure_category: 'WEB_MARKET_RESEARCH',
      canonical_brief_facts: originalCanonicalFacts,
      research_policy: researchPolicy.provenancePolicySummary(),
      web_research: {
        status: 'FAILED',
        attempts: researchAttempts,
        retryable: isRetryableWebResearchError(researchErr),
        error: { code: specificCode, message: String(researchErr.message || researchErr) },
      },
      research_provenance_violations: [], research_grounding: {},
      node_outputs: [], selected_methods_by_node: {}, synthesis: null,
      cost: { mode: options.mode || 'llm', model_calls: 0, retries: Math.max(0, researchAttempts - 1), tokens: { prompt: 0, completion: 0 }, web_research: { calls: researchAttempts, failed: true } },
    };
  }

  emitProgress({ phase: 'WEB_RESEARCH_COMPLETE', current_node: null, active_nodes: [], completed_nodes: [] });

  // Anti-fabrication blockers become provenance requirements on this ASTRA-12 path.
  // The original brief/facts remain untouched and are restored as the public canonical facts.
  const normalizedRequest = researchPolicy.normalizeResearchRequest(rawRequest);
  const baseAdapter = options.adapter || new AgentV1Adapter(options.adapterOpts || {});
  const adapter = new ResearchAugmentedAdapter(baseAdapter, pack);
  const runtime = options.hardenedRuntime || H;
  const result = await executeHardened(runtime, normalizedRequest, Object.assign({}, options, { adapter }));

  result.operational_brief_facts = clone(result.canonical_brief_facts);
  result.canonical_brief_facts = originalCanonicalFacts;
  result.research_policy = researchPolicy.provenancePolicySummary();
  result.web_research = publicResearchPack(pack);
  attachExternalProvenance(result, pack);
  addResearchUsage(result, pack);

  result.research_provenance_violations = [];
  result.research_grounding = {};
  if (result.workflow_state_status === 'COMPLETE') {
    emitProgress({ phase: 'RESEARCH_PROVENANCE', current_node: 'final_synthesis', active_nodes: ['final_synthesis'], completed_nodes: (result.node_outputs || []).map(x => x.work_unit_id) });
    const check = researchProvenance.validate(result, pack);
    result.research_grounding = check.grounding;
    result.research_provenance_violations = check.violations;
    diag.mark(result.workflow_id || 'WF_MC360H', 'RESEARCH_PROVENANCE_CHECK', {
      violation_count: check.violations.length,
      violations: check.violations.map(v => ({ type: v.type, node: v.node || null, field_key: v.field_key || null })),
      grounding: Object.fromEntries(Object.entries(check.grounding || {}).map(([node, g]) => [node, { external_evidence_count: g && g.external_evidence_count || 0 }])),
      web_evidence_count: Array.isArray(pack.evidence) ? pack.evidence.length : 0,
      source_count: pack.source_count || 0,
    });
    if (check.violations.length) {
      // The strategy may have been generated, but it is not valid ASTRA-12 output unless the
      // market/ICP/offer actually cite source-verified WEB evidence and the offer is a proposal.
      result.workflow_state_status = 'FAILED';
      result.reason = 'RESEARCH_PROVENANCE_VIOLATION';
      emitProgress({ phase: 'FAILED', current_node: 'final_synthesis', active_nodes: [], completed_nodes: (result.node_outputs || []).map(x => x.work_unit_id) });
      result.research_candidate_synthesis = result.synthesis;
      result.synthesis = null;
    }
  }
  return result;
}

module.exports = {
  run,
  ResearchAugmentedAdapter,
  mergeRetrieval,
  externalHits,
  shouldInjectExternalResearch,
  EXTERNAL_RESEARCH_NODES,
  EXTERNAL_RESEARCH_KIND_SCOPE,
  externalResearchKindsForNode,
  redactExternalMoneyForICP,
  attachExternalProvenance,
  publicResearchPack,
  executeHardened,
  RETRYABLE_WEB_RESEARCH_ERRORS,
  isRetryableWebResearchError,
};
