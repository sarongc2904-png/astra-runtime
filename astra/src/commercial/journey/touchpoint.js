'use strict';
// [ASTRA-11H §K] Provider-neutral touchpoints / channels. A channel does NOT imply influence
// or causality — every touchpoint carries `implies_attribution: false`. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const TOUCHPOINTS = Object.freeze([
  'SEARCH', 'SOCIAL_AD', 'ORGANIC_SOCIAL', 'WEBSITE', 'LANDING_PAGE', 'WHATSAPP', 'PHONE', 'EMAIL',
  'IN_PERSON', 'REFERRAL', 'MARKETPLACE', 'WEBINAR', 'SALES_CALL', 'DEMO', 'CHECKOUT', 'APP', 'SUPPORT', 'UNKNOWN',
]);

// ASTRA-11C/11F source_type + explicit event detail -> touchpoint.
const SOURCE_TYPE_MAP = Object.freeze({
  REVIEW: 'UNKNOWN', SOCIAL_COMMENT: 'ORGANIC_SOCIAL', SOCIAL_POST: 'ORGANIC_SOCIAL',
  CHAT_LOG: 'WHATSAPP', CALL_TRANSCRIPT: 'PHONE', EMAIL: 'EMAIL', SUPPORT_TICKET: 'SUPPORT',
  WEB_PAGE: 'WEBSITE', SURVEY: 'UNKNOWN', INTERVIEW: 'IN_PERSON', FORUM_POST: 'ORGANIC_SOCIAL',
});
const EVENT_TOUCHPOINT = Object.freeze({
  AD_SEEN: 'SOCIAL_AD', SEARCH_PERFORMED: 'SEARCH', WEBSITE_VISIT: 'WEBSITE', INQUIRY_SENT: 'WHATSAPP',
  QUOTE_REQUESTED: 'SALES_CALL', RECOMMENDATION_RECEIVED: 'REFERRAL', PAYMENT_ATTEMPTED: 'CHECKOUT',
  PURCHASE_COMPLETED: 'CHECKOUT', ONBOARDING_STARTED: 'IN_PERSON', PRODUCT_FIRST_USED: 'APP',
});

function buildTouchpoints({ journeyObservations = [], events = [] }) {
  const rows = new Map();
  const add = (tp, stage, evidence_refs, source_ref, basis) => {
    const cur = rows.get(tp) || { touchpoint: tp, stages: new Set(), evidence_refs: new Set(), source_refs: new Set(), basis };
    cur.stages.add(stage);
    for (const er of evidence_refs) cur.evidence_refs.add(er);
    if (source_ref) cur.source_refs.add(source_ref);
    rows.set(tp, cur);
  };
  for (const e of events) { const tp = EVENT_TOUCHPOINT[e.event_type]; if (tp) add(tp, e.evidenced_stage, e.evidence_refs, e.source_ref, 'event'); }
  for (const o of journeyObservations) {
    const tp = SOURCE_TYPE_MAP[o.channel] || (TOUCHPOINTS.includes(o.channel) ? o.channel : 'UNKNOWN');
    if (tp === 'UNKNOWN') continue;
    add(tp, o.stage, o.evidence_refs, o.source_ref, 'source_type');
  }
  return [...rows.values()].map(r => {
    const body = {
      schema_version: 'ucdm-journey-1.0.0', kind: 'JourneyTouchpoint',
      touchpoint: r.touchpoint, stages: [...r.stages].sort(),
      evidence_refs: [...r.evidence_refs].sort(), source_refs: [...r.source_refs].sort(),
      basis: r.basis, observed_count: r.source_refs.size,
      implies_attribution: false,
      note: 'a channel appearing in evidence does NOT imply it influenced or caused the decision',
      generated_by: 'deterministic:ucdm/journey',
    };
    body.touchpoint_id = 'jtp_' + sha256Hex(canonicalize({ ...body, touchpoint_id: undefined }));
    return deepFreeze(body);
  }).sort((a, b) => (a.touchpoint < b.touchpoint ? -1 : 1));
}

function validateTouchpoint(t) {
  const errors = [];
  if (!TOUCHPOINTS.includes(t.touchpoint)) errors.push(`bad touchpoint "${t.touchpoint}"`);
  if (t.implies_attribution !== false) errors.push('a touchpoint must not imply attribution');
  return { valid: errors.length === 0, errors };
}

module.exports = { TOUCHPOINTS, SOURCE_TYPE_MAP, buildTouchpoints, validateTouchpoint };
