'use strict';
// [ASTRA-11E §T] CompetitorIntelligenceReport. Every material conclusion stays
// evidence-backed. Reproducible from identical inputs. Missing sections stay UNKNOWN.
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const SECTION_NAMES = Object.freeze([
  'executive_summary', 'scope', 'coverage', 'competitor_roster', 'category_map',
  'positioning_matrix', 'offer_matrix', 'pricing_matrix', 'message_landscape', 'proof_landscape',
  'funnel_cta_landscape', 'creative_patterns', 'saturation', 'strength_hypotheses',
  'weakness_hypotheses', 'threat_assessments', 'differentiation_gaps', 'opportunity_candidates',
  'conflicts', 'unknowns', 'limitations', 'evidence_appendix',
]);

function sec(v) {
  const empty = v == null
    || (Array.isArray(v) && v.length === 0)
    || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
  return empty ? { status: 'UNKNOWN' } : v;
}

function buildReport(x) {
  const {
    request = {}, referenceTime = null, profiles = [], byCompetitor = {},
    matrix, marketSaturation, messageSaturation, positioningMap, clusters,
    strengthHypotheses = [], weaknessHypotheses = [], threatAssessments = [],
    differentiationGaps = [], opportunities = [], conflicts = [], coverage, completion,
    excludedInferred = [], ingestion = null,
  } = x;

  // evidence appendix: every evidence_ref used anywhere -> {evidence_ref, source_ref}
  const seen = new Set(); const entries = [];
  const add = (er, sr) => { const k = `${er}::${sr}`; if (er && !seen.has(k)) { seen.add(k); entries.push({ evidence_ref: er, source_ref: sr || null }); } };
  for (const p of profiles) for (const er of p.evidence_refs) add(er, p.source_refs[0] || null);
  for (const ref of Object.keys(byCompetitor)) {
    const b = byCompetitor[ref];
    for (const a of (b.attributes || [])) for (const er of a.evidence_refs) add(er, a.source_refs[0] || null);
    for (const it of (b.messageProfile ? b.messageProfile.items : [])) for (const er of it.raw.evidence_refs) add(er, it.raw.source_ref);
  }
  entries.sort((a, b) => (a.evidence_ref < b.evidence_ref ? -1 : a.evidence_ref > b.evidence_ref ? 1 : 0));
  const appendixRefs = new Set(entries.map(e => e.evidence_ref));

  // deterministic evidence-graph validity: every hypothesis/threat/gap's supporting refs
  // resolve into the appendix.
  const graphErrors = [];
  const checkRefs = (label, refs) => { for (const r of refs || []) if (!appendixRefs.has(r) && !/^(MESSAGE_LANDSCAPE|PRICING_STATS)$/.test(r)) graphErrors.push(`${label} -> evidence ${r} not in appendix`); };
  for (const h of [...strengthHypotheses, ...weaknessHypotheses]) checkRefs('hypothesis ' + h.hypothesis_id, h.supporting_evidence_refs);
  for (const g of differentiationGaps) checkRefs('gap ' + g.gap_id, g.supporting_evidence_refs.filter(r => !/^(MESSAGE_LANDSCAPE)$/.test(r)));

  const roster = profiles.map(p => ({ competitor_id: p.competitor_id, name: p.name, identity_status: p.identity_status, ambiguous_with: p.ambiguous_with, source_refs: p.source_refs, evidence_refs: p.evidence_refs }));

  const report = {
    schema_version: 'ucdm-competitor-1.0.0',
    downstream_schema_versions: { ucdm: 'ucdm-1.0.0', ingest: 'ucdm-ingest-1.0.0', research: 'ucdm-research-1.0.0' },
    request_ref: request.request_id || null,
    reference_time: referenceTime,
    generated_by: 'deterministic:ucdm/competitor',
    counts: {
      competitors: profiles.length,
      resolved: profiles.filter(p => p.identity_status === 'RESOLVED').length,
      ambiguous: profiles.filter(p => p.identity_status === 'AMBIGUOUS').length,
      strength_hypotheses: strengthHypotheses.length,
      weakness_hypotheses: weaknessHypotheses.length,
      threat_assessments: threatAssessments.length,
      differentiation_gaps: differentiationGaps.length,
      opportunities: opportunities.length,
      conflicts: conflicts.length,
      excluded_inferred: excludedInferred.length,
    },
    sections: {
      executive_summary: sec(completion ? { research_status: completion.status, reason_codes: completion.reason_codes, competitors: profiles.length } : null),
      scope: { objectives: request.objectives || [], scope: (request.research_scope && request.research_scope.scope) || 'SAMPLE' },
      coverage: sec(coverage || null),
      competitor_roster: sec(roster),
      category_map: sec([...new Set(profiles.flatMap(p => p.products_services))].sort()),
      positioning_matrix: sec(positioningMap && positioningMap.placements ? positioningMap : null),
      offer_matrix: sec(matrix ? matrix.rows.find(r => r.row === 'offer') : null),
      pricing_matrix: sec(matrix ? matrix.rows.find(r => r.row === 'price') : null),
      message_landscape: sec(messageSaturation || null),
      proof_landscape: sec(Object.values(byCompetitor).map(b => (b.proofProfile && b.proofProfile.proof_count > 0) ? b.proofProfile.proof_profile_id : null).filter(Boolean)),
      funnel_cta_landscape: sec(Object.values(byCompetitor).map(b => (b.funnelProfile && b.funnelProfile.observed_touchpoints.length > 0) ? { competitor: b.funnelProfile.competitor_ref, touchpoints: b.funnelProfile.observed_touchpoints } : null).filter(Boolean)),
      creative_patterns: sec([...new Set(Object.values(byCompetitor).flatMap(b => (b.creativeProfile && b.creativeProfile.angles_present) || []))].filter(a => a !== 'UNKNOWN').sort()),
      saturation: sec(marketSaturation || null),
      strength_hypotheses: sec(strengthHypotheses.map(h => h.hypothesis_id).sort()),
      weakness_hypotheses: sec(weaknessHypotheses.map(h => h.hypothesis_id).sort()),
      threat_assessments: sec(threatAssessments.map(t => ({ competitor_ref: t.competitor_ref, level: t.level })).sort((a, b) => (a.competitor_ref < b.competitor_ref ? -1 : 1))),
      differentiation_gaps: sec(differentiationGaps.map(g => g.gap_id).sort()),
      opportunity_candidates: sec(opportunities.map(o => o.opportunity_id).sort()),
      conflicts: sec(conflicts.map(c => c.conflict_id).sort()),
      unknowns: buildUnknowns(coverage, byCompetitor),
      limitations: sec(completion ? completion.reason_codes : null),
      evidence_appendix: { count: entries.length, entries },
    },
    clusters: clusters || { status: 'UNKNOWN' },
    evidence_graph_valid: graphErrors.length === 0,
    evidence_graph_errors: graphErrors.sort(),
    research_completion: completion ? completion.status : null,
    caveats: [
      'Competitor facts are OBSERVED/COMPUTED only — model knowledge is never observed competitor evidence.',
      'NOT_OBSERVED_IN_SAMPLE is never equated with ABSENT.',
      'Strength/weakness/gap/opportunity are hypotheses requiring validation.',
      'Proof presence is observed; proof truth is not asserted.',
      'No ASTRA-11E output may feed production routing or autonomous action.',
    ],
  };
  report.section_names = Object.keys(report.sections);
  report.report_id = 'cmr_' + sha256Hex(canonicalize({ ...report, report_id: undefined }));
  report.content_hash = report.report_id;
  return deepFreeze(report);
}

function buildUnknowns(coverage, byCompetitor) {
  const u = [];
  if (!coverage || coverage.pricing_coverage === 0) u.push('pricing_matrix');
  if (!coverage || coverage.proof_coverage === 0) u.push('proof_landscape');
  if (!coverage || coverage.funnel_coverage === 0) u.push('funnel_cta_landscape');
  if (!coverage || coverage.creative_coverage === 0) u.push('creative_patterns');
  return u.sort();
}

module.exports = { SECTION_NAMES, buildReport };
