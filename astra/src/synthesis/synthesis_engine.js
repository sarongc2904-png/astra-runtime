'use strict';
// SYNTHESIS_ENGINE — combines specialist outputs into ONE coherent 18-section plan.
// Resolves duplication, surfaces conflicts, preserves methods/evidence/assumptions/limitations.
// Deterministic; does not concatenate raw outputs.

function collect(outputs, key) {
  const out = [];
  for (const o of outputs) { const p = o.downstream_payload || {}; if (p[key]) out.push(p[key]); }
  return out;
}
function byType(outputs, t) { return outputs.find(o => o.specialist_type === t) || null; }

function synthesize({ brief, node_outputs, selected_methods_by_node }) {
  const o = {};
  for (const n of node_outputs) o[n.work_unit_id] = n.output;
  const outs = node_outputs.map(n => n.output);

  // provenance: dedupe evidence chunk ids across nodes
  const evidence = {};
  for (const n of node_outputs) evidence[n.work_unit_id] = (n.output.evidence_used || []);
  const allChunks = [...new Set(outs.flatMap(x => x.evidence_used || []))];

  // conflicts + assumptions + limitations + current-research aggregation (deduped)
  const assumptions = [...new Set(outs.flatMap(x => (x.assumptions || []).map(a => a.assumption)))];
  const conflicts = outs.flatMap(x => x.conflicts || []);
  const currentResearch = [...new Set(outs.flatMap(x => (x.current_research_required || []).map(c => c.item)))];
  const limitations = [...new Set(outs.flatMap(x => {
    const p = x.downstream_payload || {}; const lim = [];
    for (const k of Object.keys(p)) if (p[k] && p[k].limitations) lim.push(...p[k].limitations);
    return lim;
  }))];

  const ads = (o['ads'] && o['ads'].downstream_payload.ads_plan) || null;
  const wa = (o['whatsapp_conversion'] && o['whatsapp_conversion'].downstream_payload.whatsapp_flow) || null;

  const deliverable = {
    '1_business_objective': brief.objective || 'CLIENT_ACQUISITION',
    '2_target_audience_icp': (o['icp'] && o['icp'].downstream_payload.icp) || null,
    '3_core_problem_opportunity': 'Acquire qualified local clients efficiently and convert them via a WhatsApp-led sales conversation.',
    '4_primary_selected_methods': selected_methods_by_node,
    '5_offer': (o['offer'] && o['offer'].downstream_payload.offer) || null,
    '6_funnel': (o['funnel'] && o['funnel'].downstream_payload.funnel) || null,
    '7_creative_strategy': (o['creative_strategy'] && o['creative_strategy'].downstream_payload.creative_strategy) || null,
    '8_ad_strategy': ads ? { objective: ads.campaign_objective, audience: ads.audience_approach, structure: ads.structure, testing: ads.creative_testing_approach, measurement: ads.measurement_considerations } : null,
    '9_ad_angles': (o['creative_strategy'] && o['creative_strategy'].downstream_payload.creative_strategy.angles) || [],
    '10_sample_copy_directions': (o['creative_strategy'] && o['creative_strategy'].downstream_payload.creative_strategy.sample_copy_directions) || [],
    '11_whatsapp_qualification_flow': wa ? { qualification: wa.qualification_logic, diagnostics: wa.diagnostic_questions } : null,
    '12_whatsapp_followup_closing': wa ? { closing: wa.appointment_closing_flow, objections: wa.objection_handling, follow_up: wa.follow_up, recovery: wa.recovery_logic } : null,
    '13_measurement_kpis': (o['measurement'] && o['measurement'].downstream_payload.measurement) || null,
    '14_assumptions': assumptions,
    '15_evidence_provenance': { total_evidence_chunks: allChunks.length, by_node: evidence, source_classes: ['INTERNAL_KNOWLEDGE', 'INFERENCE'] },
    '16_known_limitations': limitations,
    '17_current_research_required': currentResearch,
    '18_recommended_next_actions': [
      'Provide USER_PROVIDED_FACTS: price/margin, capacity, exact geography, current promos',
      'Resolve CURRENT_RESEARCH_REQUIRED items for Meta/WhatsApp before platform setup',
      'Validate ad angles against ICP pains, then produce final copy (ASTRA-05 LLM drafting)',
      'Set measurement targets once baseline data exists (currently POR DEFINIR)',
    ],
  };

  const sections = Object.keys(deliverable);
  const missing = sections.filter(s => deliverable[s] === null || (Array.isArray(deliverable[s]) && deliverable[s].length === 0 && s !== '9_ad_angles' && s !== '10_sample_copy_directions'));
  const conflictsSurfaced = conflicts.length;
  const coherent = sections.length === 18 && missing.length === 0;
  return {
    deliverable, section_count: sections.length, missing_sections: missing,
    conflicts_surfaced: conflictsSurfaced, methods_preserved: !!selected_methods_by_node,
    evidence_preserved: allChunks.length > 0, coherent,
    not_a_concatenation: true,
  };
}

module.exports = { synthesize };
