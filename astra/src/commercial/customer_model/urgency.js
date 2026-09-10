'use strict';
// [ASTRA-11G §L] Commercial urgency. Must be evidence-backed. Urgency is NEVER inferred
// from engagement frequency / volume of messages — only from explicit urgency signals.
// MIXED preserved. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const URGENCY_LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'MIXED', 'UNKNOWN']);

// Controlled urgency signals. `trigger_type`s that legitimately imply timing pressure,
// plus concept signals for a worsening problem.
const HIGH_TRIGGER_TYPES = Object.freeze(['deadline', 'urgent_need', 'pain_worsened', 'business_slowdown', 'failed_previous_solution', 'seasonality']);
const MEDIUM_TRIGGER_TYPES = Object.freeze(['life_event', 'new_budget', 'new_responsibility', 'promotion', 'recommendation']);
const HIGH_CONCEPTS = Object.freeze(['SLOW_SERVICE', 'RESPONSIVENESS_COMPLAINT']); // an active, worsening pain

// classifyUrgency({ triggers, observations, explicit }) -> frozen assessment
function classifyUrgency({ triggers = [], observations = [], explicit = null } = {}) {
  if (explicit && URGENCY_LEVELS.includes(explicit.level)) {
    return deepFreeze(mk({ level: explicit.level, basis: 'OBSERVED', evidence_refs: explicit.evidence_refs || [], signals: ['explicit'], note: 'explicitly supplied/observed' }));
  }
  const signals = [];
  const ev = [];
  let high = 0, med = 0;
  for (const t of triggers) {
    if (HIGH_TRIGGER_TYPES.includes(t.trigger_type)) { high++; signals.push('trigger:' + t.trigger_type); ev.push(...(t.evidence_refs || [])); }
    else if (MEDIUM_TRIGGER_TYPES.includes(t.trigger_type)) { med++; signals.push('trigger:' + t.trigger_type); ev.push(...(t.evidence_refs || [])); }
  }
  for (const o of observations) {
    if (o.status !== 'OBSERVED') continue;
    if (HIGH_CONCEPTS.includes(o.normalized_concept) && o.polarity === 'NEGATIVE') { high++; signals.push('concept:' + o.normalized_concept); ev.push(...o.evidence_refs); }
  }
  let level, basis = 'ANALYTICAL';
  if (high > 0 && med > 0) level = 'MIXED';
  else if (high > 0) level = 'HIGH';
  else if (med > 0) level = 'MEDIUM';
  else { level = 'UNKNOWN'; basis = 'UNKNOWN'; }
  return deepFreeze(mk({ level, basis, evidence_refs: [...new Set(ev)].sort(), signals: [...new Set(signals)].sort(), note: level === 'UNKNOWN' ? 'no explicit urgency signal — engagement volume is NOT used as an urgency proxy' : 'analytical from controlled urgency signals only' }));
}

function mk(x) {
  const body = {
    schema_version: 'ucdm-customer-model-1.0.0', kind: 'UrgencyAssessment',
    level: x.level, basis: x.basis, evidence_refs: x.evidence_refs, signals: x.signals,
    note: x.note, generated_by: 'deterministic:ucdm/customer_model/urgency',
  };
  body.urgency_id = 'cmur_' + sha256Hex(canonicalize({ ...body, urgency_id: undefined }));
  return body;
}

function validateUrgency(u) {
  const errors = [];
  if (!URGENCY_LEVELS.includes(u.level)) errors.push(`bad urgency level "${u.level}"`);
  if (['LOW', 'MEDIUM', 'HIGH', 'MIXED'].includes(u.level) && u.evidence_refs.length === 0) errors.push('a non-UNKNOWN urgency needs evidence_refs');
  if ((u.signals || []).some(s => /frequency|volume|engagement/i.test(s))) errors.push('engagement frequency must not be an urgency signal');
  return { valid: errors.length === 0, errors };
}

module.exports = { URGENCY_LEVELS, HIGH_TRIGGER_TYPES, MEDIUM_TRIGGER_TYPES, classifyUrgency, validateUrgency };
