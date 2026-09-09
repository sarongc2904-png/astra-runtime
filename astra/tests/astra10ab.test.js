'use strict';
// ASTRA-10AB test suite. Validates the additive LLM telemetry instrumentation (usage_detail,
// finish_reason, attempts/retries, llm_elapsed_ms, extended ASTRA-DIAG AFTER_LLM) without any
// change to model/reasoning/prompts/max_tokens/retrieval/DAG/retry-budget/HTTP contract.
// Fully offline/deterministic — no network, no subprocess, no LLM API calls.
const assert = require('assert');
const { normalizeUsage, extractFinishReason } = require('../src/llm/usage_normalizer');
const exec = require('../src/llm/llm_executor');
const H = require('../src/workflows/marketing_campaign_360_hardened');
const { AgentV1Adapter } = require('../src/adapter/agent_v1_adapter');

let pass = 0, fail = 0; const fails = [];
const tests = [];
function t(name, fn) { tests.push({ name, fn }); }

function specTypeFromSystem(sys) { const m = /You are ASTRA's ([A-Z_]+)/.exec(sys); return m ? m[1] : 'UNKNOWN'; }
// Same validated downstream_payload/current_research_required shape as astra05.test.js /
// astra10x.test.js's mockLLM — required for synthesis_engine_v2's 18-section completeness gate.
// extraNote/extraLlmFields let individual tests inject a marker string or 10AB telemetry fields.
function validatedMockLLM(extraNote, extraLlmFields) {
  return async (system) => {
    const st = specTypeFromSystem(system);
    const current = /META_ADS/.test(st) ? ['CAPI', 'Advantage+', 'current attribution'] : (/WHATSAPP/.test(st) ? ['current WhatsApp API mechanics', 'provider-specific behavior'] : []);
    const payload = Object.assign({ note: 'structured for ' + st, business_specific: true }, extraNote || {});
    ['problem_context', 'pains', 'value_proposition', 'stages', 'core_idea', 'campaign_objective', 'qualification', 'primary_outcome', 'limitations'].forEach(k => { payload[k] = payload[k] || (k === 'limitations' ? ['coverage=MODERATE'] : (st.toLowerCase() + ':' + k)); });
    const obj = {
      findings: [{ claim: 'grounded finding', support_class: 'DIRECTLY_SUPPORTED', evidence_ref: 'E1' }],
      recommendations: [{ recommendation: 'action for ' + st, support_class: 'INFERENCE', basis: 'method' }],
      decisions: [{ decision: 'd', rationale: 'r' }], assumptions: ['needs USER_PROVIDED_FACTS: price'], conflicts: [], confidence: 0.5,
      current_research_required: current, downstream_payload: payload,
    };
    return Object.assign({ raw: JSON.stringify(obj), usage: { prompt: 10, completion: 10 } }, extraLlmFields || {});
  };
}

// ===== 1. Basic usage: prompt/completion/total tokens =====
t('usage_normalizer: basic prompt/completion/total tokens preserved', () => {
  const u = normalizeUsage({ prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 });
  assert.strictEqual(u.prompt_tokens, 120);
  assert.strictEqual(u.completion_tokens, 45);
  assert.strictEqual(u.total_tokens, 165);
});
t('usage_normalizer: total_tokens derived ONLY when raw total absent and both operands present', () => {
  const u = normalizeUsage({ prompt_tokens: 100, completion_tokens: 20 });
  assert.strictEqual(u.total_tokens, 120, 'should derive 100+20=120 when raw total is absent');
});

// ===== 2. reasoning_tokens present =====
t('usage_normalizer: reasoning_tokens present (flat)', () => {
  const u = normalizeUsage({ prompt_tokens: 10, completion_tokens: 5, reasoning_tokens: 7 });
  assert.strictEqual(u.reasoning_tokens, 7);
});
t('usage_normalizer: reasoning_tokens present (nested completion_tokens_details)', () => {
  const u = normalizeUsage({ prompt_tokens: 10, completion_tokens: 5, completion_tokens_details: { reasoning_tokens: 9 } });
  assert.strictEqual(u.reasoning_tokens, 9);
});

// ===== 3. reasoning_tokens absent -> null/undefined seguro =====
t('usage_normalizer: reasoning_tokens absent -> null (never estimated)', () => {
  const u = normalizeUsage({ prompt_tokens: 10, completion_tokens: 5 });
  assert.strictEqual(u.reasoning_tokens, null);
});

// ===== 4. cached_tokens present =====
t('usage_normalizer: cached_tokens present (flat)', () => {
  const u = normalizeUsage({ prompt_tokens: 10, completion_tokens: 5, cached_tokens: 3 });
  assert.strictEqual(u.cached_tokens, 3);
});
t('usage_normalizer: cached_tokens present (nested prompt_tokens_details)', () => {
  const u = normalizeUsage({ prompt_tokens: 10, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 4 } });
  assert.strictEqual(u.cached_tokens, 4);
});

