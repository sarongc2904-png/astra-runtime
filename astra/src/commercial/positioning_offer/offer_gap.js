'use strict';
// [ASTRA-11I §U] OfferGap — analytical. Surfaces where the offer under-serves evidenced
// customer / journey / competitive reality. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const GAP_TYPES = Object.freeze([
  'MISSING_PROOF', 'MISSING_RISK_REVERSAL', 'UNADDRESSED_OBJECTION', 'WEAK_JTBD_LINKAGE',
  'UNCLEAR_MECHANISM', 'PRICING_AMBIGUITY', 'IMPLEMENTATION_FRICTION', 'SEGMENT_MISMATCH',
  'JOURNEY_MISMATCH', 'COMPETITOR_PARITY',
]);

// buildOfferGaps({ proofStrategy, riskReversals, objectionMap, offerArchitecture, mechanism, pricing, offerSegmentFits, offerJourneyFit, competitorComparison, jtbdByArch })
function buildOfferGaps(x) {
  const { proofStrategy = null, objectionMap = [], offerArchitecture = null, mechanism = null, pricing = null, offerSegmentFits = [], offerJourneyFit = null, competitorComparison = null } = x;
  const gaps = [];
  const add = (type, detail, evidence_refs) => {
    const body = {
      schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'OfferGap',
      gap_type: type, detail: String(detail), evidence_refs: [...new Set(evidence_refs || [])].sort(),
      status: 'ANALYTICAL', is_fact: false,
      generated_by: 'deterministic:ucdm/positioning_offer',
    };
    body.gap_id = 'og_' + sha256Hex(canonicalize({ ...body, gap_id: undefined }));
    gaps.push(deepFreeze(body));
  };

  for (const g of ((proofStrategy && proofStrategy.gaps) || [])) add('MISSING_PROOF', `customers require ${g.proof_type} but no business proof asset supplied`, g.evidence_refs);
  for (const m of objectionMap) {
    if (m.handling_status === 'UNADDRESSED') add('UNADDRESSED_OBJECTION', `objection ${m.objection_concept} is unaddressed`, m.evidence_refs);
    if (m.handling_status === 'PARTIALLY_ADDRESSED') add('UNADDRESSED_OBJECTION', `objection ${m.objection_concept} only partially addressed (gap: ${m.remaining_gap.join(', ')})`, m.evidence_refs);
  }
  if (!offerArchitecture || !offerArchitecture.has_core_offer) add('UNCLEAR_MECHANISM', 'no core offer supplied', []);
  if (mechanism && mechanism.status === 'UNKNOWN') add('UNCLEAR_MECHANISM', 'no mechanism evidence — how value is delivered is unclear', []);
  if (pricing && pricing.own_supplied_price.status === 'UNKNOWN' && (!pricing.price_range || pricing.price_range.status === 'UNKNOWN')) add('PRICING_AMBIGUITY', 'no own price or price range supplied/observed', []);
  if (pricing && pricing.price_conflict && pricing.price_conflict.status !== 'NONE') add('PRICING_AMBIGUITY', `observed competitor prices conflict (${pricing.price_conflict.status})`, []);
  for (const f of offerSegmentFits) if (f.fit_band === 'POOR' || f.fit_band === 'WEAK') add('SEGMENT_MISMATCH', `offer fit for ${f.segment_id} is ${f.fit_band}`, []);
  for (const s of ((offerJourneyFit && offerJourneyFit.unaddressed_stages) || [])) add('JOURNEY_MISMATCH', `journey stage ${s} has evidenced needs the offer does not address`, []);
  for (const d of ((competitorComparison && competitorComparison.dimensions) || [])) if (d.status === 'SAME') add('COMPETITOR_PARITY', `dimension ${d.dimension} is at parity with observed competitors`, d.evidence_refs);

  return gaps;
}

function validateOfferGap(g) {
  const errors = [];
  if (!GAP_TYPES.includes(g.gap_type)) errors.push(`bad gap_type "${g.gap_type}"`);
  if (g.is_fact !== false) errors.push('an offer gap is analytical, never a fact');
  return { valid: errors.length === 0, errors };
}

module.exports = { GAP_TYPES, buildOfferGaps, validateOfferGap };
