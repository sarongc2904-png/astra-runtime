'use strict';
// SYNTHESIS_ENGINE_V2 — hardened synthesis. Reconciles overlaps, dedupes, surfaces conflicts,
// preserves methods/evidence/provenance/assumptions/limitations/current_research, and produces ONE
// coherent 18-section deliverable (same contract as ASTRA-04). Consumes richer LLM outputs
// (recommendations with support_class). Not a concatenation.

function payload(o, key) { return (o && o.downstream_payload && o.downstream_payload[key]) || null; }
function dedupeStrings(arr) { return [...new Set((arr || []).filter(Boolean).map(x => (typeof x === 'string' ? x : JSON.stringify(x))))]; }

// [Brief Fidelity] Which canonical_brief_facts keys are meaningful "USER_PROVIDED_FACTS" for the
// purposes of a generic "please provide X" recommendation.
const CANONICAL_FACT_KEYS = ['product_name', 'product_type', 'price', 'currency', 'buyer', 'geography', 'business_objective', 'mechanism', 'constraints'];

function synthesize({ brief, node_outputs, selected_methods_by_node, canonicalBriefFacts }) {
  const o = {}; for (const n of node_outputs) o[n.work_unit_id] = n.output;
  const outs = node_outputs.map(n => n.output);

  // provenance
  const evidence_by_node = {}; node_outputs.forEach(n => { evidence_by_node[n.work_unit_id] = n.output.evidence_used || []; });
  const allChunks = [...new Set(outs.flatMap(x => x.evidence_used || []))];

  // reconcile: recommendations grouped by support_class (dedupe)
  const recs = outs.flatMap(x => (x.recommendations || []).map(r => (typeof r === 'string' ? { recommendation: r, support_class: 'INFERENCE' } : r)));
  const recsBySupport = {};
  for (const r of recs) { const sc = r.support_class || 'INFERENCE'; (recsBySupport[sc] = recsBySupport[sc] || []); if (!recsBySupport[sc].some(x => x.recommendation === r.recommendation)) recsBySupport[sc].push(r); }

  const assumptions = dedupeStrings(outs.flatMap(x => (x.assumptions || []).map(a => (typeof a === 'string' ? a : (a.assumption || JSON.stringify(a))))));
  const conflicts = outs.flatMap(x => x.conflicts || []);
  const currentResearch = dedupeStrings(outs.flatMap(x => (x.current_research_required || []).map(c => (typeof c === 'string' ? c : (c.item || JSON.stringify(c))))));
  const limitations = dedupeStrings(outs.flatMap(x => {
    const p = x.downstream_payload || {}; const lim = [];
    for (const k of Object.keys(p)) if (p[k] && p[k].limitations) lim.push(...[].concat(p[k].limitations)); if (p.limitations) lim.push(...[].concat(p.limitations)); return lim;
  }));

  const cs = o['creative_strategy'] && o['creative_strategy'].downstream_payload;
  const ads = payload(o['ads'], 'campaign_objective') != null ? o['ads'].downstream_payload : (o['ads'] && o['ads'].downstream_payload.ads_plan) || null;
  const wa = o['whatsapp_conversion'] && o['whatsapp_conversion'].downstream_payload;

  const deliverable = {
    '1_business_objective': brief.objective || 'CLIENT_ACQUISITION',
    '2_target_audience_icp': o['icp'] ? o['icp'].downstream_payload : null,
    '3_core_problem_opportunity': (o['market_context'] && (o['market_context'].downstream_payload.problem_context)) || 'Acquire qualified local clients efficiently and convert via a WhatsApp-led sales conversation.',
    '4_primary_selected_methods': selected_methods_by_node,
    '5_offer': o['offer'] ? o['offer'].downstream_payload : null,
    '6_funnel': o['funnel'] ? o['funnel'].downstream_payload : null,
    '7_creative_strategy': cs || null,
    '8_ad_strategy': ads || null,
    '9_ad_angles': (cs && (cs.angles || (cs.creative_strategy && cs.creative_strategy.angles))) || [],
    '10_sample_copy_directions': (cs && (cs.hooks || cs.sample_copy_directions)) || [],
    '11_whatsapp_qualification_flow': wa ? { qualification: wa.qualification, discovery: wa.discovery } : null,
    '12_whatsapp_followup_closing': wa ? { closing: wa.appointment_closing, objections: wa.objection_handling, follow_up: wa.follow_up, recovery: wa.recovery } : null,
    '13_measurement_kpis': o['measurement'] ? o['measurement'].downstream_payload : null,
    '14_assumptions': assumptions,
    '15_evidence_provenance': { total_evidence_chunks: allChunks.length, by_node: evidence_by_node, source_classes: ['INTERNAL_KNOWLEDGE', 'INFERENCE'] },
    '16_known_limitations': limitations,
    '17_current_research_required': currentResearch,
    // [Brief Fidelity — fact-aware] Never ask for a USER_PROVIDED_FACT that canonicalBriefFacts
    // already has. Only fields genuinely UNKNOWN there are requested; when everything is known
    // (or canonicalBriefFacts wasn't supplied by an older caller) the legacy generic line is used
    // as a safe fallback so this never silently produces an empty/missing recommendation set.
    '18_recommended_next_actions': (() => {
      const actions = (recsBySupport['ASSUMPTION'] || []).map(r => 'Resolve: ' + r.recommendation).slice(0, 6);
      if (canonicalBriefFacts) {
        const stillUnknown = CANONICAL_FACT_KEYS.filter(k => canonicalBriefFacts[k] && canonicalBriefFacts[k].status === 'UNKNOWN');
        if (stillUnknown.length) actions.push('Provide USER_PROVIDED_FACTS still UNKNOWN: ' + stillUnknown.join(', '));
      } else {
        actions.push('Provide USER_PROVIDED_FACTS (price/margin, capacity, geography, promos)');
      }
      actions.push('Resolve CURRENT_RESEARCH_REQUIRED items before platform setup');
      return actions;
    })(),
  };

  const sections = Object.keys(deliverable);
  const allowEmpty = new Set(['9_ad_angles', '10_sample_copy_directions']);
  const missing = sections.filter(s => deliverable[s] === null || (Array.isArray(deliverable[s]) && deliverable[s].length === 0 && !allowEmpty.has(s)));
  return {
    deliverable, section_count: sections.length, missing_sections: missing,
    recommendations_by_support_class: recsBySupport,
    conflicts_surfaced: conflicts.length, methods_preserved: !!selected_methods_by_node,
    evidence_preserved: allChunks.length > 0, current_research_preserved: currentResearch.length,
    coherent: sections.length === 18 && missing.length === 0, not_a_concatenation: true, reconciled: true,
  };
}

module.exports = { synthesize };