// ===== 5. cached_tokens absent =====
t('usage_normalizer: cached_tokens absent -> null (never derived)', () => {
  const u = normalizeUsage({ prompt_tokens: 10, completion_tokens: 5 });
  assert.strictEqual(u.cached_tokens, null);
});
t('usage_normalizer: no usage object at all -> fully null shape, no throw', () => {
  const u = normalizeUsage(null);
  assert.deepStrictEqual(u, { prompt_tokens: null, completion_tokens: null, total_tokens: null, reasoning_tokens: null, cached_tokens: null });
});

// ===== 6. finish_reason preserved =====
t('usage_normalizer: finish_reason extracted from choices[0].finish_reason', () => {
  assert.strictEqual(extractFinishReason({ choices: [{ finish_reason: 'stop' }] }), 'stop');
  assert.strictEqual(extractFinishReason({ choices: [{ finish_reason: 'length' }] }), 'length');
});
t('usage_normalizer: finish_reason absent -> null', () => {
  assert.strictEqual(extractFinishReason({ choices: [{}] }), null);
  assert.strictEqual(extractFinishReason({}), null);
});

// ===== 7. success first attempt: attempts=1, retries=0 =====
t('llm_executor: success on first attempt -> attempts=1, retries=0', async () => {
  const r = await exec.execute({ system: 's', user: 'u', schema: { required: ['a'] }, llm: async () => ({ raw: '{"a":1}', usage: { prompt: 5, completion: 2 }, usage_detail: normalizeUsage({ prompt_tokens: 5, completion_tokens: 2 }), finish_reason: 'stop' }) });
  assert.strictEqual(r.attempts, 1);
  assert.strictEqual(r.retries, 0);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.finish_reason, 'stop');
});

// ===== 8. failure then success: attempts=2, retries=1 =====
t('llm_executor: schema failure then success -> attempts=2, retries=1', async () => {
  let call = 0;
  const r = await exec.execute({ system: 's', user: 'u', schema: { required: ['a'] }, llm: async () => { call++; return call === 1 ? { raw: '{"b":1}', usage: null } : { raw: '{"a":1}', usage: { prompt: 3, completion: 1 } }; } });
  assert.strictEqual(r.attempts, 2);
  assert.strictEqual(r.retries, 1);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.usage.prompt, 3, 'legacy usage.prompt must still reflect the successful attempt (accumulated, unchanged semantics)');
});
t('llm_executor: provider HTTP failure then successful retry -> attempts=2, retries=1', async () => {
  let call = 0;
  const r = await exec.execute({ system: 's', user: 'u', schema: { required: ['a'] }, llm: async () => { call++; if (call === 1) throw new Error('LLM HTTP 503: unavailable'); return { raw: '{"a":1}', usage: { prompt: 1, completion: 1 } }; } });
  assert.strictEqual(r.attempts, 2);
  assert.strictEqual(r.retries, 1);
  assert.strictEqual(r.ok, true);
});

