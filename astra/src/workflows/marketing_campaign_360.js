'use strict';
// MARKETING_CAMPAIGN_360 — first end-to-end ASTRA vertical slice.
// intent -> brief -> DAG -> per-node targeted retrieval -> method adjudication (forced bindings for
// ads/whatsapp) -> thin specialist execution -> synthesis -> workflow state PLANNED->RUNNING->COMPLETE.
// Read-only Agent V1 (Strategy-F). No LLM generation. Fail-closed on missing evidence/binding/deps.
const intentAnalyzer = require('../router/intent_analyzer');
const planner = require('../router/knowledge_query_planner');
const adjudicator = require('../router/method_adjudicator');
const modelRouter = require('../model_router/model_router');
const wfState = require('../state/workflow_state');
const { AgentV1Adapter } = require('../adapter/agent_v1_adapter');
const registryLoader = require('../methods/registry_loader');
const SP = require('../specialists/specialists');
const baseSpec = require('../specialists/base_specialist');
const synth = require('../synthesis/synthesis_engine');
const { MAX_EVIDENCE_PER_STEP } = require('../../config/context_budgets');

// Canonical node order + domain + forced method + specialist fn + node retrieval query.
const NODES = [
  { id: 'market_context', domain: 'RESEARCH', forced: null, fn: SP.market_context, query: 'market context positioning and growth strategy for {biz}' },
  { id: 'icp', domain: 'ICP', forced: null, fn: SP.icp, query: 'ideal customer profile target audience pains and desires for {biz}' },
  { id: 'offer', domain: 'OFFER', forced: null, fn: SP.offer, query: 'offer design value proposition and guarantee for {biz}' },
  { id: 'funnel', domain: 'FUNNEL', forced: null, fn: SP.funnel, query: 'funnel design and lead conversion path for {biz}' },
  { id: 'creative_strategy', domain: 'CREATIVE', forced: null, fn: SP.creative_strategy, query: 'creative strategy single-minded proposition and ad angles' },
  { id: 'ads', domain: 'ADS', forced: 'METHOD_META_ADS', fn: SP.meta_ads, query: 'meta ads campaign strategy objectives and acquisition economics' },
  { id: 'whatsapp_conversion', domain: 'SALES', forced: 'METHOD_WHATSAPP_SALES', fn: SP.whatsapp_sales, query: 'whatsapp sales qualification appointment and objection handling' },
  { id: 'measurement', domain: 'CRO', forced: null, fn: SP.measurement_cro, query: 'conversion measurement KPIs and optimization for {biz}' },
];
const DEPS = { market_context: [], icp: ['market_context'], offer: ['icp'], funnel: ['offer', 'icp'],
  creative_strategy: ['icp', 'offer'], ads: ['offer', 'funnel', 'creative_strategy'],
  whatsapp_conversion: ['funnel'], measurement: ['funnel', 'ads', 'whatsapp_conversion'] };

function gate(cands) { return cands.filter(m => Array.isArray(m.evidence_refs) && m.evidence_refs.length > 0); }

