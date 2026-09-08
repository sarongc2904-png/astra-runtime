'use strict';
// FIRST ROUTING PROOF (Phase 11): RAW -> intent -> brief -> DAG -> query plan ->
// AgentV1Adapter read-only retrieval -> registry candidates -> adjudication -> model plan -> workflow state.
// STOPS before specialist execution. Runs the full flow in mock mode (deterministic, no API), then does
// ONE real read-only Agent V1 retrieval to prove the live adapter + provenance (bounded cost).
const { runRouterCore } = require('../src/router/orchestrator_core');
const { AgentV1Adapter } = require('../src/adapter/agent_v1_adapter');

const REQUEST = 'Create a client acquisition campaign for a laser hair removal clinic.';

function mockKb() {
  return {
    loadConfig: () => ({ apiKey: 'SECRET', model: 'openai/gpt-5-mini', baseUrl: 'https://x' }),
    groundedRetrieve: (q) => ({ evidenceText: `[chunk:mock | source:Book.pdf | page:1]\nmock evidence for ${q}`, hits: [{ rank: 1, chunk_id: 'mock_' + q.slice(0, 6), content: 'mock', source_pdf_name: 'Book.pdf', pdf_page_refs: '1', rag_decision: 'keep', quality_status: 'ok', warning_flags: [], provenance: 'kb_chunks_v2', original_query_cosine: 0.5 }], advisoryTop1Cosine: 0.5, pipeline: 'Strategy-F', corpus: 'kb_chunks_v2' }),
    classifyEvidenceSufficiency: () => ({ decision: 'PARTIAL', hasSupportedMaterial: true, specificLimitation: '', reason: '', cache: { status: 'CACHE_HIT', decision_key: 'k', llm_calls: 0 } }),
  };
}

function main() {
  const result = { request: REQUEST };

  // ---- full router-core in MOCK mode (deterministic, no API) ----
  const adapter = new AgentV1Adapter({ kb: mockKb() });
  const core = runRouterCore(REQUEST, { adapter, retrieve: true, classify: true });
  result.mock_flow = {
    intent: core.intent, objective: core.objective, business_type: core.business_type,
    workflow_order: core.workflow.order,
    query_plan: core.query_plan,
    per_step: core.per_step.map(s => ({ name: s.name, domain: s.domain, primary_query: s.primary_query, retrieval: s.retrieval, sufficiency: s.sufficiency, candidate_method_ids: s.candidate_method_ids, primary_method: s.adjudication.primary_method, adjudication_state: s.adjudication.state, selection_confidence: s.adjudication.selection_confidence, model_tier: s.model_plan.task_class })),
    workflow_state_status: core.workflow_state_status,
    specialists_executed: core.specialists_executed,
    stopped_before: core.stopped_before,
  };

  // ---- ONE real read-only Agent V1 retrieval (proves live adapter + provenance) ----
  try {
    const realAdapter = new AgentV1Adapter();
    const health = realAdapter.healthCheck();
    const real = realAdapter.retrieve('offer design and value proposition for a laser hair removal clinic', { top_k: 5 });
    result.live_agent_v1 = {
      health_ok: health.ok, exposes_api_key: health.exposes_api_key,
      corpus: real.corpus, pipeline: real.pipeline, evidence_count: real.evidence_count,
      top_chunk_ids: real.hits.map(h => h.chunk_id), first_source: real.hits[0] && real.hits[0].source_pdf_name,
      first_source_class: real.hits[0] && real.hits[0].source_class, read_only: real.read_only,
    };
  } catch (e) { result.live_agent_v1 = { error: e.message }; }

  const ok = core.intent === 'MULTI_STEP_MARKETING'
    && core.workflow.order.length === 8
    && core.workflow_state_status === 'PLANNED'
    && core.specialists_executed === false
    && core.per_step.every(s => s.candidate_method_ids !== undefined);
  result.FIRST_ROUTING_PROOF = ok ? 'PASS' : 'FAIL';
  console.log(JSON.stringify(result, null, 2));
  console.log('FIRST_ROUTING_PROOF=' + result.FIRST_ROUTING_PROOF);
  if (!ok) process.exit(1);
}
main();
