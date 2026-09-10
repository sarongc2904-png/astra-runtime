'use strict';
// [ASTRA-11K §9] Time-to-signal — an explicit, deterministic model built ONLY from available
// inputs (funnel volume, event frequency, sales cycle, outcome delay, business cadence).
// If it cannot be estimated -> TIME_TO_SIGNAL_UNKNOWN. No invented "7 days". No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const SIGNAL_CLASSES = Object.freeze(['IMMEDIATE', 'SHORT', 'MEDIUM', 'LONG', 'TIME_TO_SIGNAL_UNKNOWN']);

// estimateTimeToSignal({ primary_event_frequency_per_week, sales_cycle_days, outcome_delay_days,
//                        business_cadence, min_events_for_signal })
function estimateTimeToSignal(x) {
  const freq = num(x.primary_event_frequency_per_week);        // events/week at the measured stage
  const cycle = num(x.sales_cycle_days);                       // time from entry to the measured outcome
  const delay = num(x.outcome_delay_days);                     // additional reporting/settlement delay
  const minEvents = x.min_events_for_signal != null ? Number(x.min_events_for_signal) : null;

  const inputs_present = [freq != null && 'event_frequency', cycle != null && 'sales_cycle_days', delay != null && 'outcome_delay_days', minEvents != null && 'min_events_for_signal'].filter(Boolean);

  let signal_class, estimated_days = null, reason = null;
  if (freq == null && cycle == null && delay == null) {
    signal_class = 'TIME_TO_SIGNAL_UNKNOWN';
    reason = 'no volume, cycle or delay input supplied — time to a first read cannot be estimated';
  } else {
    // days to accumulate the minimum events (if given), plus the outcome cycle + reporting delay
    const daysForEvents = (freq != null && minEvents != null && freq > 0) ? Math.ceil((minEvents / freq) * 7) : 0;
    const pipeline = (cycle || 0) + (delay || 0);
    estimated_days = daysForEvents + pipeline;
    if (estimated_days <= 0 && freq != null) { signal_class = 'IMMEDIATE'; estimated_days = 0; }
    else if (estimated_days <= 7) signal_class = 'IMMEDIATE';
    else if (estimated_days <= 30) signal_class = 'SHORT';
    else if (estimated_days <= 90) signal_class = 'MEDIUM';
    else signal_class = 'LONG';
    if (freq == null && minEvents != null) { signal_class = 'TIME_TO_SIGNAL_UNKNOWN'; estimated_days = null; reason = 'a minimum-events target was given but no event frequency — cannot estimate'; }
  }

  const body = {
    schema_version: 'ucdm-experiment-1.0.0', kind: 'TimeToSignal',
    signal_class,
    estimated_days,
    inputs_used: inputs_present.sort(),
    reason,
    fabricated_window: false,
    note: signal_class === 'TIME_TO_SIGNAL_UNKNOWN' ? 'no default window is assumed' : `estimated from ${inputs_present.join(', ')} only`,
    generated_by: 'deterministic:ucdm/experiment',
  };
  body.time_to_signal_id = 'exts_' + sha256Hex(canonicalize({ ...body, time_to_signal_id: undefined }));
  return deepFreeze(body);
}
function num(v) { return v == null || Number.isNaN(Number(v)) ? null : Number(v); }

function validateTimeToSignal(t) {
  const errors = [];
  if (!SIGNAL_CLASSES.includes(t.signal_class)) errors.push(`bad signal_class "${t.signal_class}"`);
  if (t.signal_class === 'TIME_TO_SIGNAL_UNKNOWN' && t.estimated_days != null) errors.push('UNKNOWN time to signal must not carry an estimate');
  if (t.signal_class !== 'TIME_TO_SIGNAL_UNKNOWN' && t.inputs_used.length === 0) errors.push('a non-UNKNOWN time to signal needs at least one input');
  if (t.fabricated_window !== false) errors.push('no time-to-signal window is fabricated');
  return { valid: errors.length === 0, errors };
}

module.exports = { SIGNAL_CLASSES, estimateTimeToSignal, validateTimeToSignal };
