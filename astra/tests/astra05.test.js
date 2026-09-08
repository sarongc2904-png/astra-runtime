'use strict';
// ASTRA-05 offline tests (mock LLM + mock adapter; no live API).
const assert = require('assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const H = require('../src/workflows/marketing_campaign_360_hardened');
const LLM = require('../src/specialists/llm_specialists');
const exec = require('../src/llm/llm_executor');
const scorerV2 = require('../src/router/method_scorer_v2');
let pass = 0, fail = 0; const fails = [];
function t(n, fn) { return Promise.resolve().then(fn).then(() => { pass++; console.log('PASS', n); }).catch(e => { fail++; fails.push(n + ' :: ' + e.message); console.log('FAIL', n, '::', e.message); }); }

function specTypeFromSystem(sys) { const m = /You are ASTRA's ([A-Z_]+)/.exec(sys); return m ? m[1] : 'UNKNOWN'; }
// valid structured mock LLM
function mockLLM(state = {}) {
  return async (system, user, opts) => {
    const st = specTypeFromSystem(system);
    const current = /META_ADS/.test(st) ? ['CAPI', 'Advantage+', 'current attribution'] : (/WHATSAPP/.test(st) ? ['current WhatsApp API mechanics', 'provider-specific behavior'] : []);
    const payload = { note: 'structured for ' + st, business_specific: true };
    ['problem_context', 'pains', 'value_proposition', 'stages', 'core_idea', 'campaign_objective', 'qualification', 'primary_outcome', 'limitations'].forEach(k => payload[k] = payload[k] || (k === 'limitations' ? ['coverage=MODERATE'] : (st.toLowerCase() + ':' + k)));
    const obj = { findings: [{ claim: 'grounded finding', support_class: 'DIRECTLY_SUPPORTED', evidence_ref: 'E1' }], recommendations: [{ recommendation: 'specific action for ' + st, support_class: 'INFERENCE', basis: 'method' }], decisions: [{ decision: 'd', rationale: 'r' }], assumptions: ['needs USER_PROVIDED_FACTS: price'], conflicts: [], confidence: 0.5, current_research_required: current, downstream_payload: payload };
    return { raw: JSON.stringify(obj), usage: { prompt: 100, completion: 60 } };
  };
}
function mockAdapter() { return { retrieve(q) { const hits = Array.from({ length: 5 }, (_, i) => ({ chunk_id: 'c' + i, source_id: 'SRC', source_pdf_name: 'S.pdf', text: 'evidence ' + q, cosine: 0.6, source_class: 'INTERNAL_KNOWLEDGE' })); return { evidenceText: hits.map(h => h.text).join('\n'), hits, corpus: 'kb_chunks_v2', pipeline: 'Strategy-F', read_only: true }; } }; }

(async () => {
  // structured LLM output validation
  await t('llm executor validates good schema', async () => { const r = await exec.execute({ system: 's', user: 'u', schema: { required: ['a'], arrays: ['a'] }, llm: async () => ({ raw: JSON.stringify({ a: [1] }), usage: null }) }); assert(r.ok && r.value.a.length === 1); });
  await t('llm executor fail-closed on bad schema after retry budget', async () => { let calls = 0; const r = await exec.execute({ system: 's', user: 'u', schema: { required: ['a'] }, llm: async () => { calls++; return { raw: '{"b":1}', usage: null }; } }); assert(!r.ok && r.fail_closed && r.attempts === 1 + exec.RETRY_BUDGET && calls === 1 + exec.RETRY_BUDGET); });
  await t('llm executor bounded retry then success', async () => { let c = 0; const r = await exec.execute({ system: 's', user: 'u', schema: { required: ['a'] }, llm: async () => { c++; return { raw: c === 1 ? 'not json' : '{"a":1}', usage: null }; } }); assert(r.ok && r.retries === 1 && r.attempts === 2); });

  const R = await H.run('Create a client acquisition campaign for a laser hair removal clinic.', { adapter: mockAdapter(), llm: mockLLM(), mode: 'llm' });
  await t('hardened workflow completes (LLM mode, mock)', async () => assert.strictEqual(R.workflow_state_status, 'COMPLETE'));
  await t('9 nodes executed + node order', async () => { assert(R.mandatory_nodes_executed === 9); assert.deepStrictEqual(R.node_order[5], 'ads'); assert.strictEqual(R.node_order[6], 'whatsapp_conversion'); });
  await t('ads binding METHOD_META_ADS enforced', async () => assert.strictEqual(R.bindings.ads, 'METHOD_META_ADS'));
  await t('whatsapp binding METHOD_WHATSAPP_SALES enforced', async () => assert.strictEqual(R.bindings.whatsapp_conversion, 'METHOD_WHATSAPP_SALES'));
  await t('LLM specialists operational (generation=LLM)', async () => assert(R.node_outputs.every(n => n.output.generation === 'LLM')));
  await t('evidence grounding: findings carry support_class', async () => assert(R.node_outputs.every(n => n.output.findings.every(f => f.support_class))));
  await t('provenance preserved (evidence_used chunk ids)', async () => assert(R.node_outputs.every(n => n.output.evidence_used.length > 0)));
  await t('bounded context per node (<=5)', async () => assert(R.node_outputs.every(n => n.evidence_count <= 5)));
  await t('CURRENT_RESEARCH_REQUIRED for meta + whatsapp', async () => { const a = R.node_outputs.find(n => n.work_unit_id === 'ads').output; const w = R.node_outputs.find(n => n.work_unit_id === 'whatsapp_conversion').output; assert(a.current_research_required.length > 0 && w.current_research_required.length > 0); });
  await t('current_research surfaced in synthesis', async () => assert(R.synthesis.deliverable['17_current_research_required'].length > 0));
  await t('synthesis v2 coherent 18 sections + reconciled', async () => assert(R.synthesis.section_count === 18 && R.synthesis.coherent && R.synthesis.reconciled && R.synthesis.not_a_concatenation));
  await t('cost/context tracking present', async () => { assert(R.cost.model_calls === 8 && R.cost.tokens.completion > 0 && Object.keys(R.cost.by_tier).length > 0 && R.cost.evidence_chars_total >= 0); });
  await t('no unsupported method winner (no Velocity/Course)', async () => { const p = Object.values(R.selected_methods_by_node).map(m => m.primary_method); assert(!p.includes('METHOD_VELOCITY') && !p.includes('METHOD_COURSE_DESIGN')); });

  // method scoring v2: specific beats generic
  await t('scorer v2: specific method beats generic same-domain', async () => {
    const cands = [
      { method_id: 'M_GENERIC', domain: 'X', evidence_refs: [{}], confidence: 0.5, primary_jobs: ['general marketing help'], best_for: [], funnel_stage: [], business_stage: [], limitations: [], subdomain: '', method_name: 'Generic' },
      { method_id: 'M_SPECIFIC', domain: 'X', evidence_refs: [{}], confidence: 0.5, primary_jobs: ['whatsapp appointment conversion qualification objection'], best_for: ['whatsapp conversion appointment'], funnel_stage: [], business_stage: [], limitations: [], subdomain: 'whatsapp', method_name: 'WhatsApp Specific' },
    ];
    const sel = scorerV2.select({ candidates: cands, domain: 'X', sub_intent: 'whatsapp conversion qualification appointment objection', node_query: 'whatsapp conversion' });
    assert.strictEqual(sel.primary_method, 'M_SPECIFIC');
  });
  await t('scorer v2: evidence-poor excluded upstream (empty -> insufficient)', async () => { const sel = scorerV2.select({ candidates: [], domain: 'X', sub_intent: 'x' }); assert(sel.primary_method === null && sel.state === 'INSUFFICIENT_EVIDENCE'); });
  await t('scorer v2: no universal winner (different sub-intent -> different top)', async () => {
    const cands = [
      { method_id: 'M_ADS', domain: 'X', evidence_refs: [{}], confidence: 0.5, primary_jobs: ['meta ads campaign objective'], best_for: ['meta ads acquisition'], funnel_stage: [], business_stage: [], limitations: [], subdomain: 'ads', method_name: 'Ads' },
      { method_id: 'M_SALES', domain: 'X', evidence_refs: [{}], confidence: 0.5, primary_jobs: ['whatsapp sales closing objection'], best_for: ['sales conversion'], funnel_stage: [], business_stage: [], limitations: [], subdomain: 'sales', method_name: 'Sales' },
    ];
    const a = scorerV2.select({ candidates: cands, domain: 'X', sub_intent: 'meta ads campaign acquisition', node_query: 'ads' }).primary_method;
    const b = scorerV2.select({ candidates: cands, domain: 'X', sub_intent: 'whatsapp sales closing objection', node_query: 'sales' }).primary_method;
    assert(a === 'M_ADS' && b === 'M_SALES');
  });

  // multi-vertical (deterministic mode, mock adapter) -> different briefs complete
  for (const [label, req] of [['dental', 'Campaign for a dental clinic'], ['restaurant', 'Campaign for a local restaurant'], ['infoproduct', 'Launch a digital infoproduct course']]) {
    await t('multi-vertical completes: ' + label, async () => { const r = await H.run(req, { adapter: mockAdapter(), mode: 'deterministic' }); assert(r.workflow_state_status === 'COMPLETE' && r.bindings.ads === 'METHOD_META_ADS' && r.bindings.whatsapp_conversion === 'METHOD_WHATSAPP_SALES'); });
  }

  // missing-evidence fail closed (forced binding evidence-poor via temp registry)
  await t('fail closed when forced binding evidence-poor', async () => {
    const reg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'methods', 'registry.json'), 'utf8'));
    for (const m of reg.methods) if (m.method_id === 'METHOD_META_ADS') { m.evidence_refs = []; m.mapping_status = 'DISCOVERED'; }
    const tmp = path.join(os.tmpdir(), 'a05reg_' + Date.now() + '.json'); fs.writeFileSync(tmp, JSON.stringify(reg));
    let threw = false; try { await H.run('Create a campaign for a dental clinic', { adapter: mockAdapter(), mode: 'deterministic', registryPath: tmp }); } catch (e) { threw = /forced binding unavailable/.test(e.message); }
    assert(threw);
  });
  await t('LLM specialist fail-closed propagates (bad schema)', async () => {
    let threw = false;
    try { await H.run('Create a campaign for a dental clinic', { adapter: mockAdapter(), mode: 'llm', llm: async () => ({ raw: '{"bad":1}', usage: null }) }); } catch (e) { threw = /fail-closed/.test(e.message); }
    assert(threw);
  });

  console.log(`\nASTRA05_TEST_RESULT pass=${pass} fail=${fail}`);
  if (fail) { console.log(fails.join('\n')); process.exit(1); }
})();
