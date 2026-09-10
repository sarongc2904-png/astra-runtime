'use strict';
// [ASTRA-11I §Y] Positioning / Offer conflicts. Contradictions are PRESERVED. ASTRA does NOT
// force one universal positioning. Reuses ASTRA-11F/G/H contradiction signals — no parallel
// system. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const CONFLICT_STATUS = Object.freeze(['CONSISTENT', 'MIXED', 'POLARIZED', 'INSUFFICIENT']);

// detectPositioningOfferConflicts({ customerModel, journeyResult, territories, pricing, proofStrategy, competitorComparison })
function detectPositioningOfferConflicts(x) {
  const { customerModel = null, journeyResult = null, territories = [], pricing = null, proofStrategy = null, competitorComparison = null } = x;
  const out = [];
  const add = (dimension, status, detail, evidence_refs, likely) => {
    const body = {
      schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'PositioningOfferConflict',
      dimension, status, detail: String(detail),
      likely_separate_positioning: !!likely,
      evidence_refs: [...new Set(evidence_refs || [])].sort(),
      generated_by: 'deterministic:ucdm/positioning_offer',
    };
    body.conflict_id = 'poc_' + sha256Hex(canonicalize({ ...body, conflict_id: undefined }));
    out.push(deepFreeze(body));
  };

  // segment disagreement / different JTBDs / opposite objections carried from earlier gates
  for (const c of ((customerModel && customerModel.conflicts) || [])) {
    if (['MIXED', 'POLARIZED'].includes(c.status)) add('SEGMENT_DISAGREEMENT', c.status, `carried from customer model: ${c.theme}`, c.evidence_refs || [], true);
  }
  for (const c of ((journeyResult && journeyResult.conflicts) || [])) {
    if (['MIXED', 'POLARIZED'].includes(c.status)) add('DIFFERENT_JOURNEYS', c.status, `carried from journey: ${c.dimension}`, c.evidence_refs || [], true);
  }
  // territory divergence
  const problems = new Set(territories.map(t => t.problem_context).filter(p => p !== 'UNKNOWN'));
  if (problems.size >= 2) add('MULTIPLE_POSITIONING_TERRITORIES', 'MIXED', `${problems.size} distinct evidenced problems across segments`, territories.flatMap(t => t.evidence_refs), true);
  // pricing conflict
  if (pricing && pricing.price_conflict && pricing.price_conflict.status !== 'NONE') add('PRICING_CONFLICT', 'MIXED', pricing.price_conflict.note || pricing.price_conflict.status, [], false);
  // proof conflict — required but gap
  if (proofStrategy && proofStrategy.gaps.length && proofStrategy.available.length) add('PROOF_CONFLICT', 'MIXED', 'some required proof available, some a gap', proofStrategy.gaps.flatMap(g => g.evidence_refs), false);
  // competitor ambiguity
  if (competitorComparison && competitorComparison.competitor_sample_size === 0) add('COMPETITOR_AMBIGUITY', 'INSUFFICIENT', 'no observed competitor offers/messages', [], false);

  return out;
}

function validateConflict(c) {
  const errors = [];
  if (!CONFLICT_STATUS.includes(c.status)) errors.push(`bad conflict status "${c.status}"`);
  if (['MIXED', 'POLARIZED'].includes(c.status) && c.dimension.includes('POSITIONING') && c.likely_separate_positioning !== true) errors.push('a material positioning conflict must be flagged as likely separate positioning');
  return { valid: errors.length === 0, errors };
}

module.exports = { CONFLICT_STATUS, detectPositioningOfferConflicts, validateConflict };
