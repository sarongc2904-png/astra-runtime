'use strict';
// ASTRA-02 router-core test suite. Node built-ins only. No live API (adapter uses a mock kb).
const assert = require('assert');
const S = '../src';
const taskBrief = require(S + '/schemas/task_brief');
const intent = require(S + '/router/intent_analyzer');
const decomposer = require(S + '/router/task_decomposer');
const planner = require(S + '/router/knowledge_query_planner');
const { AgentV1Adapter, EXPECTED_CORPUS } = require(S + '/adapter/agent_v1_adapter');
const registryLoader = require(S + '/methods/registry_loader');
const adjudicator = require(S + '/router/method_adjudicator');
const modelRouter = require(S + '/model_router/model_router');
const wf = require(S + '/state/workflow_state');
const handoff = require(S + '/handoff/handoff');

let pass = 0, fail = 0; const fails = [];
function t(name, fn) { try { fn(); pass++; console.log('PASS', name); } catch (e) { fail++; fails.push(name + ' :: ' + e.message); console.log('FAIL', name, '::', e.message); } }

// ---- mock kb (no network) ----
function goodKb() {
  return {
    loadConfig: () => ({ apiKey: 'SECRET_SHOULD_NEVER_LEAK', model: 'openai/gpt-5-mini', baseUrl: 'https://x' }),
    groundedRetrieve: (q, k) => ({
      evidenceText: `[chunk:abc123 | source:The Advertising Concept Book.pdf | page:12]\nsome grounded text about ${q}`,
      hits: [{ rank: 1, chunk_id: 'abc123', content: 'some grounded text', source_pdf_name: 'The Advertising Concept Book.pdf', pdf_page_refs: '12', rag_decision: 'keep', quality_status: 'ok', warning_flags: [], provenance: 'kb_chunks_v2', original_query_cosine: 0.61 }],
      advisoryTop1Cosine: 0.61, pipeline: 'Strategy-F', corpus: 'kb_chunks_v2',
    }),
    classifyEvidenceSufficiency: (cfg, model, q, ev) => ({ decision: 'PARTIAL', hasSupportedMaterial: true, specificLimitation: 'x', reason: 'r', usage: null, cache: { status: 'CACHE_HIT', decision_key: 'k', llm_calls: 0 } }),
  };
}
function badContractKb() { const kb = goodKb(); kb.groundedRetrieve = () => ({ evidenceText: '', hits: [], corpus: 'kb_chunks', pipeline: 'other' }); return kb; }

// ===== TASK_BRIEF =====
t('brief valid', () => { const b = taskBrief.makeBrief({ task_id: 't1', objective: 'X', business_type: 'B', target_customer: 'C', desired_deliverable: 'D' }); const v = taskBrief.validate(b); assert(v.valid, JSON.stringify(v.errors)); });
t('brief invalid enum', () => { const b = taskBrief.makeBrief({ task_id: 't1', urgency: 'WHENEVER' }); const v = taskBrief.validate(b); assert(!v.valid && v.errors.some(e => e.includes('urgency'))); });
t('brief missing required', () => { const v = taskBrief.validate({ raw_user_request: 'x' }); assert(!v.valid && v.errors.some(e => e.includes('missing required'))); });
t('brief unknown funnel_stage rejected', () => { const b = taskBrief.makeBrief({ task_id: 't', funnel_stage: ['nope'] }); const v = taskBrief.validate(b); assert(!v.valid); });

// ===== INTENT =====
t('intent single (offer)', () => { const r = intent.analyze('Diseña una oferta irresistible para mi servicio'); assert.strictEqual(r.intent, 'OFFER_DESIGN'); });
t('intent multi-step campaign', () => { const r = intent.analyze('Crea una campaña de captación de clientes de principio a fin'); assert.strictEqual(r.intent, 'MULTI_STEP_MARKETING'); });
t('intent generic/unknown', () => { const r = intent.analyze('hola qué tal'); assert.strictEqual(r.intent, 'GENERIC_MARKETING_TASK'); });
t('intent produces valid brief', () => { const r = intent.analyze('Create a client acquisition campaign for a laser hair removal clinic'); assert(taskBrief.validate(r.brief).valid); });
t('intent deterministic id', () => { const a = intent.analyze('same text', { salt: 'x' }); const b = intent.analyze('same text', { salt: 'x' }); assert.strictEqual(a.brief.task_id, b.brief.task_id); });

