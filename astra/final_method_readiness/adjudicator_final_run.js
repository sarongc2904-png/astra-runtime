'use strict';
// ASTRA-03E final adjudicator run. Uses the EXISTING ASTRA-02 method_adjudicator (semantics unchanged).
// Candidate selection = registry.getCandidates(domain) then evidence-gate (evidence_refs>0), which is the
// adjudicator spec's evidence-gating (zero-evidence DISCOVERED methods cannot be primary). Offline: no LLM,
// no live retrieval — registry metadata only. Records cases + results.
const fs = require('fs');
const path = require('path');
const reg = require('../src/methods/registry_loader').load();
const adj = require('../src/router/method_adjudicator');

const CASES = [
  { task_id: 'T01', description: 'client acquisition', domain: 'FUNNEL', expected_any: ['METHOD_FUNNEL', 'METHOD_VELOCITY'] },
  { task_id: 'T02', description: 'ICP definition', domain: 'ICP', expected_any: ['METHOD_ICP', 'METHOD_TARGET_AUDIENCE_DEFINITION'] },
  { task_id: 'T03', description: 'offer design', domain: 'OFFER', expected_any: ['METHOD_OFFER_DESIGN'] },
  { task_id: 'T04', description: 'funnel design', domain: 'FUNNEL', expected_any: ['METHOD_FUNNEL'] },
  { task_id: 'T05', description: 'sales conversion', domain: 'SALES', expected_any: ['METHOD_SALES_ACCELERATION', 'METHOD_WHATSAPP_SALES'] },
  { task_id: 'T06', description: 'creative strategy', domain: 'CREATIVE', expected_any: ['METHOD_CREATIVE_STRATEGY'] },
  { task_id: 'T07', description: 'copy / proposition', domain: 'COPY', expected_any: ['METHOD_SINGLE_MINDED_PROPOSITION', 'METHOD_COPYWRITING_TONE', 'METHOD_TAGLINE_CRAFT'] },
  { task_id: 'T08', description: 'Meta Ads', domain: 'ADS', expected_any: ['METHOD_META_ADS', 'METHOD_DIGITAL_MARKETING'] },
  { task_id: 'T09', description: 'WhatsApp conversion', domain: 'SALES', expected_any: ['METHOD_WHATSAPP_SALES'] },
  { task_id: 'T10', description: 'measurement / CRO', domain: 'CRO', expected_any: ['METHOD_CRO'] },
  { task_id: 'T11', description: 'positioning', domain: 'COPY', expected_any: ['METHOD_SINGLE_MINDED_PROPOSITION'], note: 'no dedicated METHOD_POSITIONING; SMP is nearest evidence-backed' },
  { task_id: 'T12', description: 'pricing', domain: 'OFFER', expected_any: ['METHOD_OFFER_DESIGN'], note: 'no dedicated METHOD_PRICING; offer design nearest' },
  { task_id: 'T13', description: 'infoproduct creation', domain: 'INFOPRODUCT', expected_any: ['METHOD_INFOPRODUCT'] },
  { task_id: 'T14', description: 'generic multi-step marketing', domain: 'MULTI', expected_any: [], note: 'composes per-node adjudications' },
];

function gate(cands) { return cands.filter(m => Array.isArray(m.evidence_refs) && m.evidence_refs.length > 0); }

const results = [];
for (const c of CASES) {
  let domainCands = c.domain === 'MULTI' ? reg.methods : reg.getCandidates({ domain: c.domain });
  const allIds = domainCands.map(m => m.method_id);
  const gated = gate(domainCands);
  const gatedIds = gated.map(m => m.method_id);
  const brief = { funnel_stage: [], constraints: {} };
  const step = { step_id: c.task_id, domain: c.domain };
  // evidence present for the gated pool -> PARTIAL sufficiency; empty pool -> INSUFFICIENT
  const evidence = gated.length ? { decision: 'PARTIAL' } : { decision: 'INSUFFICIENT' };
  const a = adj.adjudicate({ brief, step, candidates: gated, evidence });
  const expectedAvailable = c.expected_any.length === 0 ? null : c.expected_any.some(id => gatedIds.includes(id));
  results.push({
    task_id: c.task_id, description: c.description, domain: c.domain, note: c.note || null,
    all_domain_candidates: allIds, evidence_backed_candidates: gatedIds,
    excluded_zero_evidence: allIds.filter(id => !gatedIds.includes(id)),
    primary_method: a.primary_method, secondary_methods: a.secondary_methods,
    rejected_methods: a.rejected_methods.map(r => r.method_id), state: a.state,
    selection_confidence: a.selection_confidence, method_conflicts: a.method_conflicts,
    expected_method_available: expectedAvailable,
    primary_is_evidence_backed: a.primary_method ? gatedIds.includes(a.primary_method) : null,
  });
}

// analysis assertions
const primaries = results.map(r => r.primary_method).filter(Boolean);
const analysis = {
  distinct_primaries: [...new Set(primaries)].length,
  velocity_ever_primary: primaries.includes('METHOD_VELOCITY'),
  course_design_ever_primary: primaries.includes('METHOD_COURSE_DESIGN'),
  meta_ads_available_for_ads: results.find(r => r.task_id === 'T08').evidence_backed_candidates.includes('METHOD_META_ADS'),
  whatsapp_available_for_conversion: results.find(r => r.task_id === 'T09').evidence_backed_candidates.includes('METHOD_WHATSAPP_SALES'),
  course_domain_state: results.find(r => r.task_id === null) || (reg.getCandidates({ domain: 'COURSE' }).filter(m => m.evidence_refs.length).length === 0 ? 'no_evidence_backed_course_method' : 'has'),
  any_primary_not_evidence_backed: results.some(r => r.primary_is_evidence_backed === false),
};
fs.writeFileSync(path.join(__dirname, 'adjudicator_final_results.json'), JSON.stringify({ generated_at: new Date().toISOString(), results, analysis }, null, 2) + '\n');
fs.writeFileSync(path.join(__dirname, 'adjudicator_final_cases.json'), JSON.stringify({ generated_at: new Date().toISOString(), cases: CASES }, null, 2) + '\n');
console.log(JSON.stringify(analysis, null, 2));
for (const r of results) console.log(`${r.task_id} ${r.description} [${r.domain}] primary=${r.primary_method || 'NONE(' + r.state + ')'} gated=${r.evidence_backed_candidates.join(',')} excluded=${r.excluded_zero_evidence.join(',') || '-'}`);
