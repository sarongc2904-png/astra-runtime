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
const diag = require('../integration/diag'); // [ASTRA-DIAG] temporary instrumentation (ASTRA-10S)
const briefFacts = require('./campaign_brief_facts'); // [Brief Fidelity] CANONICAL_BRIEF_FACTS
const fidelity = require('./brief_fidelity_validator'); // [Brief Fidelity] node + final validators
const fidelityGuard = require('./fidelity_false_positive_guard'); // narrow live false-positive adjudication
const llmExec = require('../llm/llm_executor'); // [Final Synthesis Repair] bounded regeneration only
const synthesisMetaGuard = require('./synthesis_meta_guard'); // prune unsafe meta-only synthesis items
const adsFidelityNormalizer = require('./ads_fidelity_normalizer'); // deterministic META_ADS provenance/objective normalization
const marketContextFidelityNormalizer = require('./market_context_fidelity_normalizer'); // restore explicit brief problem context
const fidelityHypothesisPolicy = require('./fidelity_hypothesis_policy'); // non-blocking ambiguity/provenance policy

// [Final Synthesis Repair — bounded regeneration] Deterministic repair (fidelity.repairFinalSynthesis)
// is always tried FIRST and resolves every currently-known repairable case on its own (its
// replacement text is grounded-by-construction, so it can never re-trigger the same check) — this
// LLM fallback exists only for a repairable-class violation deterministic repair cannot safely
// resolve, per the authorized architecture: LLM proposes -> deterministic runtime validates/accepts/
// rejects, never the reverse. Exactly ONE attempt; never reruns specialists/retrieval; produces
// ONLY a final_synthesis patch (a map of "sectionKey.subKey" -> new text, plus an optional
// "14_assumptions" replacement array) — deterministic revalidation after it is what actually
// decides COMPLETE vs FAILED, never the model's own say-so.
const MAX_FINAL_SYNTHESIS_REGENERATION_ATTEMPTS = 1;
async function regenerateFinalSynthesis(canonicalBriefFacts, synthesis, violations, opts = {}) {
  const system = [
    'You repair ONLY the specific violating fields of an already-generated Campaign360 final synthesis. You do not invent new fields or new facts.',
    `CANONICAL_BRIEF_FACTS (immutable — never contradict): ${JSON.stringify(canonicalBriefFacts)}`,
    'SEMANTIC ROLE RULES (mandatory):',
    '- BUSINESS_OBJECTIVE / CAMPAIGN_CONVERSION fields must reflect what THIS campaign actually sells/converts (per business_objective and any explicit user-provided conversion), never a step of PRODUCT_MECHANISM/MECHANISM_OUTCOME (what the product teaches) unless business_objective itself authorizes it.',
    '- Preserve legitimate intermediate process steps; only replace the non-conforming ENDPOINT/claim.',
    '- Never fabricate a fact as USER_PROVIDED — an unsupported attribution must be removed or degraded to UNKNOWN/ASSUMPTION; a false denial of a known fact must not be repeated.',
    '- PROPUESTA labeling is preserved verbatim where already present; never remove it, never use it to justify a violation.',
    '- Never introduce testimonials, guarantees, invented metrics, or invented evidence.',
    'Return STRICT JSON only: { "fixed_fields": { "<sectionKey>.<subKey>": "<new text>", ... }, "assumptions": ["<full replacement 14_assumptions array>"] (omit if unchanged) }. Only include keys for fields that actually needed to change.',
  ].join('\n');
  const user = [
    `CURRENT_FINAL_SYNTHESIS_DELIVERABLE: ${JSON.stringify(synthesis.deliverable)}`,
    `VIOLATIONS_TO_FIX: ${JSON.stringify(violations)}`,
  ].join('\n\n');
  const schema = { required: ['fixed_fields'] };
  const res = await llmExec.execute({ system, user, schema, model: opts.model, max_tokens: opts.max_tokens || 2000, llm: opts.llm });
  if (!res.ok) return { ok: false, error: res.error, usage: res.usage };
  const repaired = JSON.parse(JSON.stringify(synthesis));
  const fixedFields = (res.value && res.value.fixed_fields) || {};
  for (const [pathKey, newValue] of Object.entries(fixedFields)) {
    if (typeof newValue !== 'string') continue;
    const dot = pathKey.indexOf('.');
    if (dot === -1) continue;
    const sectionKey = pathKey.slice(0, dot); const subKey = pathKey.slice(dot + 1);
    if (repaired.deliverable[sectionKey] && typeof repaired.deliverable[sectionKey] === 'object') repaired.deliverable[sectionKey][subKey] = newValue;
  }
  if (Array.isArray(res.value && res.value.assumptions)) repaired.deliverable['14_assumptions'] = res.value.assumptions.filter(x => typeof x === 'string');
  return { ok: true, synthesis: repaired, usage: res.usage, retries: res.retries };
}