// ===== 9. terminal failure preserves fail-closed =====
t('llm_executor: terminal failure after retry budget preserves fail-closed contract', async () => {
  let calls = 0;
  const r = await exec.execute({ system: 's', user: 'u', schema: { required: ['a'] }, llm: async () => { calls++; return { raw: '{"b":1}', usage: null }; } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.fail_closed, true);
  assert.strictEqual(r.attempts, 1 + exec.RETRY_BUDGET);
  assert.strictEqual(calls, 1 + exec.RETRY_BUDGET);
  assert.strictEqual(r.retries, exec.RETRY_BUDGET);
});

// ===== 10. llm_elapsed_ms >= 0 =====
t('llm_executor: llm_elapsed_ms is a non-negative number on success and failure', async () => {
  const ok = await exec.execute({ system: 's', user: 'u', schema: { required: ['a'] }, llm: async () => ({ raw: '{"a":1}', usage: null }) });
  assert(typeof ok.llm_elapsed_ms === 'number' && ok.llm_elapsed_ms >= 0);
  const fail = await exec.execute({ system: 's', user: 'u', schema: { required: ['a'] }, llm: async () => ({ raw: 'not json', usage: null }) });
  assert(typeof fail.llm_elapsed_ms === 'number' && fail.llm_elapsed_ms >= 0);
});

// ===== 11. provider_latency ausente no se inventa =====
t('llm_executor/usage_normalizer: absent provider-side fields are never invented (usage_detail null passthrough)', async () => {
  const r = await exec.execute({ system: 's', user: 'u', schema: { required: ['a'] }, llm: async () => ({ raw: '{"a":1}', usage: null }) }); // old-style mock: no usage_detail/finish_reason at all
  assert.strictEqual(r.usage_detail, null, 'usage_detail must stay null, never fabricated, when the runner does not supply it');
  assert.strictEqual(r.finish_reason, null);
});

// ===== 12. ASTRA-DIAG no contiene secretos/prompts/responses =====
t('ASTRA-DIAG AFTER_LLM payload never contains prompts, responses, evidence, or secrets', async () => {
  const logs = [];
  const origLog = console.log;
  console.log = (...args) => { logs.push(args.join(' ')); };
  try {
    const kb = {
      async retrieveStrategyFAsync() { return { top5: Array.from({ length: 5 }, (_, i) => ({ rank: i + 1, chunk_id: 'c' + i, source_pdf_name: 'S.pdf', pdf_page_refs: '1', content: 'SECRET_EVIDENCE_TEXT_MARKER', original_query_cosine: 0.6, rag_decision: 'CITE', quality_status: 'OK', warning_flags: [] })), advisory_top1_cosine: 0.6 }; },
      buildStrategyFEvidence(raw) { const hits = raw.top5 || []; return { evidenceText: hits.map(h => h.content).join('\n'), hits, advisoryTop1Cosine: raw.advisory_top1_cosine, pipeline: 'Strategy-F', corpus: 'kb_chunks_v2' }; },
    };
    const adapter = new AgentV1Adapter({ kb });
    const llmMock = validatedMockLLM({ note: 'SECRET_RESPONSE_TEXT_MARKER' }, { usage_detail: normalizeUsage({ prompt_tokens: 1, completion_tokens: 1 }), finish_reason: 'stop' });
    await H.run('Create a client acquisition campaign for a dental clinic.', { adapter, llm: llmMock, mode: 'llm' });
  } finally { console.log = origLog; }
  const afterLlmLines = logs.filter(l => l.includes('AFTER_LLM'));
  assert(afterLlmLines.length > 0, 'expected AFTER_LLM lines to have been logged');
  for (const line of afterLlmLines) {
    assert(!line.includes('SECRET_EVIDENCE_TEXT_MARKER'), 'AFTER_LLM leaked RAG evidence text');
    assert(!line.includes('SECRET_RESPONSE_TEXT_MARKER'), 'AFTER_LLM leaked response content');
    assert(!/api[_-]?key/i.test(line), 'AFTER_LLM mentions api key');
    assert(!/authorization/i.test(line), 'AFTER_LLM mentions authorization header');
    assert(!/bearer/i.test(line), 'AFTER_LLM mentions bearer token');
  }
});

// ===== 13. contenido funcional permanece idéntico =====
t('FUNCTIONAL_OUTPUT_PARITY: same mock LLM produces identical functional content with instrumentation active', async () => {
  // Deliberately OLD-shape mock (no usage_detail/finish_reason) to prove parity with pre-10AB behavior.
  const mockLLM = validatedMockLLM();
  const kb = { async retrieveStrategyFAsync() { return { top5: Array.from({ length: 5 }, (_, i) => ({ rank: i + 1, chunk_id: 'c' + i, source_pdf_name: 'S.pdf', pdf_page_refs: '1', content: 'e' + i, original_query_cosine: 0.6, rag_decision: 'CITE', quality_status: 'OK', warning_flags: [] })), advisory_top1_cosine: 0.6 }; }, buildStrategyFEvidence(raw) { const hits = raw.top5 || []; return { evidenceText: hits.map(h => h.content).join('\n'), hits, advisoryTop1Cosine: raw.advisory_top1_cosine, pipeline: 'Strategy-F', corpus: 'kb_chunks_v2' }; } };
  const adapter = new AgentV1Adapter({ kb });
  const r = await H.run('Create a client acquisition campaign for a dental clinic.', { adapter, llm: mockLLM, mode: 'llm' });
  assert.strictEqual(r.workflow_state_status, 'COMPLETE');
  assert.strictEqual(r.node_outputs.length, 8);
  assert.strictEqual(r.cost.model_calls, 8);
  assert.strictEqual(r.cost.tokens.prompt, 80, 'legacy cost.tokens.prompt accounting must be unaffected by 10AB');
  assert.strictEqual(r.cost.tokens.completion, 80);
  assert.strictEqual(r.bindings.ads, 'METHOD_META_ADS');
  assert.strictEqual(r.bindings.whatsapp_conversion, 'METHOD_WHATSAPP_SALES');
  for (const n of r.node_outputs) { assert(n.output.findings.length === 1); assert.strictEqual(n.output.findings[0].claim, 'grounded finding'); }
});

// ===== 14. ASTRA-10X parallelism permanece intacto =====
t('ASTRA-10X PARITY: wave-mates still overlap in wall-clock time after 10AB instrumentation', async () => {
  const events = [];
  const NODE_QUERY_MAP = { market_context: 'market context', icp: 'ideal customer profile', offer: 'offer design', funnel: 'funnel design', creative_strategy: 'creative strategy', ads: 'meta ads', whatsapp_conversion: 'whatsapp sales', measurement: 'conversion measurement' };
  const kb = {
    async retrieveStrategyFAsync(query) {
      const node = Object.keys(NODE_QUERY_MAP).find(id => query.toLowerCase().includes(NODE_QUERY_MAP[id]));
      events.push({ node, phase: 'start', t: Date.now() });
      await new Promise(res => setTimeout(res, 25));
      events.push({ node, phase: 'end', t: Date.now() });
      const hits = Array.from({ length: 5 }, (_, i) => ({ rank: i + 1, chunk_id: 'c' + i, source_pdf_name: 'S.pdf', pdf_page_refs: '1', content: 'e', original_query_cosine: 0.6, rag_decision: 'CITE', quality_status: 'OK', warning_flags: [] }));
      return { top5: hits, advisory_top1_cosine: 0.6 };
    },
    buildStrategyFEvidence(raw) { const hits = raw.top5 || []; return { evidenceText: hits.map(h => h.content).join('\n'), hits, advisoryTop1Cosine: raw.advisory_top1_cosine, pipeline: 'Strategy-F', corpus: 'kb_chunks_v2' }; },
  };
  const adapter = new AgentV1Adapter({ kb });
  const r = await H.run('Create a client acquisition campaign for a dental clinic.', { adapter, llm: validatedMockLLM(), mode: 'llm' });
  assert.strictEqual(r.workflow_state_status, 'COMPLETE');
  const span = node => { const s = events.find(e => e.node === node && e.phase === 'start').t; const e = events.find(e => e.node === node && e.phase === 'end').t; return [s, e]; };
  const overlaps = (a, b) => { const [s1, e1] = span(a); const [s2, e2] = span(b); return s1 < e2 && s2 < e1; };
  assert(overlaps('funnel', 'creative_strategy'), 'ASTRA-10X wave-4 parallelism regressed after 10AB');
  assert(overlaps('ads', 'whatsapp_conversion'), 'ASTRA-10X wave-5 parallelism regressed after 10AB');
});

(async () => {
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; fails.push(name + ' :: ' + e.message); console.log('FAIL', name, '::', e.message); }
  }
  console.log(`\nASTRA10AB_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) { console.log('FAILURES:\n' + fails.join('\n')); process.exit(1); }
})();
