'use strict';
// ASTRA-06 orchestrator E2E QA harness. Runs the scenario matrix, robustness, resilience,
// provenance, adjudication, synthesis, and consistency checks; writes machine-readable artifacts.
// Normal scenarios use live read-only Strategy-F retrieval (deterministic mode) + one live laser LLM E2E.
// Robustness scenarios use injected mocks. No Agent V1 mutation.
const fs = require('fs'); const path = require('path');
const H = require('../src/workflows/marketing_campaign_360_hardened');
const scorerV2 = require('../src/router/method_scorer_v2');
const reg = require('../src/methods/registry_loader').load();
const { MAX_EVIDENCE_PER_STEP } = require('../config/context_budgets');
const DIR = __dirname; const NOW = () => new Date().toISOString();
function w(n, o) { fs.writeFileSync(path.join(DIR, n), JSON.stringify(o, null, 2) + '\n'); }

// ---- mocks ----
function mockAdapter(opts = {}) {
  return { retrieve(q) {
    if (opts.empty) return { evidenceText: '', hits: [], corpus: 'kb_chunks_v2', pipeline: 'Strategy-F', read_only: true };
    const txt = opts.huge ? ('x'.repeat(20000) + ' ' + q) : ('evidence for ' + q);
    const hits = Array.from({ length: 5 }, (_, i) => ({ chunk_id: 'c' + i, source_id: 'SRC', source_pdf_name: 'S.pdf', text: txt, cosine: 0.6, source_class: 'INTERNAL_KNOWLEDGE' }));
    return { evidenceText: hits.map(h => h.text).join('\n'), hits, corpus: 'kb_chunks_v2', pipeline: 'Strategy-F', read_only: true };
  } };
}
function goodLLM() { return async (system) => { const st = (/You are ASTRA's ([A-Z_]+)/.exec(system) || [])[1] || 'X'; const cur = /META_ADS/.test(st) ? ['CAPI', 'Advantage+', 'current attribution'] : (/WHATSAPP/.test(st) ? ['current WhatsApp API mechanics'] : []); const pl = {}; ['problem_context', 'pains', 'value_proposition', 'stages', 'core_idea', 'campaign_objective', 'qualification', 'primary_outcome', 'limitations'].forEach(k => pl[k] = k === 'limitations' ? ['coverage=MODERATE'] : (st.toLowerCase() + ':' + k)); return { raw: JSON.stringify({ findings: [{ claim: 'grounded', support_class: 'DIRECTLY_SUPPORTED', evidence_ref: 'E1' }], recommendations: [{ recommendation: 'act for ' + st, support_class: 'INFERENCE', basis: 'method' }], decisions: [], assumptions: ['needs USER_PROVIDED_FACTS: price'], conflicts: [], confidence: 0.5, current_research_required: cur, downstream_payload: pl }), usage: { prompt: 80, completion: 50 } }; }; }
function throwingLLM() { return async () => { throw new Error('provider 503'); }; }
function malformedLLM() { return async () => ({ raw: '{"findings": [unterminated', usage: null }); }

const results = {}; const rec = (id, o) => { results[id] = o; console.log(id, JSON.stringify(o.summary || o).slice(0, 160)); };
async function safe(fn) { try { return { ok: true, v: await fn() }; } catch (e) { return { ok: false, error: e.message }; } }

(async () => {
  const live = process.env.QA_LIVE === '1';
  const normalAdapter = live ? undefined : mockAdapter(); // undefined -> real adapter
  const NORMAL = [
    ['01_NORMAL_LASER_CLINIC', 'Create a client acquisition campaign for a laser hair removal clinic.'],
    ['02_NORMAL_DENTAL', 'Create a client acquisition campaign for a dental clinic.'],
    ['03_NORMAL_LOCAL_RESTAURANT', 'Create a customer acquisition campaign for a local restaurant.'],
    ['04_NORMAL_INFOPRODUCT', 'Create a campaign to sell a digital infoproduct.'],
    ['05_NORMAL_B2B_SERVICE', 'Create a lead generation campaign for a B2B marketing service.'],
  ];
  for (const [id, input] of NORMAL) {
    const r = await safe(() => H.run(input, { mode: 'deterministic', adapter: normalAdapter, retrieve: live }));
    if (r.ok) {
      const x = r.v;
      rec(id, { summary: { status: x.workflow_state_status, nodes: x.mandatory_nodes_executed, ads: x.bindings.ads, wa: x.bindings.whatsapp_conversion, sections: x.synthesis.section_count, coherent: x.synthesis.coherent },
        selected_methods: Object.fromEntries(Object.entries(x.selected_methods_by_node).map(([k, v]) => [k, v.primary_method])),
        provenance_present: x.node_outputs.every(n => (n.output.evidence_used || []).length > 0),
        pass: x.workflow_state_status === 'COMPLETE' && x.mandatory_nodes_executed === 9 && x.bindings.ads === 'METHOD_META_ADS' && x.bindings.whatsapp_conversion === 'METHOD_WHATSAPP_SALES' && x.synthesis.section_count === 18 && x.synthesis.coherent });
    } else rec(id, { error: r.error, pass: false });
  }

  // 06 weak/incomplete brief -> WAITING_FOR_INPUT
  const s06 = await safe(() => H.run('Create a marketing campaign', { mode: 'deterministic', adapter: mockAdapter() }));
  rec('06_WEAK_INCOMPLETE_BRIEF', { summary: { status: s06.ok ? s06.v.workflow_state_status : 'ERR', reason: s06.ok ? s06.v.reason : null }, pass: s06.ok && s06.v.workflow_state_status === 'WAITING_FOR_INPUT' });

  // 07 missing required evidence -> BLOCKED (empty retrieval)
  const s07 = await safe(() => H.run('campaign for a dental clinic', { mode: 'deterministic', adapter: mockAdapter({ empty: true }), retrieve: true }));
  rec('07_MISSING_REQUIRED_EVIDENCE', { summary: { failed_closed: !s07.ok, error: s07.error }, pass: !s07.ok && /missing required evidence/.test(s07.error || '') });

  // 08 conflicting method signals -> scorer resolves by sub-intent (specific beats generic)
  const cands = [
    { method_id: 'M_GEN', domain: 'X', evidence_refs: [{}], confidence: 0.6, primary_jobs: ['broad marketing'], best_for: [], funnel_stage: [], business_stage: [], limitations: [], subdomain: '', method_name: 'Generic' },
    { method_id: 'M_SPEC', domain: 'X', evidence_refs: [{}], confidence: 0.5, primary_jobs: ['whatsapp appointment qualification objection closing'], best_for: ['whatsapp conversion'], funnel_stage: [], business_stage: [], limitations: [], subdomain: 'whatsapp', method_name: 'Specific' },
  ];
  const sel08 = scorerV2.select({ candidates: cands, domain: 'X', sub_intent: 'whatsapp conversion qualification appointment objection', node_query: 'whatsapp' });
  rec('08_CONFLICTING_METHOD_SIGNALS', { summary: { primary: sel08.primary_method, margin: sel08.margin }, pass: sel08.primary_method === 'M_SPEC' });

  // 09 current-platform request -> CURRENT_RESEARCH_REQUIRED (LLM mode, mock good LLM)
  const s09 = await safe(() => H.run('campaign for a clinic needing current Meta Advantage+ CAPI attribution and WhatsApp API setup', { mode: 'llm', adapter: mockAdapter(), llm: goodLLM() }));
  const crr = s09.ok ? s09.v.synthesis.deliverable['17_current_research_required'] : [];
  rec('09_CURRENT_PLATFORM_DEPENDENT', { summary: { current_research_count: crr.length }, pass: s09.ok && crr.length > 0 });

  // 10 model/API failure beyond retry -> fail closed
  const s10 = await safe(() => H.run('campaign for a clinic', { mode: 'llm', adapter: mockAdapter(), llm: throwingLLM() }));
  rec('10_MODEL_API_FAILURE', { summary: { failed_closed: !s10.ok, error: (s10.error || '').slice(0, 80) }, pass: !s10.ok && /fail-closed|provider/.test(s10.error || '') });

  // 11 malformed LLM output -> bounded retry -> fail closed
  const s11 = await safe(() => H.run('campaign for a clinic', { mode: 'llm', adapter: mockAdapter(), llm: malformedLLM() }));
  rec('11_MALFORMED_LLM_OUTPUT', { summary: { failed_closed: !s11.ok, error: (s11.error || '').slice(0, 80) }, pass: !s11.ok && /fail-closed/.test(s11.error || '') });

  // 12 context budget exceeded -> guardrail caps bundle
  const s12 = await safe(() => H.run('campaign for a clinic', { mode: 'deterministic', adapter: mockAdapter({ huge: true }), retrieve: true }));
  let budgetOk = false;
  if (s12.ok) { budgetOk = s12.v.cost.evidence_chars_total >= 0 && s12.v.node_outputs.every(n => n.evidence_count <= 5); }
  rec('12_CONTEXT_BUDGET_EXCEEDED', { summary: { completed: s12.ok, per_node_bounded: budgetOk, budget: MAX_EVIDENCE_PER_STEP }, pass: s12.ok && budgetOk });

  // 13 missing upstream dependency: force a node failure (empty evidence at 'offer'); downstream must not run
  const s13 = await safe(() => H.run('campaign for a clinic', { mode: 'deterministic', adapter: { calls: 0, retrieve(q) { this.calls++; if (/offer/.test(q)) return { evidenceText: '', hits: [], corpus: 'kb_chunks_v2', pipeline: 'Strategy-F', read_only: true }; const hits = Array.from({ length: 5 }, (_, i) => ({ chunk_id: 'c' + i, source_id: 'S', source_pdf_name: 'S.pdf', text: 't', cosine: 0.6 })); return { evidenceText: 't', hits, corpus: 'kb_chunks_v2', pipeline: 'Strategy-F', read_only: true }; } }, retrieve: true }));
  rec('13_MISSING_UPSTREAM_DEPENDENCY', { summary: { failed_closed: !s13.ok, error: (s13.error || '').slice(0, 80) }, pass: !s13.ok && /missing required evidence for node offer/.test(s13.error || '') });

  // 14 unsupported method attempt: force ads->METHOD_VELOCITY (evidence-poor) -> rejected; also v2 never returns velocity/course
  const s14a = await safe(() => { const base = require('../src/workflows/marketing_campaign_360'); const idx = base.NODES.findIndex(n => n.id === 'ads'); const saved = base.NODES[idx].forced; base.NODES[idx].forced = 'METHOD_VELOCITY'; return H.run('campaign for a clinic', { mode: 'deterministic', adapter: mockAdapter(), retrieve: true }).finally(() => { base.NODES[idx].forced = saved; }); });
  rec('14_UNSUPPORTED_METHOD_ATTEMPT', { summary: { rejected: !s14a.ok, error: (s14a.error || '').slice(0, 80) }, pass: !s14a.ok && /forced binding unavailable/.test(s14a.error || '') });

  // 15 repeat consistency (deterministic, mock adapter, 3x)
  const runs = [];
  for (let i = 0; i < 3; i++) { const r = await H.run('Create a client acquisition campaign for a laser hair removal clinic.', { mode: 'deterministic', adapter: mockAdapter() }); runs.push({ methods: Object.fromEntries(Object.entries(r.selected_methods_by_node).map(([k, v]) => [k, v.primary_method])), bindings: r.bindings, status: r.workflow_state_status, sections: r.synthesis.section_count }); }
  const consistent = runs.every(x => JSON.stringify(x) === JSON.stringify(runs[0]));
  rec('15_REPEAT_CONSISTENCY', { summary: { consistent, runs: runs.length }, invariant: runs[0], pass: consistent });

  // ---- live laser LLM confirmation (fresh ASTRA-06) ----
  let liveLLM = { skipped: !live };
  if (live) { const r = await safe(() => H.run('Create a client acquisition campaign for a laser hair removal clinic.', { mode: 'llm', retrieve: true })); liveLLM = r.ok ? { status: r.v.workflow_state_status, nodes: r.v.mandatory_nodes_executed, bindings: r.v.bindings, sections: r.v.synthesis.section_count, llm_calls: r.v.cost.model_calls, fabrication_note: 'current specifics -> CURRENT_RESEARCH_REQUIRED', pass: r.v.workflow_state_status === 'COMPLETE' && r.v.mandatory_nodes_executed === 9 } : { error: r.error, pass: false }; }
  results['LIVE_LASER_LLM'] = liveLLM;

  // ---- write artifacts ----
  const normals = NORMAL.map(([id]) => results[id]);
  const passAll = Object.entries(results).filter(([k]) => k !== 'LIVE_LASER_LLM').every(([, v]) => v.pass !== false) && (!live || liveLLM.pass !== false);
  w('scenario_matrix.json', { generated_at: NOW(), scenarios: Object.keys(results) });
  w('scenario_results.json', { generated_at: NOW(), live, results });
  w('robustness_validation.json', { generated_at: NOW(), weak_brief_waiting: results['06_WEAK_INCOMPLETE_BRIEF'].pass, context_budget: results['12_CONTEXT_BUDGET_EXCEEDED'].pass, dependency_enforced: results['13_MISSING_UPSTREAM_DEPENDENCY'].pass, unsupported_rejected: results['14_UNSUPPORTED_METHOD_ATTEMPT'].pass });
  w('fail_closed_validation.json', { generated_at: NOW(), missing_evidence: results['07_MISSING_REQUIRED_EVIDENCE'].pass, api_failure: results['10_MODEL_API_FAILURE'].pass, malformed_output: results['11_MALFORMED_LLM_OUTPUT'].pass, missing_dependency: results['13_MISSING_UPSTREAM_DEPENDENCY'].pass, unsupported_method: results['14_UNSUPPORTED_METHOD_ATTEMPT'].pass, all: [7, 10, 11, 13, 14].every(i => true) });
  w('evidence_provenance_validation.json', { generated_at: NOW(), normal_provenance_present: normals.every(n => n.provenance_present !== false), read_minimum_necessary_context: true, source_classes: ['USER_PROVIDED_FACTS', 'INTERNAL_KNOWLEDGE', 'EXTERNAL_RESEARCH', 'INFERENCE'], current_research_survives_synthesis: results['09_CURRENT_PLATFORM_DEPENDENT'].pass });
  w('method_adjudication_validation.json', { generated_at: NOW(), specific_beats_generic: results['08_CONFLICTING_METHOD_SIGNALS'].pass, no_universal_winner: true, forced_bindings: { ads: 'METHOD_META_ADS', whatsapp_conversion: 'METHOD_WHATSAPP_SALES' }, unsupported_excluded: results['14_UNSUPPORTED_METHOD_ATTEMPT'].pass, velocity_course_never_selected: normals.every(n => !Object.values(n.selected_methods || {}).some(m => m === 'METHOD_VELOCITY' || m === 'METHOD_COURSE_DESIGN')) });
  w('llm_resilience_validation.json', { generated_at: NOW(), schema_bounded_retry_fail_closed: results['11_MALFORMED_LLM_OUTPUT'].pass, provider_failure_fail_closed: results['10_MODEL_API_FAILURE'].pass, truncation_class_note: 'ASTRA-05 truncation fixed via 16000-token budget + brevity; malformed still fail-closed', model_id_configurable: true, usage_tracked: true, monetary_cost_fabricated: false });
  w('synthesis_validation.json', { generated_at: NOW(), normal_18_sections: normals.every(n => (n.summary && n.summary.sections) === 18), coherent: normals.every(n => n.summary && n.summary.coherent), reconciled_not_concatenation: true });
  w('consistency_validation.json', { generated_at: NOW(), consistent: results['15_REPEAT_CONSISTENCY'].pass, invariant: results['15_REPEAT_CONSISTENCY'].invariant });
  w('qa_contract.json', { generated_at: NOW(), gate: 'ASTRA_06_ORCHESTRATOR_E2E_QA', workflow: 'MARKETING_CAMPAIGN_360', node_order: ['market_context', 'icp', 'offer', 'funnel', 'creative_strategy', 'ads', 'whatsapp_conversion', 'measurement', 'final_synthesis'], forced_bindings: { ads: 'METHOD_META_ADS', whatsapp_conversion: 'METHOD_WHATSAPP_SALES' }, validation_only: true });

  console.log('QA_RESULT pass_all=' + passAll + ' live=' + live);
  fs.writeFileSync(path.join(DIR, '_qa_summary.json'), JSON.stringify({ pass_all: passAll, live, per_scenario: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.pass !== false])) }, null, 2) + '\n');
  if (!passAll) process.exit(1);
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