const SPEC_TYPE = { market_context: 'MARKET_CONTEXT_SPECIALIST', icp: 'ICP_SPECIALIST', offer: 'OFFER_SPECIALIST',
  funnel: 'FUNNEL_SPECIALIST', creative_strategy: 'CREATIVE_STRATEGY_SPECIALIST', ads: 'META_ADS_SPECIALIST',
  whatsapp_conversion: 'WHATSAPP_SALES_SPECIALIST', measurement: 'MEASUREMENT_CRO_SPECIALIST' };
const DET_FN = { market_context: SP.market_context, icp: SP.icp, offer: SP.offer, funnel: SP.funnel,
  creative_strategy: SP.creative_strategy, ads: SP.meta_ads, whatsapp_conversion: SP.whatsapp_sales, measurement: SP.measurement_cro };
const NODE_TIER = { market_context: 'SPECIALIST_EXECUTION', icp: 'SPECIALIST_EXECUTION', offer: 'SPECIALIST_EXECUTION',
  funnel: 'SPECIALIST_EXECUTION', creative_strategy: 'STRATEGIC_SYNTHESIS', ads: 'SPECIALIST_EXECUTION',
  whatsapp_conversion: 'SPECIALIST_EXECUTION', measurement: 'SPECIALIST_EXECUTION' };

function gate(cands) { return cands.filter(m => Array.isArray(m.evidence_refs) && m.evidence_refs.length > 0); }

// [ASTRA-10X] Topological layering (Kahn's algorithm, grouped by level) of base.NODES/base.DEPS.
// Computed once from the static DAG — does not depend on the request. Nodes within one wave have
// no dependency on each other (verified structurally from DEPS) and may execute concurrently;
// a wave only starts after every wave before it has fully completed, so a node's DEPS are always
// satisfied before it runs. This does not change DEPS or NODES (imported unmodified from
// ./marketing_campaign_360, still used as-is by the non-hardened base workflow).
function computeWaves(nodes, deps) {
  const remaining = new Set(nodes.map(n => n.id));
  const satisfied = new Set();
  const byId = new Map(nodes.map(n => [n.id, n]));
  const waves = [];
  while (remaining.size) {
    const wave = [];
    for (const id of remaining) if (deps[id].every(d => satisfied.has(d))) wave.push(id);
    if (!wave.length) throw new Error('ASTRA-10X: cyclic or unsatisfiable DAG in campaign-360 NODES/DEPS');
    for (const id of wave) { remaining.delete(id); satisfied.add(id); }
    waves.push(wave.map(id => byId.get(id)));
  }
  return waves;
}
const WAVES = computeWaves(base.NODES, base.DEPS);

