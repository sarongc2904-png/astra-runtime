'use strict';
// [ASTRA-11I §I] Canonical OfferComponent. Every component declares its source/status.
// Bonuses / guarantees / scarcity / urgency are NEVER manufactured — they exist only when
// USER_PROVIDED. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { SOURCE_CLASSES } = require('../provenance/provenance');

const COMPONENT_TYPES = Object.freeze([
  'CORE_OFFER', 'DELIVERABLE', 'FEATURE', 'CAPABILITY', 'BENEFIT', 'OUTCOME_LINK', 'MECHANISM',
  'ONBOARDING', 'SUPPORT', 'BONUS', 'GUARANTEE', 'PROOF', 'URGENCY', 'SCARCITY', 'PRICING',
  'PAYMENT_TERM', 'FINANCING', 'ELIGIBILITY', 'DISQUALIFIER', 'CONSTRAINT',
]);
const COMPONENT_STATUS = Object.freeze(['OBSERVED', 'USER_PROVIDED', 'COMPUTED', 'ANALYTICAL', 'UNKNOWN']);
// component types that may ONLY ever be USER_PROVIDED (or UNKNOWN) — never analytically invented
const SUPPLIED_ONLY = Object.freeze(['BONUS', 'GUARANTEE', 'SCARCITY', 'URGENCY', 'FINANCING', 'PAYMENT_TERM']);

function makeOfferComponent(x) {
  const component_type = String(x.component_type);
  const status = COMPONENT_STATUS.includes(x.status) ? x.status : 'UNKNOWN';
  const forced = SUPPLIED_ONLY.includes(component_type) && !['USER_PROVIDED', 'UNKNOWN'].includes(status);
  const body = {
    schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'OfferComponent',
    component_type: COMPONENT_TYPES.includes(component_type) ? component_type : 'CONSTRAINT',
    label: String(x.label || ''),
    detail: x.detail === undefined ? null : x.detail,
    status: forced ? 'UNKNOWN' : status,
    source_class: SOURCE_CLASSES.includes(x.source_class) ? x.source_class : (status === 'USER_PROVIDED' ? 'USER_PROVIDED' : 'COMPUTED'),
    value_rationale: x.value_rationale == null ? null : String(x.value_rationale),
    segment_relevance: x.segment_relevance || 'UNKNOWN',
    segment_refs: [...new Set(x.segment_refs || [])].sort(),
    jtbd_refs: [...new Set(x.jtbd_refs || [])].sort(),
    evidence_refs: [...new Set((x.evidence_refs || []).map(String))].sort(),
    constraints: [...new Set(x.constraints || [])].sort(),
    manufactured_block: forced,
    generated_by: 'deterministic:ucdm/positioning_offer',
  };
  body.component_id = 'oc_' + sha256Hex(canonicalize({ ...body, component_id: undefined }));
  return deepFreeze(body);
}

function validateOfferComponent(c) {
  const errors = [];
  if (!COMPONENT_TYPES.includes(c.component_type)) errors.push(`bad component_type "${c.component_type}"`);
  if (!COMPONENT_STATUS.includes(c.status)) errors.push(`bad component status "${c.status}"`);
  if (SUPPLIED_ONLY.includes(c.component_type) && !['USER_PROVIDED', 'UNKNOWN'].includes(c.status)) errors.push(`${c.component_type} may only be USER_PROVIDED or UNKNOWN (never manufactured)`);
  if (['OBSERVED', 'USER_PROVIDED'].includes(c.status) && c.source_class !== 'USER_PROVIDED' && c.evidence_refs.length === 0) errors.push(`a ${c.status} component needs evidence or a USER_PROVIDED source`);
  return { valid: errors.length === 0, errors };
}

module.exports = { COMPONENT_TYPES, COMPONENT_STATUS, SUPPLIED_ONLY, makeOfferComponent, validateOfferComponent };
