'use strict';
// Hardened MARKETING_CAMPAIGN_360 (ASTRA-05). Reuses base NODES/DEPS; adds LLM specialists,
// v2 method scorer (non-forced nodes), v2 synthesis, and cost/context tracking. Async.
// mode: 'llm' (LLM-backed) | 'deterministic' (ASTRA-04 thin baseline, for comparison).
// Forced bindings preserved: ads->METHOD_META_ADS, whatsapp_conversion->METHOD_WHATSAPP_SALES.
const base = require('./marketing_campaign_360');
const intentAnalyzer = require('../router/intent_analyzer');
const scorerV2 = require('../router/method_scorer_v2');
const adjudicator = require('../router/method_adjudicator');
const modelRouter = require('../model_router/model_router');
const wfState = require('../state/workflow_state');
const { AgentV1Adapter } = require('../adapter/agent_v1_adapter');
const registryLoader = require('../methods/registry_loader');
const SP = require('../specialists/specialists');
const LLM = require('../specialists/llm_specialists');
const baseSpec = require('../specialists/base_specialist');
const synthV1 = require('../synthesis/synthesis_engine');
const synthV2 = require('../synthesis/synthesis_engine_v2');
const { MAX_EVIDENCE_PER_STEP } = require('../../config/context_budgets');

const SPEC_TYPE = { market_context: 'MARKET_CONTEXT_SPECIALIST', icp: 'ICP_SPECIALIST', offer: 'OFFER_SPECIALIST',
  funnel: 'FUNNEL_SPECIALIST', creative_strategy: 'CREATIVE_STRATEGY_SPECIALIST', ads: 'META_ADS_SPECIALIST',
  whatsapp_conversion: 'WHATSAPP_SALES_SPECIALIST', measurement: 'MEASUREMENT_CRO_SPECIALIST' };
const DET_FN = { market_context: SP.market_context, icp: SP.icp, offer: SP.offer, funnel: SP.funnel,
  creative_strategy: SP.creative_strategy, ads: SP.meta_ads, whatsapp_conversion: SP.whatsapp_sales, measurement: SP.measurement_cro };
const NODE_TIER = { market_context: 'SPECIALIST_EXECUTION', icp: 'SPECIALIST_EXECUTION', offer: 'SPECIALIST_EXECUTION',
  funnel: 'SPECIALIST_EXECUTION', creative_strategy: 'STRATEGIC_SYNTHESIS', ads: 'SPECIALIST_EXECUTION',
  whatsapp_conversion: 'SPECIALIST_EXECUTION', measurement: 'SPECIALIST_EXECUTION' };

function gate(cands) { return cands.filter(m => Array.isArray(m.evidence_refs) && m.evidence_refs.length > 0); }