// ===== DAG =====
t('DAG valid + topo order', () => { const b = intent.analyze('campaña 360').brief; const w = decomposer.decompose(b, 'MULTI_STEP_MARKETING'); assert(w.valid && w.topological_order_names[0] === 'market_context' && w.topological_order_names.length === 8); });
t('DAG deterministic step ids', () => { const b = { task_id: 'fixed' }; const w1 = decomposer.decompose(b, 'MULTI_STEP_MARKETING'); const w2 = decomposer.decompose(b, 'MULTI_STEP_MARKETING'); assert.deepStrictEqual(w1.topological_order, w2.topological_order); });
t('DAG cycle rejected', () => { assert.throws(() => decomposer.topoSort([{ name: 'a', deps: ['b'] }, { name: 'b', deps: ['a'] }]), /CYCLE_DETECTED/); });
t('DAG unknown dep rejected', () => { assert.throws(() => decomposer.topoSort([{ name: 'a', deps: ['ghost'] }]), /unknown dependency/); });
t('DAG topo respects deps (offer after icp)', () => { const w = decomposer.decompose({ task_id: 'x' }, 'MULTI_STEP_MARKETING'); const o = w.topological_order_names; assert(o.indexOf('icp') < o.indexOf('offer') && o.indexOf('offer') < o.indexOf('funnel')); });

// ===== QUERY PLANNER =====
t('planner targeted + bounded', () => { const b = intent.analyze('campaign for a dental clinic').brief; const w = decomposer.decompose(b, 'MULTI_STEP_MARKETING'); const p = planner.plan(w, b); assert(p.total_queries > 0 && p.bounded && p.requests.every(r => r.requested_evidence_count <= 5)); });
t('planner max 2 queries per step', () => { const b = { business_type: 'X' }; const w = decomposer.decompose({ task_id: 'x' }, 'MULTI_STEP_MARKETING'); planner.plan(w, b); assert(w.steps.every(s => s.knowledge_queries.length <= 2)); });

// ===== AGENT V1 ADAPTER =====
t('adapter retrieve read-only + provenance', () => { const a = new AgentV1Adapter({ kb: goodKb() }); const r = a.retrieve('offer design'); assert(r.read_only && r.corpus === EXPECTED_CORPUS && r.pipeline === 'Strategy-F' && r.hits[0].chunk_id === 'abc123' && r.hits[0].source_class === 'INTERNAL_KNOWLEDGE'); });
t('adapter never exposes apiKey', () => { const a = new AgentV1Adapter({ kb: goodKb() }); const c = a.config(); assert(!('apiKey' in c) && c.model === 'openai/gpt-5-mini'); });
t('adapter fail-closed on contract mismatch', () => { const a = new AgentV1Adapter({ kb: badContractKb() }); assert.throws(() => a.retrieve('x'), /contract mismatch|FAIL CLOSED/); });
t('adapter healthCheck ok + read_only', () => { const a = new AgentV1Adapter({ kb: goodKb() }); const h = a.healthCheck(); assert(h.ok && h.read_only && h.exposes_api_key === false); });
t('adapter top_k bounded to 5', () => { const a = new AgentV1Adapter({ kb: goodKb() }); const r = a.retrieve('x', { top_k: 50 }); assert(r.top_k === 5); });

// ===== METHOD REGISTRY =====
t('registry loads seed (all DISCOVERED)', () => { const reg = registryLoader.load(); assert(reg.count >= 10 && reg.methods.every(m => m.mapping_status === 'DISCOVERED')); });
t('registry entry valid', () => { const reg = registryLoader.load(); assert(registryLoader.validateEntry(reg.methods[0]).valid); });
t('registry invalid entry detected', () => { const v = registryLoader.validateEntry({ method_id: 'bad id', mapping_status: 'NOPE' }); assert(!v.valid); });
t('registry getCandidates by domain', () => { const reg = registryLoader.load(); const c = reg.getCandidates({ domain: 'OFFER' }); assert(c.length >= 1 && c.every(m => m.domain === 'OFFER')); });

