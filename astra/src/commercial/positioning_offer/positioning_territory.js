'use strict';
// [ASTRA-11I §B §Z] PositioningTerritory. Analytical, not market fact. One territory per
// segment — territories are NEVER collapsed into a generic average. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');

const TERRITORY_STATUS = Object.freeze(['SUPPORTED', 'PARTIAL', 'HYPOTHESIS', 'INSUFFICIENT']);

// buildPositioningTerritories({ customerModel, journeyResult, differentiation, distinctivenessBySegment, frameBySegment, conflicts })
function buildPositioningTerritories(x) {
  const { customerModel = null, journeyResult = null, differentiation = [], frameBySegment = {}, distinctivenessBySegment = {}, conflicts = [] } = x;
  const segments = (customerModel && customerModel.segments) || [];
  const personaBySeg = {};
  for (const p of ((customerModel && customerModel.personas) || [])) for (const s of p.segment_refs) personaBySeg[s] = p;
  const jtbdBySeg = {};
  for (const j of ((journeyResult && journeyResult.jobs) || [])) if (j.segment_refs[0]) (jtbdBySeg[j.segment_refs[0]] = jtbdBySeg[j.segment_refs[0]] || []).push(j);

  const out = [];
  for (const seg of segments) {
    const persona = personaBySeg[seg.segment_id];
    const frame = frameBySegment[seg.segment_id] || null;
    const dist = distinctivenessBySegment[seg.segment_id] || null;
    const segDiff = differentiation.filter(d => d.customer_relevance === 'EVIDENCED');
    const problem = seg.primary_dimension === 'problem' ? seg.primary_concept : (persona && persona.primary_problem && persona.primary_problem.concept) || 'UNKNOWN';
    const desired = persona && persona.desired_situation && persona.desired_situation.status !== 'UNKNOWN' ? persona.desired_situation.concept : 'UNKNOWN';
    const referencePoints = [...new Set(((journeyResult && journeyResult.alternatives) || []).map(a => a.alternative_type))].sort();
    const contradiction_refs = conflicts.filter(c => (c.segment_refs || []).includes(seg.segment_id) || c.dimension === 'CARRIED_FROM_CUSTOMER_MODEL').map(c => c.conflict_id).filter(Boolean);

    const evidence_refs = [...new Set([
      ...seg.supporting_evidence_refs,
      ...(persona ? persona.evidence_refs : []),
      ...segDiff.flatMap(d => d.observed_capability.evidence_refs),
    ])].sort();

    const distinctivenessScore = dist ? (dist.whitespace.length * 2 + dist.overlap.length) : 0;
    let status;
    if (seg.status === 'INSUFFICIENT' || evidence_refs.length === 0) status = 'INSUFFICIENT';
    else if (problem === 'UNKNOWN' || !persona) status = 'HYPOTHESIS';
    else if (seg.status === 'PARTIAL' || segDiff.length === 0 || desired === 'UNKNOWN') status = 'PARTIAL';
    else status = 'SUPPORTED';

    const body = {
      schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'PositioningTerritory',
      target_segment_refs: [seg.segment_id],
      persona_refs: persona ? [persona.persona_id] : [],
      jtbd_refs: (jtbdBySeg[seg.segment_id] || []).map(j => j.job_id),
      problem_context: problem,
      desired_progress: desired,
      category_frame_ref: frame ? frame.frame_id : null,
      frame_type: frame ? frame.frame_type : 'UNKNOWN',
      reference_points: referencePoints,
      differentiation_basis: [...new Set(segDiff.map(d => d.differentiation_type))].sort(),
      differentiation_refs: segDiff.map(d => d.differentiation_id),
      evidence_refs,
      contradiction_refs,
      competitor_overlap: dist ? dist.overlap : [],
      whitespace: dist ? dist.whitespace : [],
      distinctiveness_ref: dist ? dist.distinctiveness_id : null,
      distinctiveness_signal: distinctivenessScore,
      relevance: persona && persona.primary_problem && persona.primary_problem.status !== 'UNKNOWN' ? 'EVIDENCED' : 'UNKNOWN',
      defensibility: 'ANALYTICAL_ONLY',
      is_market_fact: false,
      scope: 'SEGMENT',
      status,
      unknowns: [problem === 'UNKNOWN' ? 'problem_context' : null, desired === 'UNKNOWN' ? 'desired_progress' : null, !frame || frame.frame_type === 'UNKNOWN' ? 'category_frame' : null, segDiff.length === 0 ? 'differentiation_basis' : null, !dist || dist.competitor_sample_size === 0 ? 'competitor_overlap' : null].filter(Boolean),
      confidence: assess({ evidence_count: evidence_refs.length, distinct_sources: seg.observed_sample.unique_source_count, coverage: 0.4, agree_count: 1, conflict_count: contradiction_refs.length ? 1 : 0 }),
      generated_by: 'deterministic:ucdm/positioning_offer',
    };
    body.territory_id = 'pt_' + sha256Hex(canonicalize({ ...body, territory_id: undefined, confidence: body.confidence.content_hash }));
    out.push(deepFreeze(body));
  }
  return out;
}

// deterministic comparison across territories — differences preserved, never averaged (§Z)
function comparePositioning(territories) {
  const diffs = [];
  for (let i = 0; i < territories.length; i++) for (let j = i + 1; j < territories.length; j++) {
    const a = territories[i], b = territories[j];
    const problemDiff = a.problem_context !== b.problem_context;
    const frameDiff = a.frame_type !== b.frame_type;
    const basisDiff = JSON.stringify(a.differentiation_basis) !== JSON.stringify(b.differentiation_basis);
    if (problemDiff || frameDiff || basisDiff) diffs.push({ territory_a: a.territory_id, territory_b: b.territory_id, problem_diff: problemDiff, frame_diff: frameDiff, differentiation_diff: basisDiff });
  }
  return deepFreeze({
    schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'PositioningComparison',
    territory_count: territories.length, differences: diffs, territories_differ: diffs.length > 0,
    universal_positioning_forced: false,
    note: 'per-segment positioning territories are preserved; no single universal positioning is forced',
    generated_by: 'deterministic:ucdm/positioning_offer',
  });
}

function validateTerritory(t) {
  const errors = [];
  if (!TERRITORY_STATUS.includes(t.status)) errors.push(`bad territory status "${t.status}"`);
  if (t.is_market_fact !== false) errors.push('a positioning territory is analytical, never a market fact');
  if (['SUPPORTED', 'PARTIAL'].includes(t.status) && t.evidence_refs.length === 0) errors.push('a SUPPORTED/PARTIAL territory needs evidence');
  if (/\b(unique|only provider|nadie m[aá]s|market leader)\b/i.test(JSON.stringify(t))) errors.push('no market-wide uniqueness claim in a territory');
  return { valid: errors.length === 0, errors };
}

module.exports = { TERRITORY_STATUS, buildPositioningTerritories, comparePositioning, validateTerritory };
