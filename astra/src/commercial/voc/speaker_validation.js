'use strict';
// [ASTRA-11F §A] Speaker / source-role validation. Only customer/prospect-attributable
// language may become canonical VOC. Business marketing copy and competitor copy can NEVER
// become VOC. Unknown attribution stays UNKNOWN. No LLM, no web, no I/O.
const { sha256Hex } = require('../validation/canonical');

const SPEAKER_ROLES = Object.freeze([
  'CUSTOMER', 'PROSPECT', 'FORMER_CUSTOMER', 'UNKNOWN_CUSTOMER_ROLE',
  'BUSINESS', 'SALESPERSON', 'COMPETITOR', 'THIRD_PARTY',
]);
// roles whose language may become CANONICAL VOC (counts toward prevalence)
const VOC_ELIGIBLE_ROLES = Object.freeze(['CUSTOMER', 'PROSPECT', 'FORMER_CUSTOMER']);

const VOC_SOURCE_TYPES = Object.freeze([
  'review', 'survey_response', 'customer_conversation', 'sales_conversation', 'support_conversation',
  'call_transcript', 'form_response', 'social_comment', 'customer_message', 'testimonial',
  'interview', 'user_provided_quote',
]);

// Map an ASTRA-11C source_category to a candidate VOC source type.
const CATEGORY_TO_VOC_SOURCE = {
  REVIEW: 'review', SURVEY_RESPONSE: 'survey_response', FORM_RESPONSE: 'form_response',
  SOCIAL_COMMENT: 'social_comment', CALL_TRANSCRIPT: 'call_transcript', CONVERSATION: 'customer_conversation',
  MESSAGE: 'customer_message', USER_INPUT: 'user_provided_quote',
};

// classifySpeaker({ observation, envelope, hint })
//   observation: an ASTRA-11D/11C QUOTE observation (has verbatim.actor, subject, ...)
//   envelope: the ASTRA-11C RawSourceEnvelope for the source (source_category)
//   hint (optional, human-supplied): { role, speaker_ref, source_type }
// Returns { speaker_role, voc_eligible, source_type, reason, speaker_pseudonym }
function classifySpeaker({ observation, envelope = null, hint = {} }) {
  const actor = (observation && observation.verbatim && (observation.verbatim.actor || '')).toLowerCase();
  const cat = envelope && envelope.source_category;
  const subjType = observation && observation.subject && observation.subject.subject_type;

  let role, reason;
  if (hint.role && SPEAKER_ROLES.includes(hint.role)) { role = hint.role; reason = 'human-supplied role hint'; }
  else if (actor === 'advertiser' || actor === 'business') { role = 'BUSINESS'; reason = 'actor is advertiser/business — marketing copy, never VOC'; }
  else if (actor === 'salesperson' || actor === 'agent' || actor === 'rep') { role = 'SALESPERSON'; reason = 'actor is a salesperson/agent'; }
  else if (subjType === 'Competitor') { role = 'COMPETITOR'; reason = 'observation is attributed to a competitor entity — never VOC'; }
  else if (actor === 'customer') { role = 'CUSTOMER'; reason = 'actor explicitly a customer'; }
  else if (actor === 'prospect') { role = 'PROSPECT'; reason = 'actor explicitly a prospect'; }
  else if (['REVIEW', 'TESTIMONIAL', 'SURVEY_RESPONSE', 'SOCIAL_COMMENT'].includes(cat) && (!actor || actor === 'customer')) { role = 'CUSTOMER'; reason = `${cat} with no conflicting actor -> customer-attributable`; }
  else if (cat === 'ADVERTISEMENT' || cat === 'WEB_PAGE') { role = 'BUSINESS'; reason = `${cat} is business/competitor-authored — never VOC`; }
  else { role = 'UNKNOWN_CUSTOMER_ROLE'; reason = 'speaker attribution could not be established — preserved as UNKNOWN'; }

  const source_type = hint.source_type && VOC_SOURCE_TYPES.includes(hint.source_type)
    ? hint.source_type
    : (CATEGORY_TO_VOC_SOURCE[cat] || 'user_provided_quote');

  const speaker_ref = hint.speaker_ref || (observation && observation.verbatim && observation.verbatim.speaker_ref) || null;
  const speaker_pseudonym = speaker_ref ? 'spk_' + sha256Hex(String(speaker_ref)).slice(0, 16) : null;

  return {
    speaker_role: role,
    voc_eligible: VOC_ELIGIBLE_ROLES.includes(role),
    source_type,
    reason,
    speaker_ref: speaker_ref,
    speaker_pseudonym,
  };
}

module.exports = { SPEAKER_ROLES, VOC_ELIGIBLE_ROLES, VOC_SOURCE_TYPES, CATEGORY_TO_VOC_SOURCE, classifySpeaker };
