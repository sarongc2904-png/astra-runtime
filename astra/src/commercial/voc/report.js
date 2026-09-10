'use strict';
// [ASTRA-11F §X] VoiceOfCustomerReport. Every material statement stays evidence-linked.
// Reproducible from identical inputs. Missing sections stay UNKNOWN. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const SECTION_NAMES = Object.freeze([
  'executive_summary', 'scope', 'coverage', 'top_pains', 'top_desires', 'top_fears', 'top_objections',
  'triggers', 'alternatives', 'decision_criteria', 'questions', 'reasons_to_buy', 'reasons_not_to_buy',
  'complaints', 'expected_outcomes', 'segment_differences', 'journey_stage_differences', 'contradictions',
  'representative_quotes', 'buying_language_library', 'patterns', 'insights', 'unknowns', 'limitations', 'evidence_appendix',
]);

function sec(v) {
  const empty = v == null || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
  return empty ? { status: 'UNKNOWN' } : v;
}
function topByAspect(clusters, aspects, n = 5) {
  return clusters.filter(c => aspects.includes(c.aspect))
    .sort((a, b) => b.frequency.deduped_observation_count - a.frequency.deduped_observation_count || (a.cluster_id < b.cluster_id ? -1 : 1))
    .slice(0, n).map(c => ({ concept: c.canonical_concept, deduped_observation_count: c.frequency.deduped_observation_count, unique_source_count: c.frequency.unique_source_count, cluster_ref: c.cluster_id }));
}

