'use strict';
// ASTRA-05 live scenarios: 2 full LLM E2E (laser + infoproduct) + 3 verticals (deterministic, live retrieval),
// plus deterministic-vs-LLM comparison on the laser scenario. Machine-readable outputs.
const fs = require('fs'); const path = require('path');
const H = require('../src/workflows/marketing_campaign_360_hardened');
const DIR = __dirname;

const SCENARIOS = [
  { id: 'laser', input: 'Create a client acquisition campaign for a laser hair removal clinic.', mode: 'llm' },
  { id: 'infoproduct', input: 'Create a launch campaign for a digital infoproduct course on productivity.', mode: 'llm' },
  { id: 'dental', input: 'Create a client acquisition campaign for a dental clinic.', mode: 'deterministic' },
  { id: 'restaurant', input: 'Create a customer acquisition campaign for a local restaurant.', mode: 'deterministic' },
  { id: 'b2b', input: 'Create a lead generation campaign for a B2B marketing services agency.', mode: 'deterministic' },
];

function nodeMetrics(nodeOut, brief) {
  const out = nodeOut.output;
  const bizTokens = String(brief.business_type || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4);
  const text = JSON.stringify(out.downstream_payload || {}).toLowerCase() + ' ' + JSON.stringify(out.recommendations || []).toLowerCase();
  const platformTerms = ['capi', 'advantage+', 'attribution', ' api ', 'provider'];
  const crText = JSON.stringify(out.current_research_required || []).toLowerCase();
  const fabricationRisk = platformTerms.filter(tm => text.includes(tm) && !crText.includes(tm.trim())).length;
  return {
    specificity: (out.recommendations || []).length + (out.findings || []).length,
    business_term_hits: bizTokens.filter(t => text.includes(t)).length,
    evidence_grounding: (out.findings || []).filter(f => f.support_class === 'DIRECTLY_SUPPORTED' || f.source_class === 'INTERNAL_KNOWLEDGE').length,
    evidence_used: (out.evidence_used || []).length,
    method_used: out.method_used,
    current_research_count: (out.current_research_required || []).length,
    fabrication_risk: fabricationRisk,
    downstream_usefulness: Object.keys(out.downstream_payload || {}).length,
    generation: out.generation || 'DETERMINISTIC',
  };
}

(async () => {
  const filter = (process.env.SCENARIO_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
  const active = filter.length ? SCENARIOS.filter(s => filter.includes(s.id)) : SCENARIOS;
  const results = {}; const costs = {};
  for (const s of active) {
    try {
      const r = await H.run(s.input, { mode: s.mode, retrieve: true });
      results[s.id] = {
        mode: s.mode, status: r.workflow_state_status, nodes: r.mandatory_nodes_executed, bindings: r.bindings,
        synthesis_sections: r.synthesis.section_count, synthesis_coherent: r.synthesis.coherent,
        current_research_required: r.synthesis.deliverable['17_current_research_required'],
        selected_methods: Object.fromEntries(Object.entries(r.selected_methods_by_node).map(([k, v]) => [k, v.primary_method])),
        per_node_metrics: r.node_outputs.map(n => ({ node: n.work_unit_id, ...nodeMetrics(n, r.brief) })),
      };
      costs[s.id] = r.cost;
      console.log(`${s.id} [${s.mode}] ${r.workflow_state_status} nodes=${r.mandatory_nodes_executed}/9 ads=${r.bindings.ads} wa=${r.bindings.whatsapp_conversion} llm_calls=${r.cost.model_calls} tokens=${r.cost.tokens.completion}`);
      if (s.id === 'laser') fs.writeFileSync(path.join(DIR, 'laser_llm_full.json'), JSON.stringify(r.synthesis.deliverable, null, 2) + '\n');
      if (s.id === 'infoproduct') fs.writeFileSync(path.join(DIR, 'infoproduct_llm_full.json'), JSON.stringify(r.synthesis.deliverable, null, 2) + '\n');
    } catch (e) { results[s.id] = { error: e.message }; console.log(`${s.id} ERROR ${e.message}`); }
  }
  fs.writeFileSync(path.join(DIR, 'scenario_results.json'), JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2) + '\n');
  fs.writeFileSync(path.join(DIR, 'cost_tracking_validation.json'), JSON.stringify({ generated_at: new Date().toISOString(), by_scenario: costs,
    tracks: ['mode', 'model_calls', 'retries', 'by_tier', 'tokens', 'evidence_chars_total', 'per_node'], monetary_cost_invented: false }, null, 2) + '\n');

  // deterministic-vs-LLM comparison on laser (LLM already run above; run deterministic laser live)
  const laserLLM = results['laser'];
  let comp = { note: 'laser LLM run failed; comparison skipped' };
  if (laserLLM && !laserLLM.error) {
    const det = await H.run(SCENARIOS[0].input, { mode: 'deterministic', retrieve: true });
    const detMetrics = det.node_outputs.map(n => ({ node: n.work_unit_id, ...nodeMetrics(n, det.brief) }));
    const per_node = laserLLM.per_node_metrics.map((llm, i) => {
      const d = detMetrics[i];
      return { node: llm.node,
        deterministic: d, llm: llm,
        llm_more_specific: llm.specificity >= d.specificity && llm.business_term_hits >= d.business_term_hits,
        grounding_equal_or_better: llm.evidence_grounding >= d.evidence_grounding && llm.evidence_used >= d.evidence_used,
        no_fabrication_either: d.fabrication_risk === 0 && llm.fabrication_risk === 0,
        method_aligned: llm.method_used === d.method_used };
    });
    comp = { generated_at: new Date().toISOString(), dimensions: ['specificity', 'business_term_hits', 'evidence_grounding', 'evidence_used', 'method_used', 'current_research_count', 'fabrication_risk', 'downstream_usefulness'],
      per_node,
      llm_materially_improved: per_node.filter(p => p.llm_more_specific).length >= 6 && per_node.every(p => p.no_fabrication_either) && per_node.every(p => p.method_aligned),
      fabrication_risk_total_llm: laserLLM.per_node_metrics.reduce((s, n) => s + n.fabrication_risk, 0),
      fabrication_risk_total_det: detMetrics.reduce((s, n) => s + n.fabrication_risk, 0) };
  }
  fs.writeFileSync(path.join(DIR, 'deterministic_vs_llm_comparison.json'), JSON.stringify(comp, null, 2) + '\n');
  console.log('SCENARIOS_DONE llm_improved=' + (comp.llm_materially_improved) + ' fab_llm=' + comp.fabrication_risk_total_llm);
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
