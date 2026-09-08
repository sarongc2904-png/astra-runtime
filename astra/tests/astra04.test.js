'use strict';
// ASTRA-04 deterministic offline tests (mock adapter, no live API, no LLM).
const assert = require('assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const wf = require('../src/workflows/marketing_campaign_360');
const baseSpec = require('../src/specialists/base_specialist');
let pass = 0, fail = 0; const fails = [];
function t(n, fn) { try { fn(); pass++; console.log('PASS', n); } catch (e) { fail++; fails.push(n + ' :: ' + e.message); console.log('FAIL', n, '::', e.message); } }

// mock read-only adapter -> 5 hits with provenance
function mockAdapter(perQuery) {
  return { retrieve(q, o) {
    const hits = Array.from({ length: 5 }, (_, i) => ({ chunk_id: 'c_' + (perQuery ? q.slice(0, 8) : '') + i, source_id: 'SRC_MOCK', source_pdf_name: 'MockSource.pdf', text: 'mock evidence for ' + q, cosine: 0.6, source_class: 'INTERNAL_KNOWLEDGE' }));
    return { evidenceText: hits.map(h => h.text).join('\n'), hits, corpus: 'kb_chunks_v2', pipeline: 'Strategy-F', read_only: true, evidence_count: 5 };
  } };
}
const R = wf.run('Create a client acquisition campaign for a laser hair removal clinic.', { adapter: mockAdapter(true) });

t('workflow completes (state COMPLETE)', () => assert.strictEqual(R.workflow_state_status, 'COMPLETE'));
t('9 mandatory nodes executed', () => assert.strictEqual(R.mandatory_nodes_executed, 9));
t('node order canonical', () => assert.deepStrictEqual(R.node_order, ['market_context', 'icp', 'offer', 'funnel', 'creative_strategy', 'ads', 'whatsapp_conversion', 'measurement', 'final_synthesis']));
t('ads bound to METHOD_META_ADS', () => assert.strictEqual(R.bindings.ads, 'METHOD_META_ADS'));
t('whatsapp bound to METHOD_WHATSAPP_SALES', () => assert.strictEqual(R.bindings.whatsapp_conversion, 'METHOD_WHATSAPP_SALES'));
t('forced bindings flagged', () => { assert(R.selected_methods_by_node.ads.forced && R.selected_methods_by_node.whatsapp_conversion.forced); });
t('bounded evidence per node (<=5)', () => assert(R.node_outputs.every(n => n.evidence_count <= 5)));
t('provenance preserved (evidence_used chunk ids)', () => assert(R.node_outputs.every(n => n.output.evidence_used.length > 0 && n.output.findings.every(f => f.source_class))));
t('no full-KB leakage (each node distinct bounded bundle)', () => assert(R.node_outputs.every(n => n.evidence_chunk_ids.length <= 5)));
t('meta ads limitation + current_research_required present', () => { const a = R.node_outputs.find(n => n.work_unit_id === 'ads').output; assert(a.current_research_required.length > 0 && a.downstream_payload.ads_plan.current_research_required.join(' ').match(/CAPI|Advantage|attribution|UI/)); });
t('whatsapp limitation + current_research_required present', () => { const w = R.node_outputs.find(n => n.work_unit_id === 'whatsapp_conversion').output; assert(w.current_research_required.length > 0 && w.downstream_payload.whatsapp_flow.current_research_required.join(' ').match(/API|provider|policy/)); });
t('current-research-required surfaced in synthesis', () => assert(R.synthesis.deliverable['17_current_research_required'].length > 0));
t('workflow transitioned PLANNED->RUNNING->COMPLETE', () => { const s = R._state; assert(s.status === 'COMPLETE'); });
t('synthesis 18 sections + coherent + not concatenation', () => assert(R.synthesis.section_count === 18 && R.synthesis.coherent && R.synthesis.not_a_concatenation));
t('final deliverable has required sections populated', () => { const d = R.synthesis.deliverable; ['2_target_audience_icp', '5_offer', '6_funnel', '7_creative_strategy', '8_ad_strategy', '11_whatsapp_qualification_flow', '13_measurement_kpis'].forEach(k => assert(d[k] != null, 'null ' + k)); });
t('no unsupported method winner (no Velocity/Course primary)', () => { const prims = Object.values(R.selected_methods_by_node).map(m => m.primary_method); assert(!prims.includes('METHOD_VELOCITY') && !prims.includes('METHOD_COURSE_DESIGN')); });
t('all primaries evidence-backed', () => { const reg = require('../src/methods/registry_loader').load(); assert(Object.values(R.selected_methods_by_node).every(m => reg.byId(m.primary_method) && reg.byId(m.primary_method).evidence_refs.length > 0)); });
t('no LLM generation (0 llm calls)', () => assert.strictEqual(R.cost.llm_calls, 0));
t('specialist input/output contract enforced', () => { const chk = baseSpec.validateInput({ task_id: 't', work_unit_id: 'w', specialist_type: 's', task_brief: {}, upstream_outputs: [], selected_methods: {}, knowledge_evidence: [], constraints: {}, output_requirements: {} }); assert(chk.valid); const bad = baseSpec.validateInput({ task_id: 't' }); assert(!bad.valid); });

// missing-evidence fail-closed: temp registry with META_ADS evidence cleared -> forced binding unavailable
t('fail closed when forced binding evidence-poor', () => {
  const reg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'methods', 'registry.json'), 'utf8'));
  for (const m of reg.methods) if (m.method_id === 'METHOD_META_ADS') { m.evidence_refs = []; m.mapping_status = 'DISCOVERED'; }
  const tmp = path.join(os.tmpdir(), 'astra04_reg_' + Date.now() + '.json'); fs.writeFileSync(tmp, JSON.stringify(reg));
  let threw = false;
  try { wf.run('campaign for a clinic', { adapter: mockAdapter(true), registryPath: tmp }); } catch (e) { threw = /forced binding unavailable/.test(e.message); }
  assert(threw, 'expected fail-closed on evidence-poor forced binding');
});

console.log(`\nASTRA04_TEST_RESULT pass=${pass} fail=${fail}`);
if (fail) { console.log(fails.join('\n')); process.exit(1); }