function buildReport(x) {
  const {
    request = {}, referenceTime = null, utterances = [], observations = [], clusters = [],
    questions = [], alternatives = [], triggers = [], criteria = [],
    contradictions = [], patterns = [], insights = [], buyingLanguage = null,
    coverage, completion, segmentComparison = null, journeyComparison = null,
    excludedNonVoc = [],
  } = x;

  // evidence appendix
  const seen = new Set(); const entries = [];
  const add = (er, sr) => { const k = `${er}::${sr}`; if (er && !seen.has(k)) { seen.add(k); entries.push({ evidence_ref: er, source_ref: sr || null }); } };
  for (const o of observations) for (const er of o.evidence_refs) add(er, o.source_ref);
  for (const q of questions) for (const er of q.evidence_refs) add(er, q.source_ref);
  entries.sort((a, b) => (a.evidence_ref < b.evidence_ref ? -1 : a.evidence_ref > b.evidence_ref ? 1 : 0));
  const appendixRefs = new Set(entries.map(e => e.evidence_ref));

  // evidence-graph validity: every pattern's supporting observation resolves to an observation
  // present in the report, and every observation's evidence is in the appendix.
  const obsIds = new Set(observations.map(o => o.observation_id));
  const graphErrors = [];
  for (const p of patterns) for (const oid of p.supporting_observations) if (!obsIds.has(oid)) graphErrors.push(`pattern ${p.pattern_id} -> missing observation ${oid}`);
  for (const o of observations) for (const er of o.evidence_refs) if (!appendixRefs.has(er)) graphErrors.push(`observation ${o.observation_id} -> evidence ${er} not in appendix`);

  const repQuotes = clusters.flatMap(c => c.representative_quotes.map(r => ({ ...r, aspect: c.aspect, concept: c.canonical_concept })));

  const report = {
    schema_version: 'ucdm-voc-1.0.0',
    downstream_schema_versions: { ucdm: 'ucdm-1.0.0', ingest: 'ucdm-ingest-1.0.0', research: 'ucdm-research-1.0.0', competitor: 'ucdm-competitor-1.0.0' },
    request_ref: request.request_id || null,
    reference_time: referenceTime,
    generated_by: 'deterministic:ucdm/voc',
    counts: {
      utterances: utterances.length, observations: observations.length, clusters: clusters.length,
      questions: questions.length, alternatives: alternatives.length, triggers: triggers.length,
      patterns: patterns.length, insights: insights.length, excluded_non_voc: excludedNonVoc.length,
    },
    sections: {
      executive_summary: sec(completion ? { research_status: completion.status, reason_codes: completion.reason_codes, utterances: utterances.length, sources: coverage ? coverage.source_count : 0 } : null),
      scope: { objectives: request.objectives || [], language: request.language || null },
      coverage: sec(coverage || null),
      top_pains: sec(topByAspect(clusters, ['PAIN', 'COMPLAINT', 'FRUSTRATION', 'BARRIER'])),
      top_desires: sec(topByAspect(clusters, ['DESIRE', 'EXPECTATION', 'BENEFIT'])),
      top_fears: sec(topByAspect(clusters, ['FEAR', 'RISK', 'UNCERTAINTY'])),
      top_objections: sec(topByAspect(clusters, ['OBJECTION', 'REASON_NOT_TO_BUY'])),
      triggers: sec([...new Set(triggers.map(t => t.trigger_type))].sort()),
      alternatives: sec([...new Set(alternatives.map(a => a.alternative_type))].sort()),
      decision_criteria: sec([...new Set(criteria.map(c => c.criterion))].sort()),
      questions: sec([...new Set(questions.map(q => q.question_type))].sort()),
      reasons_to_buy: sec(topByAspect(clusters, ['REASON_TO_BUY', 'BENEFIT'])),
      reasons_not_to_buy: sec(topByAspect(clusters, ['REASON_NOT_TO_BUY', 'OBJECTION'])),
      complaints: sec(topByAspect(clusters, ['COMPLAINT', 'FRUSTRATION'])),
      expected_outcomes: sec(topByAspect(clusters, ['OUTCOME', 'EXPECTATION'])),
      segment_differences: sec(segmentComparison || null),
      journey_stage_differences: sec(journeyComparison || null),
      contradictions: sec(contradictions.filter(c => c.status !== 'INSUFFICIENT').map(c => ({ aspect: c.aspect, concept: c.canonical_concept, status: c.status }))),
      representative_quotes: sec(repQuotes.map(r => ({ verbatim_text: r.verbatim_text, aspect: r.aspect, quote_kind: r.quote_kind, source_ref: r.source_ref }))),
      buying_language_library: sec(buyingLanguage ? buyingLanguage.library_id : null),
      patterns: sec(patterns.map(p => p.pattern_id).sort()),
      insights: sec(insights.map(i => i.insight_id).sort()),
      unknowns: buildUnknowns(clusters, coverage, segmentComparison, journeyComparison),
      limitations: sec(completion ? completion.reason_codes : (coverage ? coverage.sampling_limitations : null)),
      evidence_appendix: { count: entries.length, entries },
    },
    evidence_graph_valid: graphErrors.length === 0,
    evidence_graph_errors: graphErrors.sort(),
    research_completion: completion ? completion.status : null,
    caveats: [
      'Only customer/prospect-attributable language is canonical VOC — business and competitor copy is excluded.',
      'verbatim_text is immutable; normalized_text and redacted_display_text are additive.',
      'Frequencies use explicit denominators; prevalence is never expressed as "% of customers" without a customer denominator.',
      'Contradictions are preserved, never collapsed.',
      'Insights are analytical, never facts, never recommendations.',
      'No ASTRA-11F output may feed production routing or autonomous action.',
    ],
  };
  report.section_names = Object.keys(report.sections);
  report.report_id = 'vocr_' + sha256Hex(canonicalize({ ...report, report_id: undefined }));
  report.content_hash = report.report_id;
  return deepFreeze(report);
}

function buildUnknowns(clusters, coverage, seg, jou) {
  const u = [];
  if (!clusters.some(c => ['PAIN', 'COMPLAINT'].includes(c.aspect))) u.push('top_pains');
  if (!clusters.some(c => ['DESIRE', 'BENEFIT'].includes(c.aspect))) u.push('top_desires');
  if (!clusters.some(c => c.aspect === 'FEAR')) u.push('top_fears');
  if (!seg || seg.status !== 'OK') u.push('segment_differences');
  if (!jou || jou.status !== 'OK') u.push('journey_stage_differences');
  return u.sort();
}

module.exports = { SECTION_NAMES, buildReport };
