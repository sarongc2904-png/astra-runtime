'use strict';
// [ASTRA-11I §P] PackagingCandidate — analytical. Every candidate cites the constraints /
// evidence behind it and is non-autonomous. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const PACKAGING_TYPES = Object.freeze([
  'SINGLE_OFFER', 'TIERED', 'GOOD_BETTER_BEST', 'USAGE_BASED', 'SUBSCRIPTION', 'RETAINER', 'ONE_TIME', 'BUNDLE', 'MODULAR',
]);

// buildPackagingCandidates({ customerModel, vocResult, businessInput, mode }) -> [PackagingCandidate]
function buildPackagingCandidates({ customerModel = null, vocResult = {}, businessInput = {}, mode = 'B2C' }) {
  const segCount = ((customerModel && customerModel.segments) || []).filter(s => ['SUPPORTED', 'PARTIAL'].includes(s.status)).length;
  const priceSensitive = (vocResult.observations || []).some(o => o.status === 'OBSERVED' && o.normalized_concept === 'PRICE_CONCERN');
  const financing = (vocResult.observations || []).some(o => o.status === 'OBSERVED' && o.normalized_concept === 'FINANCING_DEMAND');
  const supplied = (businessInput.supplied_offer && businessInput.supplied_offer.packaging) || null;
  const constraints = (businessInput.constraints || []).map(c => c.type);

  const cands = [];
  const push = (type, rationale, evidence_refs) => cands.push({ type, rationale, evidence_refs: [...new Set(evidence_refs)].sort() });

  if (supplied) push(String(supplied).toUpperCase(), 'business-supplied packaging', []);
  if (segCount >= 2) push('TIERED', `${segCount} distinct segments with different needs may warrant tiers`, ((customerModel && customerModel.segments) || []).flatMap(s => s.supporting_evidence_refs));
  if (priceSensitive) push('GOOD_BETTER_BEST', 'price-sensitive customers evidenced — an entry tier lowers the barrier', (vocResult.observations || []).filter(o => o.normalized_concept === 'PRICE_CONCERN').flatMap(o => o.evidence_refs));
  if (financing) push('SUBSCRIPTION', 'financing demand evidenced — spreading payment may fit', (vocResult.observations || []).filter(o => o.normalized_concept === 'FINANCING_DEMAND').flatMap(o => o.evidence_refs));
  if (mode === 'B2B') push('RETAINER', 'B2B service context', []);
  if (cands.length === 0) push('SINGLE_OFFER', 'no evidence yet for multi-tier packaging', []);

  return cands.map(c => {
    const body = {
      schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'PackagingCandidate',
      packaging_type: PACKAGING_TYPES.includes(c.type) ? c.type : 'SINGLE_OFFER',
      rationale: c.rationale, evidence_refs: c.evidence_refs,
      cited_constraints: constraints.sort(),
      status: 'ANALYTICAL', autonomous: false, is_recommendation: false,
      generated_by: 'deterministic:ucdm/positioning_offer',
    };
    body.packaging_id = 'pk_' + sha256Hex(canonicalize({ ...body, packaging_id: undefined }));
    return deepFreeze(body);
  });
}

function validatePackaging(p) {
  const errors = [];
  if (!PACKAGING_TYPES.includes(p.packaging_type)) errors.push(`bad packaging_type "${p.packaging_type}"`);
  if (p.status !== 'ANALYTICAL') errors.push('packaging candidate is analytical');
  if (p.autonomous !== false) errors.push('packaging candidate must be non-autonomous');
  if (p.rationale == null || p.rationale === '') errors.push('packaging candidate must cite a rationale');
  return { valid: errors.length === 0, errors };
}

module.exports = { PACKAGING_TYPES, buildPackagingCandidates, validatePackaging };