async function run(rawRequest, options = {}) {
  const mode = options.mode || 'llm';
  const adapter = options.adapter || new AgentV1Adapter(options.adapterOpts || {});
  const registry = registryLoader.load(options.registryPath);
  const doRetrieve = options.retrieve !== false;
  const injectedLLM = options.llm; // for tests (mock)

  const ia = intentAnalyzer.analyze(rawRequest, { salt: options.salt });
  const { intent, brief } = ia;
  const biz = brief.business_type || 'the business';

  const steps = base.NODES.map((n, i) => ({ step_id: n.id, name: n.id, specialist_type: SPEC_TYPE[n.id], dependencies: base.DEPS[n.id], status: 'PLANNED', order_index: i }));
  const workflow = { workflow_id: 'WF_MC360H', intent: 'MARKETING_CAMPAIGN_360', steps };
  const state = wfState.create({ user_goal: rawRequest, task_brief: brief, workflow });

  // Guard (ASTRA-06): incomplete business information -> WAITING_FOR_INPUT (never fabricate business facts).
  // Fires only when BOTH the business is unspecified AND no domain/deliverable signal was detected
  // (a clear deliverable like "digital infoproduct" proceeds even if the business noun is implicit).
  if ((!biz || biz === 'UNSPECIFIED_BUSINESS') && (!ia.matched_intents || ia.matched_intents.length === 0)) {
    wfState.transition(state, 'WAITING_FOR_INPUT');
    return { mode, intent, brief, workflow_id: workflow.workflow_id, workflow_state_status: 'WAITING_FOR_INPUT',
      required_inputs: ['business_type / description', 'objective', 'target customer', 'constraints (budget/geo)'],
      reason: 'incomplete_business_information', node_outputs: [], selected_methods_by_node: {}, synthesis: null,
      cost: { mode, model_calls: 0 }, _state: state };
  }

  wfState.transition(state, 'RUNNING');

  const cost = { mode, model_calls: 0, retries: 0, by_tier: {}, tokens: { prompt: 0, completion: 0 }, evidence_chars_total: 0, per_node: {} };
  const node_outputs = []; const selected_methods_by_node = {}; const done = {};

  for (const n of base.NODES) {
    for (const d of base.DEPS[n.id]) if (!done[d]) { wfState.transition(state, 'BLOCKED'); throw new Error('dependency not satisfied: ' + n.id + ' <- ' + d); }
    const q = n.query.replace('{biz}', biz);
    let evidence = [];
    if (doRetrieve) {
      const r = adapter.retrieve(q, { top_k: 5 });
      evidence = r.hits.map(h => ({ chunk_id: h.chunk_id, source_id: h.source_id, source_pdf_name: h.source_pdf_name, text: h.text, cosine: h.cosine, source_class: 'INTERNAL_KNOWLEDGE' }));
      cost.evidence_chars_total += (r.evidenceText || '').length;
      // Guard (ASTRA-06): evidence-required node with ZERO retrieved evidence -> fail closed (no fake recommendation).
      if (evidence.length === 0) { wfState.transition(state, 'BLOCKED'); throw new Error('missing required evidence for node ' + n.id); }
    }

    // method selection: forced binding OR v2 hardened scorer over evidence-gated candidates
    const gated = gate(registry.getCandidates({ domain: n.domain }));
    let primary, primaryObj, selInfo;
    if (n.forced) {
      primaryObj = registry.byId(n.forced);
      if (!primaryObj || !primaryObj.evidence_refs.length) { wfState.transition(state, 'FAILED'); throw new Error('forced binding unavailable/evidence-poor: ' + n.forced); }
      primary = n.forced; selInfo = { forced: true, state: 'FORCED_BINDING', reasons: ['required evidence-backed binding enforced over scorer'] };
    } else {
      const sel = scorerV2.select({ candidates: gated, domain: n.domain, sub_intent: n.id + ' ' + q, node_query: q, funnel_stage: brief.funnel_stage });
      if (!sel.primary_method) { wfState.transition(state, 'BLOCKED'); throw new Error('no evidence-backed method for node ' + n.id); }
      primary = sel.primary_method; primaryObj = registry.byId(primary); selInfo = { forced: false, state: sel.state, scores: sel.scores, secondary: sel.secondary_methods, reasons: sel.reasons };
    }
    selected_methods_by_node[n.id] = { primary_method: primary, forced: !!n.forced, secondary: selInfo.secondary || [], scorer: n.forced ? 'FORCED' : 'v2' };

    // bounded evidence bundle
    let acc = 0; const bundle = evidence.filter(e => { acc += (e.text || '').length; return acc <= MAX_EVIDENCE_PER_STEP; });
    const input = {
      task_id: brief.task_id, work_unit_id: n.id, specialist_type: SPEC_TYPE[n.id],
      task_brief: { objective: brief.objective, business_type: biz, language: brief.language, constraints: brief.constraints },
      upstream_outputs: base.DEPS[n.id].map(d => ({ work_unit_id: d, downstream_payload: done[d].downstream_payload })),
      selected_methods: { primary_method: primary, primary_method_object: primaryObj, secondary_methods: selInfo.secondary || [] },
      knowledge_evidence: bundle, constraints: brief.constraints || {}, output_requirements: { must_cite: true, max_output_chars: MAX_EVIDENCE_PER_STEP },
    };
    const v = baseSpec.validateInput(input);
    if (!v.valid) { wfState.transition(state, 'FAILED'); throw new Error('specialist input invalid: ' + v.errors.join(';')); }

    // route model tier (record; model ids configurable, single provider resolves to config model)
    const tier = modelRouter.route(NODE_TIER[n.id]);
    cost.by_tier[tier.task_class] = (cost.by_tier[tier.task_class] || 0) + 1;

    let output;
    if (mode === 'llm') {
      const res = await LLM.runLLMSpecialist(input, { llm: injectedLLM, max_tokens: 16000 });
      if (!res.ok) { wfState.transition(state, 'FAILED'); throw new Error('LLM specialist fail-closed at ' + n.id + ': ' + res.error); }
      output = res.output; cost.model_calls += 1; cost.retries += (output.retries || 0);
      if (output.usage) { cost.tokens.prompt += output.usage.prompt || 0; cost.tokens.completion += output.usage.completion || 0; }
    } else {
      output = DET_FN[n.id](input);
    }
    cost.per_node[n.id] = { tier: tier.task_class, evidence_count: bundle.length, generation: output.generation || 'DETERMINISTIC' };
    done[n.id] = output;
    node_outputs.push({ work_unit_id: n.id, method_used: primary, forced: !!n.forced, output, evidence_chunk_ids: bundle.map(e => e.chunk_id), evidence_count: bundle.length });
    wfState.setSelectedMethod(state, n.id, selected_methods_by_node[n.id]);
  }

  // synthesis (HIGH_REASONING tier recorded; deterministic reconciliation engine, no extra LLM call in slice)
  const synthTier = modelRouter.route('STRATEGIC_SYNTHESIS'); cost.by_tier[synthTier.task_class] = (cost.by_tier[synthTier.task_class] || 0) + 1;
  const synthesis = (mode === 'llm' ? synthV2 : synthV1).synthesize({ brief, node_outputs, selected_methods_by_node });
  if (!synthesis.coherent) { wfState.transition(state, 'BLOCKED'); throw new Error('synthesis incomplete: missing ' + synthesis.missing_sections.join(',')); }

  wfState.transition(state, 'COMPLETE');
  return {
    mode, intent, brief, workflow_id: workflow.workflow_id, node_order: base.NODES.map(n => n.id).concat(['final_synthesis']),
    mandatory_nodes_executed: node_outputs.length + 1, mandatory_node_count: 9,
    bindings: { ads: selected_methods_by_node.ads.primary_method, whatsapp_conversion: selected_methods_by_node.whatsapp_conversion.primary_method },
    node_outputs, selected_methods_by_node, synthesis, cost, workflow_state_status: state.status, _state: state,
  };
}

module.exports = { run, SPEC_TYPE, DET_FN };
