'use strict';
// [ASTRA-11H §W] Evidence-backed retention / churn signals. ASTRA does NOT infer a churn
// probability — there is no validated predictive model here. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const SIGNAL_TYPES = Object.freeze([
  'SATISFACTION', 'UNMET_EXPECTATION', 'REPEATED_FRICTION', 'VALUE_ACHIEVED', 'VALUE_NOT_ACHIEVED',
  'SUPPORT_ISSUE', 'RENEWAL_INTENT', 'CANCELLATION_INTENT', 'EXPANSION_INTENT',
]);

function buildRetentionChurnSignals({ vocResult = {}, events = [], frictions = [] }) {
  const obs = (vocResult.observations || []).filter(o => o.status === 'OBSERVED');
  const signals = [];
  const add = (type, evidence_refs, detail) => {
    if (!evidence_refs.length) return;
    const body = {
      schema_version: 'ucdm-journey-1.0.0', kind: 'RetentionChurnSignal',
      signal_type: type, detail: detail || null,
      evidence_refs: [...new Set(evidence_refs)].sort(),
      is_prediction: false,
      note: 'evidence-backed signal only — NOT a churn probability',
      generated_by: 'deterministic:ucdm/journey/retention_churn',
    };
    body.signal_id = 'jrc_' + sha256Hex(canonicalize({ ...body, signal_id: undefined }));
    signals.push(deepFreeze(body));
  };

  add('SATISFACTION', obs.filter(o => o.normalized_concept === 'QUALITY_PRAISE' && o.polarity === 'POSITIVE').flatMap(o => o.evidence_refs), 'quality praise');
  add('UNMET_EXPECTATION', obs.filter(o => ['RESULTS_UNCERTAINTY'].includes(o.normalized_concept) || (o.prior_experience && o.polarity === 'NEGATIVE')).flatMap(o => o.evidence_refs), 'expectation gap');
  const fricByCat = {};
  for (const f of frictions) (fricByCat[f.category] = fricByCat[f.category] || []).push(f);
  for (const [cat, fs] of Object.entries(fricByCat)) if (fs.length >= 3) add('REPEATED_FRICTION', fs.flatMap(f => f.evidence_refs), cat);
  add('VALUE_ACHIEVED', events.filter(e => e.event_type === 'RESULT_ACHIEVED').flatMap(e => e.evidence_refs), 'result achieved event');
  add('SUPPORT_ISSUE', obs.filter(o => ['RESPONSIVENESS_COMPLAINT', 'SLOW_SERVICE'].includes(o.normalized_concept)).flatMap(o => o.evidence_refs), 'responsiveness / speed complaint');
  add('RENEWAL_INTENT', events.filter(e => e.event_type === 'RENEWAL_CONSIDERED').flatMap(e => e.evidence_refs), 'renewal considered event');
  add('CANCELLATION_INTENT', events.filter(e => e.event_type === 'CANCELLATION_REQUESTED').flatMap(e => e.evidence_refs), 'cancellation requested event');

  return deepFreeze({
    schema_version: 'ucdm-journey-1.0.0', kind: 'RetentionChurnSignals',
    signals, signal_types_present: [...new Set(signals.map(s => s.signal_type))].sort(),
    churn_probability: null,
    note: 'no churn probability is produced — that would require a validated predictive model',
    generated_by: 'deterministic:ucdm/journey/retention_churn',
  });
}

function validateSignal(s) {
  const errors = [];
  if (!SIGNAL_TYPES.includes(s.signal_type)) errors.push(`bad signal_type "${s.signal_type}"`);
  if (s.evidence_refs.length === 0) errors.push('a retention/churn signal must be evidence-backed');
  if (s.is_prediction !== false) errors.push('retention/churn signals are not predictions');
  return { valid: errors.length === 0, errors };
}

module.exports = { SIGNAL_TYPES, buildRetentionChurnSignals, validateSignal };
