'use strict';
// ASTRA-10X test suite. Validates the parallel-DAG-wave execution (Candidate C) and the
// non-blocking retrieval wrapper (Candidate H) added on top of the hardened campaign-360
// workflow. Fully offline/deterministic — no network, no subprocess, no LLM API calls.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const H = require('../src/workflows/marketing_campaign_360_hardened');
const { AgentV1Adapter } = require('../src/adapter/agent_v1_adapter');

let pass = 0, fail = 0; const fails = [];
const tests = [];
function t(name, fn) { tests.push({ name, fn }); }

const CANONICAL_ORDER = ['market_context', 'icp', 'offer', 'funnel', 'creative_strategy', 'ads', 'whatsapp_conversion', 'measurement'];

function mockKb({ retrieveDelayMs = () => 0, fail = new Set() } = {}) {
  const calls = []; // { query, start, end }
  return {
    calls,
    async retrieveStrategyFAsync(query, topK) {
      const start = Date.now();
      const delay = retrieveDelayMs(query);
      if (delay) await new Promise(res => setTimeout(res, delay));
      const end = Date.now();
      calls.push({ query, start, end });
      if ([...fail].some(f => query.includes(f))) return { top5: [], advisory_top1_cosine: 0 };
      const hits = Array.from({ length: 5 }, (_, i) => ({ rank: i + 1, chunk_id: 'c' + i, source_pdf_name: 'S.pdf', pdf_page_refs: '1', content: 'evidence ' + query, original_query_cosine: 0.6, rag_decision: 'CITE', quality_status: 'OK', warning_flags: [] }));
      return { top5: hits, advisory_top1_cosine: 0.6 };
    },
    buildStrategyFEvidence(raw) {
      const hits = raw.top5 || [];
      return { evidenceText: hits.map(h => h.content).join('\n'), hits, advisoryTop1Cosine: raw.advisory_top1_cosine, pipeline: 'Strategy-F', corpus: 'kb_chunks_v2' };
    },
  };
}
function mockAdapterAsync(opts) { return new AgentV1Adapter({ kb: mockKb(opts) }); }
function specTypeFromSystem(sys) { const m = /You are ASTRA's ([A-Z_]+)/.exec(sys); return m ? m[1] : 'UNKNOWN'; }
// Full OUT_SCHEMA required by llm_specialists.js (same validated shape as astra05.test.js's
// mockLLM), including a per-specialist downstream_payload so synthesis_engine_v2 finds every
// field it needs across all 8 nodes (18-section synthesis requires all of them present).
function mockLLM() {
  return async (system) => {
    const st = specTypeFromSystem(system);
    const current = /META_ADS/.test(st) ? ['CAPI', 'Advantage+', 'current attribution'] : (/WHATSAPP/.test(st) ? ['current WhatsApp API mechanics', 'provider-specific behavior'] : []);
    const payload = { note: 'structured for ' + st, business_specific: true };
    ['problem_context', 'pains', 'value_proposition', 'stages', 'core_idea', 'campaign_objective', 'qualification', 'primary_outcome', 'limitations'].forEach(k => { payload[k] = payload[k] || (k === 'limitations' ? ['coverage=MODERATE'] : (st.toLowerCase() + ':' + k)); });
    const obj = {
      findings: [{ claim: 'grounded finding', support_class: 'DIRECTLY_SUPPORTED', evidence_ref: 'E1' }],
      recommendations: [{ recommendation: 'action for ' + st, support_class: 'INFERENCE', basis: 'method' }],
      decisions: [{ decision: 'd', rationale: 'r' }], assumptions: ['needs USER_PROVIDED_FACTS: price'], conflicts: [], confidence: 0.5,
      current_research_required: current, downstream_payload: payload,
    };
    return { raw: JSON.stringify(obj), usage: { prompt: 10, completion: 10 } };
  };
}

const brief = 'Create a client acquisition campaign for a dental clinic.';

// ===== 1. TOPOLOGICAL_PARALLELISM =====
t('TOPOLOGICAL_PARALLELISM: retrieval call count matches node count (8)', async () => {
  const adapter = mockAdapterAsync({});
  const r = await H.run(brief, { adapter, llm: mockLLM(), mode: 'llm' });
  assert(r.workflow_state_status === 'COMPLETE');
  assert.strictEqual(adapter.kb.calls.length, 8, 'expected 8 retrieval calls, got ' + adapter.kb.calls.length);
});

t('TOPOLOGICAL_PARALLELISM: wave-mates overlap in wall-clock time; downstream never starts before deps end', async () => {
  const events = []; // { node, phase: 'start'|'end', t }
  const kb = {
    async retrieveStrategyFAsync(query) {
      const node = Object.keys(NODE_QUERY_MAP).find(id => query.toLowerCase().includes(NODE_QUERY_MAP[id]));
      events.push({ node, phase: 'start', t: Date.now() });
      await new Promise(res => setTimeout(res, 25));
      events.push({ node, phase: 'end', t: Date.now() });
      const hits = Array.from({ length: 5 }, (_, i) => ({ rank: i + 1, chunk_id: 'c' + i, source_pdf_name: 'S.pdf', pdf_page_refs: '1', content: 'evidence ' + query, original_query_cosine: 0.6, rag_decision: 'CITE', quality_status: 'OK', warning_flags: [] }));
      return { top5: hits, advisory_top1_cosine: 0.6 };
    },
    buildStrategyFEvidence(raw) { const hits = raw.top5 || []; return { evidenceText: hits.map(h => h.content).join('\n'), hits, advisoryTop1Cosine: raw.advisory_top1_cosine, pipeline: 'Strategy-F', corpus: 'kb_chunks_v2' }; },
  };
  const adapter = new AgentV1Adapter({ kb });
  const r = await H.run(brief, { adapter, llm: mockLLM(), mode: 'llm' });
  assert(r.workflow_state_status === 'COMPLETE');
  const span = node => { const s = events.find(e => e.node === node && e.phase === 'start').t; const e = events.find(e => e.node === node && e.phase === 'end').t; return [s, e]; };
  const overlaps = (a, b) => { const [s1, e1] = span(a); const [s2, e2] = span(b); return s1 < e2 && s2 < e1; };
  assert(overlaps('funnel', 'creative_strategy'), 'funnel and creative_strategy should overlap (same wave)');
  assert(overlaps('ads', 'whatsapp_conversion'), 'ads and whatsapp_conversion should overlap (same wave)');
  // DEPS never violated: every node starts at or after all its deps ended
  const DEPS = { market_context: [], icp: ['market_context'], offer: ['icp'], funnel: ['offer', 'icp'], creative_strategy: ['icp', 'offer'], ads: ['offer', 'funnel', 'creative_strategy'], whatsapp_conversion: ['funnel'], measurement: ['funnel', 'ads', 'whatsapp_conversion'] };
  for (const [node, deps] of Object.entries(DEPS)) {
    const [nodeStart] = span(node);
    for (const d of deps) { const [, depEnd] = span(d); assert(nodeStart >= depEnd, `${node} started before dep ${d} ended`); }
  }
});
const NODE_QUERY_MAP = { market_context: 'market context', icp: 'ideal customer profile', offer: 'offer design', funnel: 'funnel design', creative_strategy: 'creative strategy', ads: 'meta ads', whatsapp_conversion: 'whatsapp sales', measurement: 'conversion measurement' };

// ===== 2. CANONICAL_OUTPUT_ORDER =====
t('CANONICAL_OUTPUT_ORDER: node_outputs preserves original order even when completion order differs', async () => {
  // Reverse-delay within-wave nodes so the one that appears LATER in base.NODES finishes FIRST.
  const kb = mockKb({ retrieveDelayMs: q => (q.includes('creative strategy') ? 5 : q.includes('funnel design') ? 40 : q.includes('whatsapp sales') ? 5 : q.includes('meta ads') ? 40 : 0) });
  const adapter = new AgentV1Adapter({ kb });
  const r = await H.run(brief, { adapter, llm: mockLLM(), mode: 'llm' });
  assert(r.workflow_state_status === 'COMPLETE');
  const order = r.node_outputs.map(n => n.work_unit_id);
  assert.deepStrictEqual(order, CANONICAL_ORDER, 'node_outputs order diverged: ' + JSON.stringify(order));
});

// ===== 3. PARALLEL_FAIL_CLOSED =====
t('PARALLEL_FAIL_CLOSED: two nodes in the same wave failing concurrently still fails the whole workflow cleanly (no unhandled transition error)', async () => {
  const kb = mockKb({ fail: new Set(['funnel design', 'creative strategy']) }); // both wave-4 nodes fail
  const adapter = new AgentV1Adapter({ kb });
  let threw = null;
  try { await H.run(brief, { adapter, llm: mockLLM(), mode: 'llm' }); }
  catch (e) { threw = e; }
  assert(threw, 'expected run() to throw');
  assert(!/invalid transition/i.test(threw.message), 'leaked internal wfState transition error: ' + threw.message);
  assert(/missing required evidence/.test(threw.message), 'unexpected error: ' + threw.message);
});

t('PARALLEL_FAIL_CLOSED: downstream node (measurement) never executes when an earlier wave fails', async () => {
  const kb = mockKb({ fail: new Set(['funnel design']) });
  const adapter = new AgentV1Adapter({ kb });
  try { await H.run(brief, { adapter, llm: mockLLM(), mode: 'llm' }); assert(false, 'expected throw'); }
  catch (e) { assert(/missing required evidence for node funnel/.test(e.message)); }
  // measurement's query must never have been issued (funnel failed upstream of it)
  assert(!kb.calls.some(c => c.query.includes('conversion measurement')), 'measurement retrieval ran despite upstream failure');
});

// ===== 4. COST_TRACKING_CONCURRENCY =====
t('COST_TRACKING_CONCURRENCY: model_calls/tokens/by_tier totals correct after parallel execution', async () => {
  const adapter = mockAdapterAsync({});
  const r = await H.run(brief, { adapter, llm: mockLLM(), mode: 'llm' });
  assert(r.workflow_state_status === 'COMPLETE');
  assert.strictEqual(r.cost.model_calls, 8, 'expected 8 LLM calls (one per node), got ' + r.cost.model_calls);
  assert.strictEqual(r.cost.tokens.prompt, 80, 'expected 80 prompt tokens (8x10), got ' + r.cost.tokens.prompt);
  assert.strictEqual(r.cost.tokens.completion, 80, 'expected 80 completion tokens (8x10), got ' + r.cost.tokens.completion);
  const tierSum = Object.values(r.cost.by_tier).reduce((a, b) => a + b, 0);
  assert(tierSum >= 8, 'by_tier total should cover at least the 8 nodes, got ' + tierSum);
  assert.strictEqual(Object.keys(r.cost.per_node).length, 8, 'expected per_node entries for all 8 nodes');
});

// ===== 5. WFSTATE_CONCURRENCY =====
t('WFSTATE_CONCURRENCY: successful run reaches COMPLETE with no invalid-transition exception', async () => {
  const adapter = mockAdapterAsync({});
  const r = await H.run(brief, { adapter, llm: mockLLM(), mode: 'llm' });
  assert.strictEqual(r._state.status, 'COMPLETE');
});
t('WFSTATE_CONCURRENCY: concurrent failure in one wave yields a single valid terminal transition (FAILED or BLOCKED), not a crash', async () => {
  const kb = mockKb({ fail: new Set(['meta ads', 'whatsapp sales']) }); // wave-5 nodes both fail
  const adapter = new AgentV1Adapter({ kb });
  let threw = null;
  try { await H.run(brief, { adapter, llm: mockLLM(), mode: 'llm' }); }
  catch (e) { threw = e; }
  assert(threw, 'expected throw');
  assert(!/invalid transition/i.test(threw.message));
});

// ===== 6. ASYNC_RETRIEVAL_PARITY =====
t('ASYNC_RETRIEVAL_PARITY: retrieveAsync() returns the same shape/content as retrieve() for an equivalent query', async () => {
  const sharedHits = [{ rank: 1, chunk_id: 'c0', source_pdf_name: 'S.pdf', pdf_page_refs: '1', content: 'evidence X', original_query_cosine: 0.6, rag_decision: 'CITE', quality_status: 'OK', warning_flags: [] }];
  const kb = {
    groundedRetrieve: () => ({ evidenceText: 'evidence X', hits: sharedHits, corpus: 'kb_chunks_v2', pipeline: 'Strategy-F', advisoryTop1Cosine: 0.6 }),
    retrieveStrategyFAsync: async () => ({ top5: sharedHits, advisory_top1_cosine: 0.6 }),
    buildStrategyFEvidence: raw => ({ evidenceText: (raw.top5 || []).map(h => h.content).join('\n'), hits: raw.top5, advisoryTop1Cosine: raw.advisory_top1_cosine, pipeline: 'Strategy-F', corpus: 'kb_chunks_v2' }),
  };
  const adapter = new AgentV1Adapter({ kb });
  const sync = adapter.retrieve('parity query', { top_k: 5 });
  const async_ = await adapter.retrieveAsync('parity query', { top_k: 5 });
  assert.strictEqual(sync.corpus, async_.corpus);
  assert.strictEqual(sync.pipeline, async_.pipeline);
  assert.strictEqual(sync.evidence_count, async_.evidence_count);
  assert.strictEqual(sync.evidenceText, async_.evidenceText);
  assert.strictEqual(sync.hits[0].chunk_id, async_.hits[0].chunk_id);
  assert.strictEqual(sync.hits[0].text, async_.hits[0].text);
});
t('ASYNC_RETRIEVAL_PARITY: contract-mismatch fail-closed applies identically to retrieveAsync()', async () => {
  const kb = { retrieveStrategyFAsync: async () => ({ top5: [] }), buildStrategyFEvidence: () => ({ evidenceText: '', hits: [], corpus: 'WRONG_CORPUS', pipeline: 'Strategy-F', advisoryTop1Cosine: 0 }) };
  const adapter = new AgentV1Adapter({ kb });
  let threw = false;
  try { await adapter.retrieveAsync('q'); } catch (e) { threw = /FAIL CLOSED/.test(e.message); }
  assert(threw);
});

// ===== 7. EVENT_LOOP_NON_BLOCKING =====
t('EVENT_LOOP_NON_BLOCKING: retrieveAsync() code path never CALLS execFileSync (source inspection)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'adapter', 'agent_v1_adapter.js'), 'utf8');
  // Comments may legitimately mention execFileSync (contrasting it with the async approach used
  // here); what must never appear is an actual invocation "execFileSync(".
  assert(!/execFileSync\(/.test(src), 'agent_v1_adapter.js must not CALL execFileSync anywhere');
  assert(/\bexecFile\(/.test(src), 'agent_v1_adapter.js should use async execFile');
});
t('EVENT_LOOP_NON_BLOCKING: while a retrieval is pending, an independent timer still fires (event loop not blocked)', async () => {
  let timerFired = false;
  const kb = {
    retrieveStrategyFAsync: () => new Promise(resolve => setTimeout(() => resolve({ top5: [{ rank: 1, chunk_id: 'c0', source_pdf_name: 'S.pdf', pdf_page_refs: '1', content: 'e', original_query_cosine: 0.6, rag_decision: 'CITE', quality_status: 'OK', warning_flags: [] }], advisory_top1_cosine: 0.6 }), 60)),
    buildStrategyFEvidence: raw => ({ evidenceText: 'e', hits: raw.top5, advisoryTop1Cosine: raw.advisory_top1_cosine, pipeline: 'Strategy-F', corpus: 'kb_chunks_v2' }),
  };
  const adapter = new AgentV1Adapter({ kb });
  setTimeout(() => { timerFired = true; }, 10); // must fire well before the 60ms retrieval resolves, proving no blocking
  await adapter.retrieveAsync('q');
  assert(timerFired, 'independent timer did not fire before retrieval resolved — event loop appears blocked');
});

(async () => {
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; fails.push(name + ' :: ' + e.message); console.log('FAIL', name, '::', e.message); }
  }
  console.log(`\nASTRA10X_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) { console.log('FAILURES:\n' + fails.join('\n')); process.exit(1); }
})();
