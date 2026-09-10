'use strict';
// [ASTRA-11I §C] Category / frame of reference. ASTRA does NOT invent a new category for
// novelty — a NEW_CATEGORY / ALTERNATIVE_CATEGORY frame is only used when the business
// explicitly supplies it. Otherwise the frame is problem- or outcome-based, or UNKNOWN.
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const FRAME_TYPES = Object.freeze([
  'EXISTING_CATEGORY', 'SUBCATEGORY', 'ALTERNATIVE_CATEGORY', 'PROBLEM_BASED_FRAME', 'OUTCOME_BASED_FRAME', 'UNKNOWN',
]);

// resolveFrame({ segment, persona, journeyAlternatives, businessInput }) -> frozen CategoryFrame
function resolveFrame({ segment = null, persona = null, journeyAlternatives = [], businessInput = {} }) {
  const bi = businessInput.category || {};
  let frame_type, label, basis, evidence_refs = [];

  if (bi.new_category === true && bi.label) { frame_type = 'ALTERNATIVE_CATEGORY'; label = String(bi.label); basis = 'USER_PROVIDED'; }
  else if (bi.existing_category) { frame_type = bi.subcategory ? 'SUBCATEGORY' : 'EXISTING_CATEGORY'; label = String(bi.subcategory || bi.existing_category); basis = 'USER_PROVIDED'; }
  else if (persona && persona.desired_situation && persona.desired_situation.status !== 'UNKNOWN') {
    frame_type = 'OUTCOME_BASED_FRAME'; label = persona.desired_situation.concept; basis = 'ANALYTICAL';
    evidence_refs = persona.desired_situation.evidence_refs || [];
  } else if (segment && segment.primary_concept && segment.primary_concept !== 'UNKNOWN_CONCEPT') {
    frame_type = 'PROBLEM_BASED_FRAME'; label = segment.primary_concept; basis = 'ANALYTICAL';
    evidence_refs = segment.supporting_evidence_refs || [];
  } else { frame_type = 'UNKNOWN'; label = null; basis = 'UNKNOWN'; }

  // reference points = the alternatives the customer actually weighs (from ASTRA-11H)
  const reference_points = [...new Set((journeyAlternatives || []).map(a => a.alternative_type))].sort();

  const body = {
    schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'CategoryFrame',
    frame_type, label, basis, evidence_refs: [...new Set(evidence_refs)].sort(),
    reference_points,
    invented_for_novelty: false,
    note: basis === 'USER_PROVIDED' ? 'category supplied by the business' : basis === 'ANALYTICAL' ? 'frame derived from evidenced problem/outcome — not a new category' : 'no category signal',
    generated_by: 'deterministic:ucdm/positioning_offer',
  };
  body.frame_id = 'cf_' + sha256Hex(canonicalize({ ...body, frame_id: undefined }));
  return deepFreeze(body);
}

function validateFrame(f) {
  const errors = [];
  if (!FRAME_TYPES.includes(f.frame_type)) errors.push(`bad frame_type "${f.frame_type}"`);
  if (f.frame_type === 'ALTERNATIVE_CATEGORY' && f.basis !== 'USER_PROVIDED') errors.push('a new/alternative category frame must be USER_PROVIDED (never invented for novelty)');
  if (f.invented_for_novelty !== false) errors.push('invented_for_novelty must be false');
  if (['PROBLEM_BASED_FRAME', 'OUTCOME_BASED_FRAME'].includes(f.frame_type) && f.evidence_refs.length === 0) errors.push('an analytical frame needs evidence');
  return { valid: errors.length === 0, errors };
}

module.exports = { FRAME_TYPES, resolveFrame, validateFrame };
