'use strict';
// [ASTRA-11H §G] Canonical JourneyFriction. Exact evidence + stage association preserved.
// Derived from ASTRA-11F OBSERVED observations via a controlled concept->friction map.
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const FRICTION_CATEGORIES = Object.freeze([
  'PRICE', 'TRUST', 'COMPLEXITY', 'TIME', 'RISK', 'PROOF', 'AVAILABILITY', 'IMPLEMENTATION',
  'INTERNAL_APPROVAL', 'INFORMATION_GAP', 'CHANNEL_FRICTION', 'PAYMENT', 'ONBOARDING', 'PRODUCT_FIT', 'UNKNOWN',
]);

// concept -> { friction, stage } (stage = where the friction is evidenced).
const CONCEPT_FRICTION = Object.freeze({
  PRICE_CONCERN: { friction: 'PRICE', stage: 'PURCHASE_INTENT' },
  FINANCING_DEMAND: { friction: 'PRICE', stage: 'PURCHASE_INTENT' },
  TRUST_CONCERN: { friction: 'TRUST', stage: 'VENDOR_EVALUATION' },
  RESULTS_UNCERTAINTY: { friction: 'RISK', stage: 'VENDOR_EVALUATION' },
  PAIN_FEAR: { friction: 'RISK', stage: 'VENDOR_EVALUATION' },
  GUARANTEE_DEMAND: { friction: 'PROOF', stage: 'VENDOR_EVALUATION' },
  PROCESS_UNCLEAR: { friction: 'INFORMATION_GAP', stage: 'INFORMATION_SEEKING' },
  SLOW_SERVICE: { friction: 'TIME', stage: 'VENDOR_EVALUATION' },
  RESPONSIVENESS_COMPLAINT: { friction: 'CHANNEL_FRICTION', stage: 'VENDOR_EVALUATION' },
});

function buildFrictions({ vocResult }) {
  const out = [];
  for (const vo of (vocResult.observations || [])) {
    if (vo.status !== 'OBSERVED') continue;
    if (vo.negated) continue; // "no me pareció caro" is not a price friction
    const map = CONCEPT_FRICTION[vo.normalized_concept];
    if (!map) continue;
    const body = {
      schema_version: 'ucdm-journey-1.0.0', kind: 'JourneyFriction',
      category: map.friction, stage: map.stage,
      concept: vo.normalized_concept,
      verbatim_span: vo.exact_span.text,
      polarity: vo.polarity,
      evidence_refs: [...new Set(vo.evidence_refs)].sort(),
      source_ref: vo.source_ref || null,
      speaker_pseudonym: vo.speaker_pseudonym || null,
      speaker_role: vo.speaker_role,
      status: ['CUSTOMER', 'PROSPECT', 'FORMER_CUSTOMER'].includes(vo.speaker_role) ? 'OBSERVED' : 'ANALYTICAL',
      generated_by: 'deterministic:ucdm/journey',
    };
    body.friction_id = 'jfr_' + sha256Hex(canonicalize({ ...body, friction_id: undefined }));
    out.push(deepFreeze(body));
  }
  return out;
}

function validateFriction(f) {
  const errors = [];
  if (!FRICTION_CATEGORIES.includes(f.category)) errors.push(`bad friction category "${f.category}"`);
  if (f.evidence_refs.length === 0) errors.push('friction must preserve its evidence');
  if (!f.verbatim_span) errors.push('friction must preserve the exact evidence span');
  return { valid: errors.length === 0, errors };
}

module.exports = { FRICTION_CATEGORIES, CONCEPT_FRICTION, buildFrictions, validateFriction };
