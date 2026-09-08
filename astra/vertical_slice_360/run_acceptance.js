'use strict';
// ASTRA-04 acceptance: run MARKETING_CAMPAIGN_360 end-to-end on the laser-clinic scenario,
// live read-only Strategy-F retrieval. Writes the required artifacts.
const fs = require('fs');
const path = require('path');
const wf = require('../src/workflows/marketing_campaign_360');
const DIR = __dirname;
const INPUT = 'Create a client acquisition campaign for a laser hair removal clinic.';

const result = wf.run(INPUT, { retrieve: true });

fs.writeFileSync(path.join(DIR, 'vertical_slice_test_input.json'), JSON.stringify({ input: INPUT }, null, 2) + '\n');
fs.writeFileSync(path.join(DIR, 'vertical_slice_test_output.json'), JSON.stringify({
  intent: result.intent, workflow_id: result.workflow_id, node_order: result.node_order,
  mandatory_nodes_executed: result.mandatory_nodes_executed, bindings: result.bindings,
  workflow_state_status: result.workflow_state_status, cost: result.cost,
  deliverable: result.synthesis.deliverable,
}, null, 2) + '\n');
fs.writeFileSync(path.join(DIR, 'node_execution_results.json'), JSON.stringify({
  nodes: result.node_outputs.map(n => ({
    work_unit_id: n.work_unit_id, specialist_type: n.output.specialist_type, method_used: n.method_used, forced: n.forced,
    status: n.output.status, evidence_count: n.evidence_count, evidence_chunk_ids: n.evidence_chunk_ids,
    findings_count: n.output.findings.length, recommendations_count: n.output.recommendations.length,
    current_research_required: n.output.current_research_required, confidence: n.output.confidence,
  })),
}, null, 2) + '\n');
fs.writeFileSync(path.join(DIR, 'synthesis_validation.json'), JSON.stringify({
  section_count: result.synthesis.section_count, missing_sections: result.synthesis.missing_sections,
  coherent: result.synthesis.coherent, not_a_concatenation: result.synthesis.not_a_concatenation,
  methods_preserved: result.synthesis.methods_preserved, evidence_preserved: result.synthesis.evidence_preserved,
  conflicts_surfaced: result.synthesis.conflicts_surfaced,
  current_research_required: result.synthesis.deliverable['17_current_research_required'],
  known_limitations: result.synthesis.deliverable['16_known_limitations'],
}, null, 2) + '\n');
console.log('ACCEPTANCE status=' + result.workflow_state_status + ' nodes=' + result.mandatory_nodes_executed + '/9'
  + ' ads=' + result.bindings.ads + ' whatsapp=' + result.bindings.whatsapp_conversion
  + ' sections=' + result.synthesis.section_count + ' llm_calls=' + result.cost.llm_calls);