// [ASTRA-10X] Execute exactly one node: retrieval + method selection + specialist/LLM execution.
// Never touches shared mutable state (cost, node_outputs, done, wfState) — returns everything the
// caller needs so aggregation can happen strictly synchronously, once the whole wave has settled.
// On any failure, throws an Error carrying `.wfTransition` ('BLOCKED' | 'FAILED') so the wave-level
// catch (the only place inside run() allowed to call wfState.transition on a node failure) can apply
// the correct, single transition — this is what prevents two concurrent failures in the same wave
// from both calling wfState.transition and hitting workflow_state.js's terminal-state guard.
async function processNode(n, ctx) {
  const { done, adapter, doRetrieve, registry, brief, biz, mode, injectedLLM, diagId, canonicalBriefFacts } = ctx;
  for (const d of base.DEPS[n.id]) {
    if (!done[d]) { const e = new Error('dependency not satisfied: ' + n.id + ' <- ' + d); e.wfTransition = 'BLOCKED'; throw e; }
  }
  const q = n.query.replace('{biz}', biz);
  let evidence = []; let evidenceChars = 0;
  if (doRetrieve) {
    diag.mark(diagId, 'BEFORE_RETRIEVAL', { node: n.id });
    // Prefer the non-blocking path (candidate H) when the injected/real adapter offers it; fall back
    // to the synchronous retrieve() unchanged for any adapter (e.g. test mocks) that does not.
    const retrievalOptions = { top_k: 5, campaign360_node_id: n.id, specialist_type: SPEC_TYPE[n.id] };
    const r = adapter.retrieveAsync ? await adapter.retrieveAsync(q, retrievalOptions) : adapter.retrieve(q, retrievalOptions);
    diag.mark(diagId, 'AFTER_RETRIEVAL', { node: n.id, hits: (r.hits || []).length });
    evidence = r.hits.map(h => ({ chunk_id: h.chunk_id, source_id: h.source_id, source_pdf_name: h.source_pdf_name, text: h.text, cosine: h.cosine, source_class: h.source_class || (/^WEB_\d+$/i.test(String(h.chunk_id || '')) ? 'EXTERNAL_RESEARCH' : 'INTERNAL_KNOWLEDGE') }));
    evidenceChars = (r.evidenceText || '').length;
    if (evidence.length === 0) { const e = new Error('missing required evidence for node ' + n.id); e.wfTransition = 'BLOCKED'; throw e; }
  }

  const gated = gate(registry.getCandidates({ domain: n.domain }));
  let primary, primaryObj, selInfo;
  if (n.forced) {
    primaryObj = registry.byId(n.forced);
    if (!primaryObj || !primaryObj.evidence_refs.length) { const e = new Error('forced binding unavailable/evidence-poor: ' + n.forced); e.wfTransition = 'FAILED'; throw e; }
    primary = n.forced; selInfo = { forced: true, state: 'FORCED_BINDING', reasons: ['required evidence-backed binding enforced over scorer'] };
  } else {
    const sel = scorerV2.select({ candidates: gated, domain: n.domain, sub_intent: n.id + ' ' + q, node_query: q, funnel_stage: brief.funnel_stage });
    if (!sel.primary_method) { const e = new Error('no evidence-backed method for node ' + n.id); e.wfTransition = 'BLOCKED'; throw e; }
    primary = sel.primary_method; primaryObj = registry.byId(primary); selInfo = { forced: false, state: sel.state, scores: sel.scores, secondary: sel.secondary_methods, reasons: sel.reasons };
  }

  let acc = 0; const bundle = evidence.filter(e => { acc += (e.text || '').length; return acc <= MAX_EVIDENCE_PER_STEP; });
  // [Brief Fidelity — Node Input Contract] every node receives canonical_brief_facts alongside
  // upstream outputs + evidence. canonicalBriefFacts is frozen and never derived from a node's
  // own (or a prior node's) output — upstream_outputs never outranks a USER_PROVIDED_FACT.
  const input = {
    task_id: brief.task_id, work_unit_id: n.id, specialist_type: SPEC_TYPE[n.id],
    task_brief: { objective: brief.objective, business_type: biz, language: brief.language, constraints: brief.constraints },
    canonical_brief_facts: canonicalBriefFacts,
    upstream_outputs: base.DEPS[n.id].map(d => ({ work_unit_id: d, downstream_payload: done[d].downstream_payload })),
    selected_methods: { primary_method: primary, primary_method_object: primaryObj, secondary_methods: selInfo.secondary || [] },
    knowledge_evidence: bundle, constraints: brief.constraints || {}, output_requirements: { must_cite: true, max_output_chars: MAX_EVIDENCE_PER_STEP },
  };
  const v = baseSpec.validateInput(input);
  if (!v.valid) { const e = new Error('specialist input invalid: ' + v.errors.join(';')); e.wfTransition = 'FAILED'; throw e; }

  const tier = modelRouter.route(NODE_TIER[n.id]);

  let output; let llmUsage = null;
  if (mode === 'llm') {
    diag.mark(diagId, 'BEFORE_LLM', { node: n.id });
    const res = await LLM.runLLMSpecialist(input, { llm: injectedLLM, max_tokens: 16000 });
    // [ASTRA-10AB] Extended AFTER_LLM: per-node telemetry only (tokens/finish_reason/attempts/
    // retries/timing). Never includes prompts, responses, RAG evidence, business data, headers,
    // or secrets — tel.* fields are null when the provider does not expose them (never invented).
    // runLLMSpecialist() nests these under `.output` on success but at the top level on failure —
    // normalize the read location here rather than changing either branch's existing shape.
    const tel = res.ok ? (res.output || {}) : res;
    const ud = tel.usage_detail || {};
    diag.mark(diagId, 'AFTER_LLM', {
      node: n.id, ok: !!res.ok, llm_elapsed_ms: tel.llm_elapsed_ms != null ? Math.round(tel.llm_elapsed_ms) : null,
      prompt_tokens: ud.prompt_tokens != null ? ud.prompt_tokens : null,
      completion_tokens: ud.completion_tokens != null ? ud.completion_tokens : null,
      total_tokens: ud.total_tokens != null ? ud.total_tokens : null,
      reasoning_tokens: ud.reasoning_tokens != null ? ud.reasoning_tokens : null,
      cached_tokens: ud.cached_tokens != null ? ud.cached_tokens : null,
      finish_reason: tel.finish_reason != null ? tel.finish_reason : null,
      attempts: tel.attempts != null ? tel.attempts : null,
      retries: tel.retries != null ? tel.retries : null,
    });
    if (!res.ok) { const e = new Error('LLM specialist fail-closed at ' + n.id + ': ' + res.error); e.wfTransition = 'FAILED'; throw e; }
    output = res.output;
    llmUsage = { retries: output.retries || 0, prompt: (output.usage && output.usage.prompt) || 0, completion: (output.usage && output.usage.completion) || 0 };
  } else {
    output = DET_FN[n.id](input);
  }

  let proposalStatusRepairs = [];
  let fidelityHypotheses = [];

  // MARKET_CONTEXT must describe the explicit problem from the brief when one exists.
  // It must not paraphrase the business objective into problem_context, because result-oriented
  // objective language can become a false invented-result claim in a field with different semantics.
  if (n.id === 'market_context') {
    const normalizedMarket = marketContextFidelityNormalizer.normalizeMarketContextOutput(output, canonicalBriefFacts);
    output = normalizedMarket.output;
    proposalStatusRepairs.push(...normalizedMarket.repairs.map(repair => ({ node: n.id, ...repair })));
  }

  // META_ADS has two schema-level invariants that should not depend on model wording:
  // 1) campaign_objective mirrors the immutable user-provided business objective exactly;
  // 2) newly designed Ads tactics are explicitly PROPUESTA per the provenance contract.
  // This normalization runs BEFORE fidelity validation and never suppresses a validator result.
  if (n.id === 'ads') {
    const normalizedAds = adsFidelityNormalizer.normalizeAdsOutput(output, canonicalBriefFacts);
    output = normalizedAds.output;
    proposalStatusRepairs.push(...normalizedAds.repairs.map(repair => ({ node: n.id, ...repair })));
  }

  // [Node Fidelity Validator] a node output that contradicts a USER_PROVIDED_FACT never
  // continues silently — fail-closed. The only repair allowed here preserves proposal status by
  // adding a marker to the exact clauses found by the same deterministic provenance detector.
  //
  // [Repair-gate fix — confirmed live defect, job 8a8644f2-7e6e-47ae-bc04-a27562eb9d9e] this used
  // to require EVERY violation on the node to be UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION before
  // even ATTEMPTING repair — so a node whose violations were a genuine MIX of that type plus a
  // plain UNLABELED_PROPOSAL (a brand-new tactical detail invented in this node, not propagated
  // from anywhere upstream) skipped repair entirely and failed closed with the raw, unrepaired
  // violation list — even for the propagation violations that repairUpstreamProposalStatus could
  // already fix cleanly on their own. repairUpstreamProposalStatus now also repairs plain
  // UNLABELED_PROPOSAL (new tactical additions with no upstream anchor at all — see its own
  // [NEW TACTICAL ADDITION REPAIR] comment), so both repairable types gate attempt-to-repair
  // together; any OTHER violation type (EXPLICIT_PROHIBITION, *_SUBSTITUTION, KNOWN_FACT_DENIAL,
  // UNKNOWN_FACT_FABRICATION, ...) still skips repair and fails closed immediately, unchanged.
  const REPAIRABLE_VIOLATION_TYPES = new Set(['UNLABELED_UPSTREAM_PROPOSAL_PROPAGATION', 'UNLABELED_PROPOSAL']);
  if (canonicalBriefFacts) {
    let { violations } = fidelity.validateOutputAgainstFacts(canonicalBriefFacts, output, { nodeId: n.id, upstream_outputs: input.upstream_outputs });
    violations = fidelityGuard.adjudicateNodeViolations(n.id, violations, canonicalBriefFacts).violations;
    if (violations.length && violations.every(v => REPAIRABLE_VIOLATION_TYPES.has(v.type))) {
      const repaired = fidelity.repairUpstreamProposalStatus(canonicalBriefFacts, output, input.upstream_outputs);
      proposalStatusRepairs = repaired.repairs.map(repair => ({ node: n.id, ...repair }));
      const secondValidation = fidelity.validateOutputAgainstFacts(canonicalBriefFacts, repaired.output, { nodeId: n.id, upstream_outputs: input.upstream_outputs });
      output = repaired.output;
      violations = fidelityGuard.adjudicateNodeViolations(n.id, secondValidation.violations, canonicalBriefFacts).violations;
    }
    if (violations.length) {
      const classified = fidelityHypothesisPolicy.classify(violations, n.id);
      fidelityHypotheses.push(...classified.hypotheses);
      violations = classified.hard;
    }
    if (violations.length) {
      const e = new Error('BRIEF_FIDELITY_VIOLATION at node ' + n.id + ': ' + violations.map(v => v.type).join(', '));
      e.wfTransition = 'FAILED'; e.code = 'BRIEF_FIDELITY_VIOLATION'; e.briefFidelityViolations = violations;
      e.proposalStatusRepairs = proposalStatusRepairs;
      // [FAILED-NODE USAGE ACCOUNTING] the LLM call above already happened and already cost real
      // provider tokens — a node's OUTPUT failing post-generation fidelity validation must never
      // make that consumption vanish from cost accounting. Carry it on the error itself (never in
      // node_outputs/selected_methods_by_node — this node's output still never counts as COMPLETE)
      // so the wave-level catch in run() can still aggregate it.
      e.nodeUsage = { tier, evidenceChars, llmUsage, bundle };
      throw e;
    }
  }

  return {
    node: n, output, primary, forced: !!n.forced, selInfo, bundle, tier, evidenceChars, llmUsage, proposalStatusRepairs, fidelityHypotheses,
    selectedMethod: { primary_method: primary, forced: !!n.forced, secondary: selInfo.secondary || [], scorer: n.forced ? 'FORCED' : 'v2' },
  };
}

