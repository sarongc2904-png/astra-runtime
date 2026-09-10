'use strict';
// [ASTRA-11E §R] CompetitorOpportunityCandidate — hypothesis / recommendation-level.
// Requires human validation before any production action. NO fabricated revenue lift.
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const OPP_TYPES = Object.freeze(['underused_message', 'missing_guarantee_pattern', 'under_addressed_problem', 'weak_proof_category', 'underserved_audience', 'offer_whitespace', 'channel_whitespace']);

function mk(input) {
  const b = {
    schema_version: 'ucdm-competitor-1.0.0',
    kind: 'CompetitorOpportunityCandidate',
    level: 'RECOMMENDATION',
    opportunity_type: input.opportunity_type,
    opportunity: String(input.opportunity || ''),
    rationale: String(input.rationale || ''),
    supporting_gap_refs: [...(input.supporting_gap_refs || [])].sort(),
    supporting_evidence_refs: [...new Set(input.supporting_evidence_refs || [])].sort(),
    confidence: input.confidence || null,
    uncertainty: input.uncertainty || 'HIGH',
    recommended_validation: [...(input.recommended_validation || ['run a controlled test before committing budget'])],
    expected_lift: 'NOT_ESTIMATED',
    requires_human_validation: true,
    autonomous: false,
    produced_by: 'deterministic:ucdm/competitor',
  };
  b.opportunity_id = 'cmopp_' + sha256Hex(canonicalize({ ...b, opportunity_id: undefined, confidence: b.confidence && b.confidence.content_hash }));
  return deepFreeze(b);
}

const GAP_TYPE_TO_OPP = {
  message_gap: 'underused_message', price_position_gap: 'offer_whitespace', offer_gap: 'offer_whitespace',
  proof_gap: 'weak_proof_category', channel_gap: 'channel_whitespace', mechanism_gap: 'underused_message',
  service_gap: 'under_addressed_problem', audience_gap: 'underserved_audience', experience_gap: 'under_addressed_problem',
};

// deriveOpportunities({ differentiationGaps, weaknessHypotheses })
function deriveOpportunities({ differentiationGaps = [], weaknessHypotheses = [] }) {
  const out = [];
  for (const g of differentiationGaps) {
    out.push(mk({
      opportunity_type: GAP_TYPE_TO_OPP[g.gap_type] || 'underused_message',
      opportunity: `Consider occupying the position implied by: ${g.hypothesis}`,
      rationale: g.hypothesis,
      supporting_gap_refs: [g.gap_id],
      supporting_evidence_refs: g.supporting_evidence_refs,
      confidence: g.confidence,
      uncertainty: (g.confidence && g.confidence.band === 'MEDIUM') ? 'MEDIUM' : 'HIGH',
      recommended_validation: g.validation_needed,
    }));
  }
  // a competitor weakness that is coverage-supported can also imply an opportunity
  for (const wk of weaknessHypotheses.filter(h => h.coverage_supports_absence === true)) {
    out.push(mk({
      opportunity_type: 'under_addressed_problem',
      opportunity: `A peer weakness may be an opening: ${wk.statement}`,
      rationale: wk.statement,
      supporting_evidence_refs: wk.supporting_evidence_refs,
      confidence: wk.confidence,
    }));
  }
  return out;
}

function validateOpportunity(o) {
  const errors = [];
  if (o.autonomous !== false || o.requires_human_validation !== true) errors.push('opportunity must be non-autonomous and require human validation');
  if (o.expected_lift !== 'NOT_ESTIMATED') errors.push('expected_lift must not be fabricated');
  if (!OPP_TYPES.includes(o.opportunity_type)) errors.push(`unknown opportunity_type "${o.opportunity_type}"`);
  if ((o.supporting_gap_refs.length + o.supporting_evidence_refs.length) === 0) errors.push('opportunity must reference a gap or evidence');
  return { valid: errors.length === 0, errors };
}

module.exports = { OPP_TYPES, deriveOpportunities, validateOpportunity };
