'use strict';
// Router-core orchestrator: wires the ASTRA-02 pipeline up to (but NOT including) specialist execution.
// RAW -> intent -> brief -> DAG -> query plan -> [Agent V1 read-only retrieval] -> registry candidates
//     -> adjudication -> model plan -> workflow state (PLANNED). Stops before specialists.
const intentAnalyzer = require('./intent_analyzer');
const decomposer = require('./task_decomposer');
const planner = require('./knowledge_query_planner');
const adjudicator = require('./method_adjudicator');
const { load: loadRegistry } = require('../methods/registry_loader');
const modelRouter = require('../model_router/model_router');
const wfState = require('../state/workflow_state');
const { AgentV1Adapter } = require('../adapter/agent_v1_adapter');

// options: { adapter (injectable), retrieve:true|false (do live Agent V1 retrieval), registryPath }
function runRouterCore(rawRequest, options = {}) {
  const registry = loadRegistry(options.registryPath);
  const adapter = options.adapter || new AgentV1Adapter(options.adapterOpts || {});
  const doRetrieve = options.retrieve === true;

  // 1-2 intent + brief
  const intentResult = intentAnalyzer.analyze(rawRequest, { salt: options.salt });
  const brief = intentResult.brief;

  // 3 decompose
  const workflow = decomposer.decompose(brief, intentResult.intent);

  // 4 query plan
  const queryPlan = planner.plan(workflow, brief);

  // 5 retrieval (read-only, optional/bounded) + 6 candidates + 7 adjudication per step
  const perStep = [];
  for (const step of workflow.steps) {
    const primaryQuery = (step.knowledge_queries[0] || {}).query;
    let retrieval = null, sufficiency = null;
    if (doRetrieve && primaryQuery) {
      retrieval = adapter.retrieve(primaryQuery, { top_k: 5 });
      if (options.classify === true) sufficiency = adapter.classify(primaryQuery, retrieval.evidenceText);
    }
    const candidates = registry.getCandidates({ domain: step.domain });
    const adjudication = adjudicator.adjudicate({ brief, step, candidates, evidence: sufficiency });
    const modelPlan = modelRouter.route('SPECIALIST_EXECUTION');
    perStep.push({
      step_id: step.step_id, name: step.name, domain: step.domain,
      primary_query: primaryQuery,
      retrieval: retrieval ? { corpus: retrieval.corpus, pipeline: retrieval.pipeline, evidence_count: retrieval.evidence_count, top_chunk_ids: retrieval.hits.map(h => h.chunk_id), read_only: retrieval.read_only } : null,
      sufficiency: sufficiency ? { decision: sufficiency.decision, cache_status: sufficiency.cache && sufficiency.cache.status } : null,
      candidate_method_ids: candidates.map(c => c.method_id),
      adjudication,
      model_plan: modelPlan,
    });
  }

  // 8 workflow state
  const state = wfState.create({ user_goal: rawRequest, task_brief: brief, workflow });
  for (const ps of perStep) wfState.setSelectedMethod(state, ps.step_id, ps.adjudication);

  return {
    intent: intentResult.intent,
    objective: brief.objective,
    business_type: brief.business_type,
    brief,
    workflow: { workflow_id: workflow.workflow_id, order: workflow.topological_order_names, steps: workflow.steps.map(s => ({ step_id: s.step_id, name: s.name, specialist_type: s.specialist_type, deps: s.dependency_names })) },
    query_plan: { total_queries: queryPlan.total_queries, bounded: queryPlan.bounded, policy: queryPlan.policy },
    per_step: perStep,
    model_plan: modelRouter.planWorkflow(workflow),
    workflow_state_status: state.status,
    specialists_executed: false,
    stopped_before: 'SPECIALIST_EXECUTION',
    _state: state,
  };
}

module.exports = { runRouterCore };
