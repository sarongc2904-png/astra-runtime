'use strict';
// [ASTRA-11I §T] Offer-Competitor comparison. Compare ONLY observed/supported dimensions.
// Never "better" without a defined dimension AND evidence. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { classifyType } = require('./differentiation');

const COMPARISON_STATUS = Object.freeze(['SAME', 'STRONGER_EVIDENCE', 'WEAKER_EVIDENCE', 'DIFFERENTIATED', 'NOT_OBSERVED', 'UNKNOWN']);

// buildCompetitorComparison({ differentiation, offerArchitecture, proofStrategy, pricing, researchResult, competitorResult })
function buildCompetitorComparison(x) {
  const { differentiation = [], proofStrategy = null, pricing = null, researchResult = null } = x;
  const competitorTexts = [
    ...((researchResult && researchResult.message_observations) || []).map(m => m.verbatim_text || m.text || m.message || ''),
    ...((researchResult && researchResult.offer_items) || []).map(o => o.component || o.text || ''),
  ];
  const competitorTypes = new Set(competitorTexts.map(classifyType).filter(t => t !== 'UNKNOWN'));
  const sampleSize = competitorTexts.length;

  const dims = [];
  const push = (dimension, ourEvidence, theirObserved, evidence_refs) => {
    let status;
    if (sampleSize === 0) status = 'UNKNOWN';
    else if (ourEvidence && !theirObserved) status = 'DIFFERENTIATED';
    else if (ourEvidence && theirObserved) status = 'SAME';
    else if (!ourEvidence && theirObserved) status = 'NOT_OBSERVED';
    else status = 'UNKNOWN';
    dims.push(deepFreeze({ dimension, our_evidence: !!ourEvidence, competitor_observed: !!theirObserved, status, evidence_refs: [...new Set(evidence_refs || [])].sort() }));
  };

  for (const d of differentiation) {
    const our = d.observed_capability.evidence_refs.length > 0 || d.observed_capability.source_class === 'USER_PROVIDED';
    push(d.differentiation_type, our, competitorTypes.has(d.differentiation_type), d.observed_capability.evidence_refs.concat(d.analytical_hypothesis.evidence_refs));
  }
  // proof dimension
  const ourProof = new Set((proofStrategy ? proofStrategy.available : []).map(p => p.proof_type));
  const theirProof = /testimon|casos? de [eé]xito|antes y despu[eé]s|resultados comprobad/i.test(competitorTexts.join(' '));
  push('PROOF', ourProof.size > 0, theirProof, [...new Set((proofStrategy ? proofStrategy.available : []).flatMap(p => p.evidence_refs))]);
  // pricing dimension — only if both sides have observed/supplied price
  const ourPrice = pricing && pricing.own_supplied_price.status !== 'UNKNOWN';
  const theirPrice = pricing && pricing.observed_competitor_prices.length > 0;
  if (ourPrice || theirPrice) push('PRICING_MODEL', ourPrice, theirPrice, (pricing ? pricing.observed_competitor_prices.flatMap(p => p.evidence_refs) : []));

  const body = {
    schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'CompetitorComparison',
    competitor_sample_size: sampleSize,
    dimensions: dims,
    scoped_to_evidence: true,
    better_claims: [], // never populated — "better" is not asserted without a defined, evidenced dimension
    note: sampleSize === 0 ? 'no observed competitor offers/messages — comparison is UNKNOWN' : `compared against ${sampleSize} observed competitor items only`,
    generated_by: 'deterministic:ucdm/positioning_offer',
  };
  body.comparison_id = 'cc_' + sha256Hex(canonicalize({ ...body, comparison_id: undefined }));
  return deepFreeze(body);
}

function validateCompetitorComparison(c) {
  const errors = [];
  if (c.better_claims.length > 0) errors.push('no "better" claim without a defined dimension and evidence');
  if (c.scoped_to_evidence !== true) errors.push('comparison must be scoped to evidence');
  for (const d of c.dimensions) {
    if (!COMPARISON_STATUS.includes(d.status)) errors.push(`bad comparison status "${d.status}"`);
    if (d.status === 'STRONGER_EVIDENCE' && d.evidence_refs.length === 0) errors.push('STRONGER_EVIDENCE requires evidence');
    if (d.status === 'DIFFERENTIATED' && c.competitor_sample_size === 0) errors.push('cannot claim DIFFERENTIATED with no competitor sample');
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { COMPARISON_STATUS, buildCompetitorComparison, validateCompetitorComparison };
