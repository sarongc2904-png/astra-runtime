'use strict';
// [ASTRA-11G §X] CustomerModelReport. Every material statement stays evidence-linked.
// No unsupported narrative facts. Reproducible from identical inputs. Missing sections stay
// UNKNOWN. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const SECTION_NAMES = Object.freeze([
  'executive_summary', 'research_scope', 'evidence_coverage', 'customer_segments', 'segment_comparison',
  'priority_segments', 'buyer_personas', 'persona_evidence_maps', 'buying_language', 'pains',
  'desired_outcomes', 'fears', 'objections', 'triggers', 'alternatives', 'decision_criteria',
  'questions', 'awareness', 'urgency', 'budget_signals', 'icp', 'icp_fit', 'buying_roles',
  'disqualifiers', 'conflicts', 'unknowns', 'limitations', 'evidence_appendix',
]);

function sec(v) {
  const empty = v == null || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
  return empty ? { status: 'UNKNOWN' } : v;
}

function buildReport(x) {
  const {
    request = {}, referenceTime = null, mode = 'B2C',
    attributeEvidence = [], segments = [], memberships = [], overlap = null, metrics = [],
    personas = [], narratives = [], evidenceMaps = [], buyingLanguage = null,
    awareness = null, urgency = null, budget = null,
    icp = null, icpFits = [], buyingCommittee = null,
    attractiveness = [], priorities = [], disqualifiers = [], conflicts = [], mergeSplits = [],
    coverage = null, completion = null, vocResult = {},
  } = x;

  // evidence appendix — from attribute evidence + persona evidence maps + voc observations
  const seen = new Set(); const entries = [];
  const add = (er, sr) => { const k = `${er}::${sr}`; if (er && !seen.has(k)) { seen.add(k); entries.push({ evidence_ref: er, source_ref: sr || null }); } };
  for (const o of (vocResult.observations || [])) for (const er of o.evidence_refs) add(er, o.source_ref);
  for (const a of attributeEvidence) for (const er of a.evidence_refs) add(er, null);
  entries.sort((p, q) => (p.evidence_ref < q.evidence_ref ? -1 : p.evidence_ref > q.evidence_ref ? 1 : 0));
  const appendixRefs = new Set(entries.map(e => e.evidence_ref));

  // evidence-graph validity: every persona evidence map must resolve, and every segment's
  // supporting evidence must be in the appendix.
  const graphErrors = [];
  for (const m of evidenceMaps) if (!m.evidence_graph_valid) for (const d of m.dangling_refs) graphErrors.push(`persona_evidence_map ${m.persona_ref}: ${d}`);
  for (const s of segments) for (const er of s.supporting_evidence_refs) if (!appendixRefs.has(er)) graphErrors.push(`segment ${s.segment_id} -> evidence ${er} not in appendix`);
  for (const p of personas) for (const er of p.evidence_refs) if (!appendixRefs.has(er)) graphErrors.push(`persona ${p.persona_id} -> evidence ${er} not in appendix`);

  const topConcepts = (aspects) => {
    const rows = (vocResult.clusters || []).filter(c => aspects.includes(c.aspect))
      .sort((a, b) => b.frequency.deduped_observation_count - a.frequency.deduped_observation_count || (a.cluster_id < b.cluster_id ? -1 : 1))
      .slice(0, 6)
      .map(c => ({ concept: c.canonical_concept, deduped_observation_count: c.frequency.deduped_observation_count, unique_source_count: c.frequency.unique_source_count, denominator_note: c.frequency.denominator_note }));
    return rows;
  };

  const report = {
    schema_version: 'ucdm-customer-model-1.0.0',
    downstream_schema_versions: { ucdm: 'ucdm-1.0.0', ingest: 'ucdm-ingest-1.0.0', research: 'ucdm-research-1.0.0', competitor: 'ucdm-competitor-1.0.0', voc: 'ucdm-voc-1.0.0' },
    request_ref: request.request_id || null,
    reference_time: referenceTime,
    mode,
    generated_by: 'deterministic:ucdm/customer_model',
    counts: {
      attribute_evidence: attributeEvidence.length, segments: segments.length, personas: personas.length,
      disqualifiers: disqualifiers.length, conflicts: conflicts.length,
      observed_attribute_evidence: attributeEvidence.filter(a => a.status === 'OBSERVED').length,
    },
    sections: {
      executive_summary: sec(completion ? { status: completion.status, reason_codes: completion.reason_codes, segments: segments.length, supported_segments: segments.filter(s => s.status === 'SUPPORTED').length, personas: personas.length, mode } : null),
      research_scope: { objectives: request.objectives || [], language: request.language || null, mode },
      evidence_coverage: sec(coverage),
      customer_segments: sec(segments.map(s => ({ segment_id: s.segment_id, label: s.label, primary_concept: s.primary_concept, status: s.status, dimension_values: s.dimension_values.map(d => ({ dimension: d.dimension, value: d.value })), observed_sample: s.observed_sample, contradiction_status: s.contradiction_status }))),
      segment_comparison: sec(overlap),
      priority_segments: sec(priorities.map(p => ({ segment_id: p.segment_id, priority_band: p.priority_band, priority_score: p.priority_score, uncertainty: p.uncertainty, reason_codes: p.reason_codes, is_analytical: p.is_analytical })).sort((a, b) => (a.segment_id < b.segment_id ? -1 : 1))),
      buyer_personas: sec(personas.map(p => p.persona_id).sort()),
      persona_evidence_maps: sec(evidenceMaps.map(m => ({ persona_ref: m.persona_ref, chain_count: m.chain_count, evidence_graph_valid: m.evidence_graph_valid }))),
      buying_language: sec(buyingLanguage ? { library_id: buyingLanguage.library_id, contains_generated_copy: false } : null),
      pains: sec(topConcepts(['PAIN', 'COMPLAINT', 'FRUSTRATION', 'BARRIER'])),
      desired_outcomes: sec(topConcepts(['DESIRE', 'OUTCOME', 'EXPECTATION', 'BENEFIT'])),
      fears: sec(topConcepts(['FEAR', 'RISK', 'UNCERTAINTY'])),
      objections: sec(topConcepts(['OBJECTION', 'REASON_NOT_TO_BUY'])),
      triggers: sec([...new Set((vocResult.triggers || []).map(t => t.trigger_type))].sort()),
      alternatives: sec([...new Set((vocResult.alternatives || []).map(a => a.alternative_type))].sort()),
      decision_criteria: sec([...new Set((vocResult.criteria || []).map(c => c.criterion))].sort()),
      questions: sec([...new Set((vocResult.questions || []).map(q => q.verbatim_question))].sort()),
      awareness: sec(awareness ? { stage: awareness.stage, basis: awareness.basis } : null),
      urgency: sec(urgency ? { level: urgency.level, basis: urgency.basis } : null),
      budget_signals: sec(budget ? { signal: budget.signal, basis: budget.basis, signal_mix: budget.signal_mix } : null),
      icp: sec(icp && icp.status !== 'NOT_APPLICABLE' ? { icp_id: icp.icp_id, unknowns: icp.unknowns || [] } : (icp ? { status: 'NOT_APPLICABLE', reason: 'B2C' } : null)),
      icp_fit: sec(icpFits.map(f => ({ fit_id: f.fit_id, fit_band: f.fit_band, total_score: f.total_score, reason_codes: f.reason_codes }))),
      buying_roles: sec(buyingCommittee && buyingCommittee.status !== 'NOT_APPLICABLE' ? { roles_present: buyingCommittee.roles_present, member_count: buyingCommittee.members.length, distinct_parties: buyingCommittee.distinct_parties } : { status: 'NOT_APPLICABLE' }),
      disqualifiers: sec(disqualifiers.map(d => ({ disqualifier_type: d.disqualifier_type, rejected: d.rejected, rejection_reason: d.rejection_reason, commercially_relevant: d.commercially_relevant }))),
      conflicts: sec(conflicts.filter(c => c.status !== 'INSUFFICIENT').map(c => ({ theme: c.theme, status: c.status, likely_multiple_segments: c.likely_multiple_segments }))),
      unknowns: buildUnknowns({ personas, awareness, urgency, budget, icp, segments }),
      limitations: sec(completion ? completion.reason_codes : (coverage ? coverage.limitations : null)),
      evidence_appendix: { count: entries.length, entries },
    },
    evidence_graph_valid: graphErrors.length === 0,
    evidence_graph_errors: graphErrors.sort(),
    completion_status: completion ? completion.status : null,
    caveats: [
      'Only evidence-backed customer attributes are represented; unsupported demographics, psychographics, and lifestyle stay UNKNOWN.',
      'No plausible-but-unsupported persona filler (no invented age, name, family, income, hobbies).',
      'Market / segment size is never fabricated from a convenience sample; external size is UNKNOWN unless supplied.',
      'Overlapping segments are supported — a customer is not forced into one segment.',
      'Contradictions are preserved and may indicate multiple segments; they are never averaged away.',
      'ICP (account fit) is separate from BuyerPersona (the human/role); priority is analytical only.',
      'No ASTRA-11G output may feed production routing or autonomous action.',
    ],
  };
  report.section_names = Object.keys(report.sections);
  report.report_id = 'cmr_' + sha256Hex(canonicalize({ ...report, report_id: undefined }));
  report.content_hash = report.report_id;
  return deepFreeze(report);
}

function buildUnknowns({ personas, awareness, urgency, budget, icp, segments }) {
  const u = new Set();
  if (!awareness || awareness.stage === 'UNKNOWN') u.add('awareness');
  if (!urgency || urgency.level === 'UNKNOWN') u.add('urgency');
  if (!budget || ['UNKNOWN', 'NO_BUDGET_SIGNAL'].includes(budget.signal)) u.add('budget_signal');
  if (icp && icp.status === 'ACTIVE') for (const k of (icp.unknowns || [])) u.add('icp.' + k);
  if (segments.every(s => s.status !== 'SUPPORTED')) u.add('no_supported_segment');
  for (const p of personas) for (const f of (p.unknowns || [])) u.add('persona.' + f);
  return [...u].sort();
}

module.exports = { SECTION_NAMES, buildReport };