function run(rawRequest, options = {}) {
  const adapter = options.adapter || new AgentV1Adapter(options.adapterOpts || {});
  const registry = registryLoader.load(options.registryPath);
  const doRetrieve = options.retrieve !== false; // live Strategy-F by default

  // intent + brief
  const { intent, brief } = intentAnalyzer.analyze(rawRequest, { salt: options.salt });
  const biz = brief.business_type || 'the business';

  // workflow + state
  const steps = NODES.map((n, i) => ({ step_id: n.id, name: n.id, specialist_type: n.fn.name, dependencies: DEPS[n.id], status: 'PLANNED', order_index: i }));
  const workflow = { workflow_id: 'WF_MC360', intent: 'MARKETING_CAMPAIGN_360', steps };
  const state = wfState.create({ user_goal: rawRequest, task_brief: brief, workflow });

  // dependency validation (fail closed on unknown dep)
  const ids = new Set(NODES.map(n => n.id));
  for (const n of NODES) for (const d of DEPS[n.id]) if (!ids.has(d)) { wfState.transition(state, 'FAILED'); throw new Error('unknown dependency ' + d); }

  wfState.transition(state, 'RUNNING');
  const cost = { model_calls: 0, llm_calls: 0, by_tier: {}, evidence_chars_total: 0 };
  const node_outputs = [];
  const selected_methods_by_node = {};
  const done = {};

  for (const n of NODES) {
    // deps satisfied?
    for (const d of DEPS[n.id]) if (!done[d]) { wfState.transition(state, 'BLOCKED'); throw new Error('dependency not satisfied: ' + n.id + ' <- ' + d); }

    // targeted retrieval (READ_MINIMUM_NECESSARY_CONTEXT)
    const q = n.query.replace('{biz}', biz);
    let evidence = [];
    if (doRetrieve) {
      const r = adapter.retrieve(q, { top_k: 5 });
      evidence = r.hits.map(h => ({ chunk_id: h.chunk_id, source_id: h.source_id, source_pdf_name: h.source_pdf_name, text: h.text, cosine: h.cosine, source_class: 'INTERNAL_KNOWLEDGE' }));
      cost.evidence_chars_total += (r.evidenceText || '').length;
    }

    // method selection: forced binding OR evidence-gated adjudication
    const domainCands = registry.getCandidates({ domain: n.domain });
    const gated = gate(domainCands);
    let adjudication, primary, primaryObj;
    if (n.forced) {
      primaryObj = registry.byId(n.forced);
      if (!primaryObj || !primaryObj.evidence_refs.length) { wfState.transition(state, 'FAILED'); throw new Error('forced binding unavailable/evidence-poor: ' + n.forced); }
      primary = n.forced;
      adjudication = { primary_method: primary, secondary_methods: gated.filter(m => m.method_id !== primary).map(m => m.method_id), state: 'FORCED_BINDING', forced: true, selection_reasons: ['required evidence-backed binding enforced over coarse same-domain scorer'] };
    } else {
      const tier = modelRouter.route('METHOD_ADJUDICATION');
      cost.by_tier[tier.task_class] = (cost.by_tier[tier.task_class] || 0) + 1;
      adjudication = adjudicator.adjudicate({ brief, step: { step_id: n.id, domain: n.domain }, candidates: gated, evidence: gated.length ? { decision: 'PARTIAL' } : { decision: 'INSUFFICIENT' } });
      primary = adjudication.primary_method;
      if (!primary) { wfState.transition(state, 'BLOCKED'); throw new Error('no evidence-backed method for node ' + n.id); }
      primaryObj = registry.byId(primary);
    }
    selected_methods_by_node[n.id] = { primary_method: primary, forced: !!n.forced, secondary: adjudication.secondary_methods || [] };

    // build SPECIALIST_INPUT (only this node's bundle + relevant upstream)
    let bundle = evidence;
    // context budget guard
    let acc = 0; bundle = bundle.filter(e => { acc += (e.text || '').length; return acc <= MAX_EVIDENCE_PER_STEP; });
    const input = {
      task_id: brief.task_id, work_unit_id: n.id, specialist_type: n.fn.name,
      task_brief: { objective: brief.objective, business_type: biz, language: brief.language, constraints: brief.constraints },
      upstream_outputs: DEPS[n.id].map(d => ({ work_unit_id: d, downstream_payload: done[d].downstream_payload })),
      selected_methods: { primary_method: primary, primary_method_object: primaryObj, secondary_methods: adjudication.secondary_methods || [] },
      knowledge_evidence: bundle, constraints: brief.constraints || {},
      output_requirements: { must_cite: true, max_output_chars: MAX_EVIDENCE_PER_STEP },
    };
    const v = baseSpec.validateInput(input);
    if (!v.valid) { wfState.transition(state, 'FAILED'); throw new Error('specialist input invalid: ' + v.errors.join(';')); }

    // execute thin specialist (deterministic; model tier recorded, 0 LLM calls)
    const specTier = modelRouter.route('SPECIALIST_EXECUTION');
    cost.by_tier[specTier.task_class] = (cost.by_tier[specTier.task_class] || 0) + 1;
    const output = n.fn(input);
    done[n.id] = output;
    node_outputs.push({ work_unit_id: n.id, method_used: primary, forced: !!n.forced, output, evidence_chunk_ids: bundle.map(e => e.chunk_id), evidence_count: bundle.length });
    wfState.setSelectedMethod(state, n.id, selected_methods_by_node[n.id]);
  }

  // synthesis (final_synthesis node)
  const synthesis = synth.synthesize({ brief, node_outputs, selected_methods_by_node });
  if (!synthesis.coherent) { wfState.transition(state, 'BLOCKED'); throw new Error('synthesis incomplete: missing ' + synthesis.missing_sections.join(',')); }

  wfState.transition(state, 'COMPLETE');
  return {
    intent, brief, workflow_id: workflow.workflow_id, node_order: NODES.map(n => n.id).concat(['final_synthesis']),
    mandatory_nodes_executed: node_outputs.length + 1, mandatory_node_count: 9,
    bindings: { ads: selected_methods_by_node.ads.primary_method, whatsapp_conversion: selected_methods_by_node.whatsapp_conversion.primary_method },
    node_outputs, selected_methods_by_node, synthesis, cost,
    workflow_state_status: state.status, specialists_executed: node_outputs.map(n => n.output.specialist_type),
    _state: state,
  };
}

module.exports = { run, NODES, DEPS };