async function run(rawRequest, options = {}) {
  const diagId = diag.newId(); // [ASTRA-DIAG] local to this run(); correlate via adjacent timestamps
  const emitProgress = payload => {
    try { if (typeof options.onProgress === 'function') options.onProgress(payload); } catch (_) {}
  };
  const mode = options.mode || 'llm';
  const adapter = options.adapter || new AgentV1Adapter(options.adapterOpts || {});
  const registry = registryLoader.load(options.registryPath);
  const doRetrieve = options.retrieve !== false;
  const injectedLLM = options.llm; // for tests (mock)

  const ia = intentAnalyzer.analyze(rawRequest, { salt: options.salt });
  const { intent } = ia;

  // [Brief Fidelity] CANONICAL_BRIEF_FACTS — extracted directly from rawRequest, independent of
  // intent_analyzer's heuristic business_type/objective classification. Frozen once, never
  // mutated, never re-derived from a node's output. This is the ground truth every node output
  // and the final synthesis are validated against.
  const canonicalBriefFacts = briefFacts.extract(rawRequest);

  // [Immutable Fact Lock] intent_analyzer's `objective` is a keyword-matched ROUTING signal
  // (e.g. it collapses to CLIENT_ACQUISITION whenever several intents match at once) — it is not
  // itself a business fact. A USER_PROVIDED_FACT business_objective always overrides it for
  // everything downstream (task_brief on every node, and the final synthesis): the confirmed
  // defect was exactly this heuristic objective silently replacing an explicit "vender el
  // minicurso" with CLIENT_ACQUISITION. intent_analyzer.js itself is untouched — this only
  // decides which value the rest of the pipeline is allowed to see.
  const brief = canonicalBriefFacts.business_objective.status === 'USER_PROVIDED_FACT'
    ? Object.freeze({ ...ia.brief, objective: canonicalBriefFacts.business_objective.value })
    : ia.brief;
  const biz = brief.business_type || 'the business';

  const steps = base.NODES.map((n, i) => ({ step_id: n.id, name: n.id, specialist_type: SPEC_TYPE[n.id], dependencies: base.DEPS[n.id], status: 'PLANNED', order_index: i }));
  const workflow = { workflow_id: 'WF_MC360H', intent: 'MARKETING_CAMPAIGN_360', steps };
  const state = wfState.create({ user_goal: rawRequest, task_brief: brief, workflow });

  // [Brief Authority Conflict Gate] Two incompatible explicit user facts must never be silently
  // reconciled, downgraded to UNKNOWN, or resolved by research/LLM inference. Stop before any
  // retrieval/model spend and return the exact conflicting field/evidence for clarification.
  const internalConflicts = Object.entries(canonicalBriefFacts)
    .filter(([, value]) => value && typeof value === 'object' && value.status === 'CONFLICTO_INTERNO')
    .map(([field, value]) => ({
      field,
      status: 'CONFLICTO_INTERNO',
      candidates: value.candidates || [],
      evidence: value.evidence || [],
      recommendation: value.recommendation || 'Solicitar aclaración; no elegir un valor final automáticamente.',
    }));
  if (internalConflicts.length) {
    wfState.transition(state, 'WAITING_FOR_INPUT');
    return {
      mode, intent, brief, canonical_brief_facts: canonicalBriefFacts, workflow_id: workflow.workflow_id,
      workflow_state_status: 'WAITING_FOR_INPUT',
      reason: 'BRIEF_INTERNAL_CONFLICT',
      brief_internal_conflicts: internalConflicts,
      required_inputs: internalConflicts.map(x => x.field),
      node_outputs: [], selected_methods_by_node: {}, synthesis: null,
      cost: { mode, model_calls: 0, retries: 0, tokens: { prompt: 0, completion: 0 } },
      _state: state,
    };
  }

  // Guard (ASTRA-06): incomplete business information -> WAITING_FOR_INPUT (never fabricate business facts).
  // Fires only when BOTH the business is unspecified AND no domain/deliverable signal was detected
  // (a clear deliverable like "digital infoproduct" proceeds even if the business noun is implicit).
  if ((!biz || biz === 'UNSPECIFIED_BUSINESS') && (!ia.matched_intents || ia.matched_intents.length === 0)) {
    wfState.transition(state, 'WAITING_FOR_INPUT');
    return { mode, intent, brief, canonical_brief_facts: canonicalBriefFacts, workflow_id: workflow.workflow_id, workflow_state_status: 'WAITING_FOR_INPUT',
      required_inputs: ['business_type / description', 'objective', 'target customer', 'constraints (budget/geo)'],
      reason: 'incomplete_business_information', node_outputs: [], selected_methods_by_node: {}, synthesis: null,
      cost: { mode, model_calls: 0 }, _state: state };
  }

  wfState.transition(state, 'RUNNING');
  emitProgress({ phase: 'NODE_EXECUTION', current_node: null, active_nodes: [], completed_nodes: [] });

  const cost = { mode, model_calls: 0, retries: 0, by_tier: {}, tokens: { prompt: 0, completion: 0 }, evidence_chars_total: 0, per_node: {} };
  const node_outputs = []; const selected_methods_by_node = {}; const done = {}; const proposal_status_repairs = []; const fidelity_hypotheses = [];
  const nodeCtx = { done, adapter, doRetrieve, registry, brief, biz, mode, injectedLLM, diagId, canonicalBriefFacts };

  // [ASTRA-10X] Execute by topological wave: nodes within a wave run concurrently (Promise.all);
  // a wave only starts once every prior wave fully completed, so DEPS are always satisfied.
  // ALL mutation of shared state (cost, node_outputs, done, selected_methods_by_node, wfState)
  // happens strictly synchronously, after `await Promise.all(...)` settles for the whole wave —
  // never inside the concurrently-running node promises themselves. Aggregation iterates
  // base.NODES (the canonical fixed order), not the wave's own array or completion order, so
  // node_outputs is always emitted in the exact original order regardless of which node in the
  // wave actually finished first.
  for (const wave of WAVES) {
    const waveIds = new Set(wave.map(n => n.id));
    emitProgress({
      phase: 'NODE_EXECUTION',
      current_node: wave.length === 1 ? wave[0].id : null,
      active_nodes: wave.map(n => n.id),
      completed_nodes: node_outputs.map(x => x.work_unit_id),
    });
    // [FAILED-NODE USAGE ACCOUNTING] Promise.allSettled (not Promise.all) so a node-level
    // BRIEF_FIDELITY_VIOLATION in this wave never causes a sibling's ALREADY-INCURRED real LLM
    // call to silently vanish from `cost` — every settled promise (fulfilled or rejected) is
    // inspected before any pass/fail decision is made. A rejected node's OUTPUT still never
    // becomes COMPLETE and is still never added to node_outputs/selected_methods_by_node/done
    // (unchanged from before); only its (already-spent) usage is preserved.
    const results = await Promise.allSettled(wave.map(n => processNode(n, nodeCtx)));
    let firstFidelityError = null;
    let firstOtherError = null;
    for (let i = 0; i < wave.length; i++) {
      const res = results[i];
      if (res.status === 'fulfilled') continue;
      if (res.reason && res.reason.code === 'BRIEF_FIDELITY_VIOLATION') {
        if (!firstFidelityError) firstFidelityError = res.reason;
        const u = res.reason.nodeUsage;
        if (u) {
          cost.evidence_chars_total += u.evidenceChars || 0;
          if (u.tier) cost.by_tier[u.tier.task_class] = (cost.by_tier[u.tier.task_class] || 0) + 1;
          if (u.llmUsage) {
            cost.model_calls += 1; cost.retries += u.llmUsage.retries;
            cost.tokens.prompt += u.llmUsage.prompt; cost.tokens.completion += u.llmUsage.completion;
          }
          cost.per_node[wave[i].id] = {
            tier: u.tier ? u.tier.task_class : undefined,
            evidence_count: u.bundle ? u.bundle.length : undefined,
            validation_failed: true,
          };
        }
      } else if (!firstOtherError) {
        firstOtherError = res.reason;
      }
    }
    if (firstOtherError) {
      // Any other error (technical/provider/infra/schema failure) keeps the exact prior
      // behavior — never silently reclassified as a domain failure, never given the structured
      // FAILED shape below.
      wfState.transition(state, firstOtherError.wfTransition || 'FAILED');
      throw firstOtherError;
    }
    if (firstFidelityError) {
      wfState.transition(state, firstFidelityError.wfTransition || 'FAILED');
      // A sibling that raced the violating node and FULFILLED still made a real, billable LLM
      // call this wave — account for it too before returning, exactly like the normal
      // aggregation loop below would have, even though (per the existing, unchanged design) its
      // output is correctly never added as COMPLETE once the wave as a whole fails.
      for (let i = 0; i < wave.length; i++) {
        if (results[i].status !== 'fulfilled') continue;
        const r = results[i].value; const n = wave[i];
        cost.evidence_chars_total += r.evidenceChars;
        cost.by_tier[r.tier.task_class] = (cost.by_tier[r.tier.task_class] || 0) + 1;
        if (r.llmUsage) {
          cost.model_calls += 1; cost.retries += r.llmUsage.retries;
          cost.tokens.prompt += r.llmUsage.prompt; cost.tokens.completion += r.llmUsage.completion;
        }
        cost.per_node[n.id] = { tier: r.tier.task_class, evidence_count: r.bundle.length, generation: r.output.generation || 'DETERMINISTIC' };
      }
      // [Node Fidelity — Diagnostic Propagation] A node-level BRIEF_FIDELITY_VIOLATION is a
      // domain outcome, not a runtime crash — returning the same structured FAILED shape the
      // final-synthesis fidelity gate below already produces (instead of throwing) is what keeps
      // astra_tool_router.js's generic catch from degrading it to opaque RUNTIME_FAILED, which
      // would discard canonical_brief_facts and the exact violation paths processNode() attached.
      return {
        mode, intent, brief, canonical_brief_facts: canonicalBriefFacts, workflow_id: workflow.workflow_id,
        node_order: base.NODES.map(n => n.id).concat(['final_synthesis']),
        workflow_state_status: 'FAILED', reason: 'BRIEF_FIDELITY_VIOLATION',
        brief_fidelity_violations: firstFidelityError.briefFidelityViolations || [],
        fidelity_hypotheses,
        node_outputs, selected_methods_by_node, proposal_status_repairs: proposal_status_repairs.concat(firstFidelityError.proposalStatusRepairs || []), synthesis: null, cost, _state: state,
      };
    }
    const settled = results.map(r => r.value);
    const byId = new Map(settled.map(r => [r.node.id, r]));
    for (const n of base.NODES) {
      if (!waveIds.has(n.id)) continue;
      const r = byId.get(n.id);
      proposal_status_repairs.push(...r.proposalStatusRepairs);
      fidelity_hypotheses.push(...(r.fidelityHypotheses || []));
      selected_methods_by_node[n.id] = r.selectedMethod;
      cost.evidence_chars_total += r.evidenceChars;
      cost.by_tier[r.tier.task_class] = (cost.by_tier[r.tier.task_class] || 0) + 1;
      if (r.llmUsage) {
        cost.model_calls += 1; cost.retries += r.llmUsage.retries;
        cost.tokens.prompt += r.llmUsage.prompt; cost.tokens.completion += r.llmUsage.completion;
      }
      cost.per_node[n.id] = { tier: r.tier.task_class, evidence_count: r.bundle.length, generation: r.output.generation || 'DETERMINISTIC' };
      done[n.id] = r.output;
      node_outputs.push({ work_unit_id: n.id, method_used: r.primary, forced: r.forced, output: r.output, evidence_chunk_ids: r.bundle.map(e => e.chunk_id), evidence_count: r.bundle.length });
      wfState.setSelectedMethod(state, n.id, selected_methods_by_node[n.id]);
      emitProgress({
        phase: 'NODE_EXECUTION',
        current_node: null,
        active_nodes: [],
        completed_nodes: node_outputs.map(x => x.work_unit_id),
      });
    }
  }

  // synthesis (HIGH_REASONING tier recorded; deterministic reconciliation engine, no extra LLM call in slice)
  diag.mark(diagId, 'BEFORE_SYNTHESIS', { completed_nodes: node_outputs.map(x => x.work_unit_id) });
  emitProgress({ phase: 'FINAL_SYNTHESIS', current_node: 'final_synthesis', active_nodes: ['final_synthesis'], completed_nodes: node_outputs.map(x => x.work_unit_id) });
  const synthTier = modelRouter.route('STRATEGIC_SYNTHESIS'); cost.by_tier[synthTier.task_class] = (cost.by_tier[synthTier.task_class] || 0) + 1;
  // [Brief Fidelity] canonicalBriefFacts is already computed above — transported here so
  // synthesis_engine_v2 never asks for a USER_PROVIDED_FACT that's already known (synthV1, the
  // deterministic baseline, is untouched and does not take this parameter).
  const synthesis = (mode === 'llm' ? synthV2 : synthV1).synthesize({ brief, node_outputs, selected_methods_by_node, canonicalBriefFacts });
  diag.mark(diagId, 'AFTER_SYNTHESIS', { coherent: !!synthesis.coherent, section_count: synthesis.section_count || null });
  if (!synthesis.coherent) { wfState.transition(state, 'BLOCKED'); throw new Error('synthesis incomplete: missing ' + synthesis.missing_sections.join(',')); }

  // [Final Synthesis Validator — Brief Fidelity] COMPLETE is prohibited if the reconciled output
  // substitutes any USER_PROVIDED_FACT. Per-node checks already ran (§ Node Fidelity Validator);
  // this is the last gate before the workflow declares victory. On violation: attempt deterministic
  // repair ONLY when every violation present is an explicitly authorized repairable class (never
  // EXPLICIT_PROHIBITION, invented metrics/evidence/guarantees/testimonials, *_SUBSTITUTION, or the
  // fact-based KNOWN_FACT_DENIAL — those fail closed immediately, unchanged); revalidate; if a
  // repairable violation survives deterministic repair, ONE bounded final-synthesis-only
  // regeneration is attempted (never a specialist rerun, never a new Campaign360); FAILED, with the
  // exact violation paths, if coherence still cannot be established — never a silent COMPLETE.
  diag.mark(diagId, 'BEFORE_FINAL_FIDELITY');
  emitProgress({ phase: 'FINAL_FIDELITY', current_node: 'final_synthesis', active_nodes: ['final_synthesis'], completed_nodes: node_outputs.map(x => x.work_unit_id) });
  let finalCheck = fidelity.validateFinalSynthesis(canonicalBriefFacts, synthesis, { rawRequest });
  diag.mark(diagId, 'AFTER_FINAL_FIDELITY', { violations: finalCheck.violations.length });
  let finalSynthesis = synthesis;
  const finalSynthesisRepairs = [];

  // Meta-only deterministic cleanup: assumptions/recommended-next-actions are aggregation surfaces,
  // not core campaign strategy. If an unsafe item appears there, drop that item and revalidate.
  // Core-section violations are never edited by this guard and still fail closed.
  if (finalCheck.violations.length) {
    const metaRepair = synthesisMetaGuard.pruneMetaViolations(finalSynthesis, finalCheck.violations);
    if (metaRepair.repairs.length) {
      finalSynthesis = metaRepair.synthesis;
      finalSynthesisRepairs.push(...metaRepair.repairs);
      finalCheck = fidelity.validateFinalSynthesis(canonicalBriefFacts, finalSynthesis, { rawRequest });
      diag.mark(diagId, 'AFTER_META_GUARD', { repairs: metaRepair.repairs.length, remaining_violations: finalCheck.violations.length });
    }
  }
  let finalSynthesisRegenerationAttempts = 0;
  if (finalCheck.violations.length && finalCheck.violations.every(fidelity.isRepairableFinalSynthesisViolation)) {
    const repairResult = fidelity.repairFinalSynthesis(canonicalBriefFacts, finalSynthesis, finalCheck.violations, { rawRequest });
    if (repairResult) {
      finalSynthesisRepairs.push(...repairResult.repairs);
      let revalidated = fidelity.validateFinalSynthesis(canonicalBriefFacts, repairResult.synthesis, { rawRequest });
      finalSynthesis = repairResult.synthesis;
      finalCheck = revalidated;
      if (revalidated.violations.length && revalidated.violations.every(fidelity.isRepairableFinalSynthesisViolation)
        && finalSynthesisRegenerationAttempts < MAX_FINAL_SYNTHESIS_REGENERATION_ATTEMPTS) {
        finalSynthesisRegenerationAttempts += 1;
        const regen = await regenerateFinalSynthesis(canonicalBriefFacts, finalSynthesis, revalidated.violations, { llm: injectedLLM });
        if (regen.ok) {
          cost.model_calls += 1;
          cost.tokens.prompt += (regen.usage && regen.usage.prompt) || 0;
          cost.tokens.completion += (regen.usage && regen.usage.completion) || 0;
          finalSynthesisRepairs.push({ repair_type: 'BOUNDED_REGENERATION' });
          finalSynthesis = regen.synthesis;
          finalCheck = fidelity.validateFinalSynthesis(canonicalBriefFacts, finalSynthesis, { rawRequest });
        }
        // regen.ok === false: keep the pre-regeneration finalCheck/finalSynthesis — fails closed below.
      }
    }
  }
  if (finalCheck.violations.length) {
    const classifiedFinal = fidelityHypothesisPolicy.classify(finalCheck.violations, 'final_synthesis');
    fidelity_hypotheses.push(...classifiedFinal.hypotheses);
    finalCheck = { ...finalCheck, violations: classifiedFinal.hard };
  }
  if (finalCheck.violations.length) {
    emitProgress({ phase: 'FAILED', current_node: 'final_synthesis', active_nodes: [], completed_nodes: node_outputs.map(x => x.work_unit_id) });
    wfState.transition(state, 'FAILED');
    return {
      mode, intent, brief, canonical_brief_facts: canonicalBriefFacts, workflow_id: workflow.workflow_id,
      node_order: base.NODES.map(n => n.id).concat(['final_synthesis']),
      workflow_state_status: 'FAILED', reason: 'BRIEF_FIDELITY_VIOLATION',
      brief_fidelity_violations: finalCheck.violations,
      node_outputs, selected_methods_by_node, proposal_status_repairs, fidelity_hypotheses, final_synthesis_repairs: finalSynthesisRepairs,
      synthesis: finalSynthesis, cost, _state: state,
    };
  }

  wfState.transition(state, 'COMPLETE');
  diag.mark(diagId, 'WORKFLOW_COMPLETE', { completed_nodes: node_outputs.map(x => x.work_unit_id).concat(['final_synthesis']) });
  emitProgress({ phase: 'COMPLETE', current_node: null, active_nodes: [], completed_nodes: node_outputs.map(x => x.work_unit_id).concat(['final_synthesis']) });
  return {
    mode, intent, brief, canonical_brief_facts: canonicalBriefFacts, workflow_id: workflow.workflow_id, node_order: base.NODES.map(n => n.id).concat(['final_synthesis']),
    mandatory_nodes_executed: node_outputs.length + 1, mandatory_node_count: 9,
    bindings: { ads: selected_methods_by_node.ads.primary_method, whatsapp_conversion: selected_methods_by_node.whatsapp_conversion.primary_method },
    node_outputs, selected_methods_by_node, proposal_status_repairs, fidelity_hypotheses, final_synthesis_repairs: finalSynthesisRepairs,
    synthesis: finalSynthesis, cost, workflow_state_status: state.status, _state: state,
  };
}

module.exports = { run, SPEC_TYPE, DET_FN, regenerateFinalSynthesis, MAX_FINAL_SYNTHESIS_REGENERATION_ATTEMPTS };
