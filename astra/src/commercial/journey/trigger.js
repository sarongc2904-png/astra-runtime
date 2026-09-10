'use strict';
// [ASTRA-11H §F] Journey triggers. Reuses ASTRA-11F VocTrigger + ASTRA-11G trigger attribute
// evidence — NO parallel trigger system. Every trigger is evidence-backed; UNKNOWN allowed.
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const TRIGGER_CATEGORIES = Object.freeze([
  'PAIN_ESCALATION', 'DEADLINE', 'LIFE_EVENT', 'BUSINESS_EVENT', 'RECOMMENDATION', 'PROMOTION',
  'FAILURE_OF_CURRENT_SOLUTION', 'NEW_INFORMATION', 'BUDGET_AVAILABLE', 'RISK_EVENT', 'SOCIAL_PROOF', 'UNKNOWN',
]);

// ASTRA-11F trigger_type -> controlled journey category.
const VOC_TRIGGER_MAP = Object.freeze({
  pain_worsened: 'PAIN_ESCALATION', deadline: 'DEADLINE', life_event: 'LIFE_EVENT',
  business_slowdown: 'BUSINESS_EVENT', failed_previous_solution: 'FAILURE_OF_CURRENT_SOLUTION',
  recommendation: 'RECOMMENDATION', promotion: 'PROMOTION', new_budget: 'BUDGET_AVAILABLE',
  new_responsibility: 'BUSINESS_EVENT', seasonality: 'BUSINESS_EVENT', urgent_need: 'PAIN_ESCALATION',
});

function buildTriggers({ vocResult }) {
  const out = [];
  for (const t of (vocResult.triggers || [])) {
    const category = VOC_TRIGGER_MAP[t.trigger_type] || 'UNKNOWN';
    const eligible = ['CUSTOMER', 'PROSPECT', 'FORMER_CUSTOMER'].includes(t.speaker_role);
    const body = {
      schema_version: 'ucdm-journey-1.0.0', kind: 'JourneyTrigger',
      category, voc_trigger_type: t.trigger_type,
      verbatim_span: t.verbatim_span || null,
      evidence_refs: [...new Set(t.evidence_refs || [])].sort(),
      source_ref: t.source_ref || null,
      speaker_pseudonym: t.speaker_pseudonym || null,
      status: eligible ? 'OBSERVED' : 'ANALYTICAL',
      grounded_in_evidence: (t.evidence_refs || []).length > 0,
      source: 'reuses ASTRA-11F VocTrigger',
      generated_by: 'deterministic:ucdm/journey',
    };
    body.trigger_id = 'jtr_' + sha256Hex(canonicalize({ ...body, trigger_id: undefined }));
    out.push(deepFreeze(body));
  }
  return out;
}

function validateTrigger(t) {
  const errors = [];
  if (!TRIGGER_CATEGORIES.includes(t.category)) errors.push(`bad trigger category "${t.category}"`);
  if (t.category !== 'UNKNOWN' && (!t.grounded_in_evidence || t.evidence_refs.length === 0)) errors.push('a known journey trigger must be evidence-backed');
  return { valid: errors.length === 0, errors };
}

module.exports = { TRIGGER_CATEGORIES, VOC_TRIGGER_MAP, buildTriggers, validateTrigger };