// ===== METHOD ADJUDICATOR =====
t('adjudicator output schema', () => { const reg = registryLoader.load(); const b = intent.analyze('offer').brief; const step = { step_id: 's1', domain: 'OFFER' }; const a = adjudicator.adjudicate({ brief: b, step, candidates: reg.getCandidates({ domain: 'OFFER' }), evidence: { decision: 'PARTIAL' } }); ['primary_method', 'secondary_methods', 'rejected_methods', 'hybrid_allowed', 'selection_confidence', 'selection_reasons', 'method_conflicts', 'missing_evidence', 'fallback_strategy', 'state', 'scores'].forEach(k => assert(k in a, 'missing ' + k)); });
t('adjudicator multiple candidates ranked', () => { const reg = registryLoader.load(); const cands = reg.getCandidates({ domain: 'ADS' }); const a = adjudicator.adjudicate({ brief: intent.analyze('ads').brief, step: { step_id: 's', domain: 'ADS' }, candidates: cands, evidence: { decision: 'SUFFICIENT' } }); assert(a.primary_method && Object.keys(a.scores).length === cands.length); });
t('adjudicator insufficient evidence gate', () => { const reg = registryLoader.load(); const a = adjudicator.adjudicate({ brief: intent.analyze('offer').brief, step: { step_id: 's', domain: 'OFFER' }, candidates: reg.getCandidates({ domain: 'OFFER' }), evidence: { decision: 'INSUFFICIENT' } }); assert(a.state === 'INSUFFICIENT_EVIDENCE' && a.primary_method === null && a.missing_evidence.length > 0); });
t('adjudicator conflict detection', () => { const cands = [{ method_id: 'METHOD_A', domain: 'X', funnel_stage: [], business_stage: [], conflicting_methods: ['METHOD_B'] }, { method_id: 'METHOD_B', domain: 'X', funnel_stage: [], business_stage: [], conflicting_methods: [] }]; const a = adjudicator.adjudicate({ brief: { funnel_stage: [] }, step: { step_id: 's', domain: 'X' }, candidates: cands, evidence: { decision: 'SUFFICIENT' } }); assert(a.method_conflicts.length === 1 && a.method_conflicts[0].between.join(',') === 'METHOD_A,METHOD_B'); });
t('adjudicator not retrieval-score-only (evidence weight < 0.5 and other dims count)', () => { assert(adjudicator.DEFAULT_WEIGHTS.evidence_strength < 0.5); const nonEv = adjudicator.DIMENSIONS.filter(d => d !== 'evidence_strength').reduce((s, d) => s + adjudicator.DEFAULT_WEIGHTS[d], 0); assert(nonEv > adjudicator.DEFAULT_WEIGHTS.evidence_strength); });

// ===== MODEL ROUTER =====
t('model router classes', () => { assert.strictEqual(modelRouter.route('METHOD_ADJUDICATION').task_class, 'HIGH_REASONING'); assert.strictEqual(modelRouter.route('FORMATTING').task_class, 'LOW_COST_EXECUTION'); assert.strictEqual(modelRouter.route('INTENT_ANALYSIS').task_class, 'DETERMINISTIC_TRANSFORM'); assert.strictEqual(modelRouter.route('INTENT_ANALYSIS').uses_llm, false); });
t('model router configurable role, no hardcoded model id', () => { const r = modelRouter.route('SPECIALIST_EXECUTION'); assert(r.model_role && !/gpt-|claude-|openai\//.test(JSON.stringify(r))); });

// ===== WORKFLOW STATE =====
t('workflow state create PLANNED', () => { const s = wf.create({ user_goal: 'g', task_brief: {}, workflow: { workflow_id: 'W', intent: 'X', steps: [] } }); assert(s.status === 'PLANNED' && s.workflow_id === 'W'); });
t('workflow valid transition', () => { const s = wf.create({ user_goal: 'g' }); wf.transition(s, 'RUNNING'); assert(s.status === 'RUNNING'); wf.transition(s, 'COMPLETE'); assert(s.status === 'COMPLETE'); });
t('workflow invalid transition rejected', () => { const s = wf.create({ user_goal: 'g' }); assert.throws(() => wf.transition(s, 'COMPLETE'), /invalid transition/); });
t('workflow additive decisions', () => { const s = wf.create({ user_goal: 'g' }); wf.addDecision(s, { decision: 'd', rationale: 'r' }); wf.addAssumption(s, 'a'); assert(s.decisions.length === 1 && s.assumptions[0].source_class === 'INFERENCE'); });

// ===== HANDOFF =====
t('handoff CURRENT_TASK complete', () => { const r = handoff.checkComplete(handoff.CURRENT_TASK, handoff.REQUIRED_CURRENT_TASK_SECTIONS); assert(r.complete, 'missing: ' + r.missing.join(',')); });
t('handoff HANDOFF_LATEST complete', () => { const r = handoff.checkComplete(handoff.HANDOFF_LATEST, handoff.REQUIRED_HANDOFF_SECTIONS); assert(r.complete, 'missing: ' + r.missing.join(',')); });
t('handoff operational', () => { assert(handoff.verifyHandoffOperational().operational); });

console.log(`\nASTRA02_TEST_RESULT pass=${pass} fail=${fail}`);
if (fail) { console.log('FAILURES:\n' + fails.join('\n')); process.exit(1); }
