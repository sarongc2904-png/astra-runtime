'use strict';
// [ASTRA-11M §8] Time-to-signal. Respects a valid ASTRA-11K estimate when present; otherwise
// classifies ordinally from the action type. Time is never invented. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const C = require('./contracts');

// default ordinal by analytical action type (used only when 11K gave nothing)
const BY_ACTION = Object.freeze({
  MEASURE: 'SHORT', INVESTIGATE: 'SHORT', VALIDATE: 'MEDIUM', TEST: 'MEDIUM',
  FIX_PROCESS: 'MEDIUM', ITERATE: 'MEDIUM', HOLD: 'IMMEDIATE', STOP: 'IMMEDIATE',
  REPRIORITIZE: 'IMMEDIATE', DO_NOT_SCALE: 'IMMEDIATE',
});

function classifyTimeToSignal({ opportunity, experiment, action_type }) {
  const reasons = [];
  let cls = 'UNKNOWN';
  let source = null;

  if (experiment && experiment.time_to_signal && experiment.time_to_signal.status === 'VALID' && C.TIME_TO_SIGNAL.includes(experiment.time_to_signal.signal_class)) {
    cls = experiment.time_to_signal.signal_class; source = 'astra11k'; reasons.push('from ASTRA-11K valid time-to-signal estimate');
  } else if (experiment && C.TIME_TO_SIGNAL.includes(experiment.signal_class)) {
    cls = experiment.signal_class; source = 'astra11k'; reasons.push('from ASTRA-11K signal_class');
  } else if (opportunity && C.TIME_TO_SIGNAL.includes(opportunity.time_to_signal) && opportunity.time_to_signal !== 'UNKNOWN') {
    cls = opportunity.time_to_signal; source = 'opportunity'; reasons.push('from normalized opportunity');
  } else if (action_type && BY_ACTION[action_type]) {
    cls = BY_ACTION[action_type]; source = 'action_type_default'; reasons.push(`ordinal default for ${action_type} (no upstream estimate)`);
  }

  const body = {
    schema_version: C.DECISION_SCHEMA_VERSION, kind: 'TimeToSignalAssessment',
    signal_class: cls, source, fabricated_duration: false, reasons: reasons.sort(),
    generated_by: 'deterministic:ucdm/decision_orchestrator/time_to_signal',
  };
  body.assessment_id = 'dts_' + sha256Hex(canonicalize({ ...body, assessment_id: undefined })).slice(0, 40);
  return deepFreeze(body);
}

function validateTimeToSignal(t) {
  const errors = [];
  if (!C.TIME_TO_SIGNAL.includes(t.signal_class)) errors.push(`bad signal_class "${t.signal_class}"`);
  if (t.fabricated_duration !== false) errors.push('duration must never be fabricated');
  return { valid: errors.length === 0, errors };
}

module.exports = { BY_ACTION, classifyTimeToSignal, validateTimeToSignal };
