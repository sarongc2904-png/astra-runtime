'use strict';
// [ASTRA-11B] Deterministic funnel arithmetic (ASTRA-11B section H).
// Conversion / drop-off rates are COMPUTED here, never stored from LLM output.
// Every returned metric is a ProvenanceValue with source_class COMPUTED and a deterministic
// producer, so the numeric-integrity guard accepts it as canonical.
// Pure functions. No I/O, no LLM, no network.
const { pv } = require('../provenance/provenance');

const PRODUCER = 'deterministic:ucdm/funnel_math';
const EPS = 1e-9;

// computeTransition({ entered, exited, cost, value, window, evidence_refs })
//   entered: units that entered the FROM stage in the window
//   exited:  units that advanced to the TO stage (<= entered)
// Returns { transition metrics } and a consistency report. Fails closed (throws) on
// structurally impossible inputs so an impossible transition never becomes canonical.
function computeTransition({ from_stage, to_stage, entered, exited, cost = null, value = null, window = null, evidence_refs = [] }) {
  const e = Number(entered), x = Number(exited);
  if (!Number.isFinite(e) || !Number.isFinite(x)) throw new Error('funnel_math: entered/exited must be finite numbers');
  if (e < 0 || x < 0) throw new Error('funnel_math: counts cannot be negative');
  if (x > e + EPS) throw new Error(`funnel_math: exited (${x}) > entered (${e}) — impossible transition, fail closed`);
  const conv = e === 0 ? 0 : x / e;
  const drop = e === 0 ? 0 : (e - x) / e;
  const meta = { produced_by: PRODUCER, transform: PRODUCER, observed_period: window, evidence_refs };
  const out = {
    from_stage: from_stage != null ? String(from_stage) : null,
    to_stage: to_stage != null ? String(to_stage) : null,
    entered: pv(e, 'COMPUTED', meta),
    exited: pv(x, 'COMPUTED', meta),
    conversion_rate: pv(Number(conv.toFixed(9)), 'COMPUTED', meta),
    dropoff_rate: pv(Number(drop.toFixed(9)), 'COMPUTED', meta),
    cost: cost == null ? null : pv(Number(cost), 'COMPUTED', meta),
    value: value == null ? null : pv(Number(value), 'COMPUTED', meta),
    cost_per_exit: (cost == null || x === 0) ? null : pv(Number((Number(cost) / x).toFixed(9)), 'COMPUTED', meta),
    value_per_entered: (value == null || e === 0) ? null : pv(Number((Number(value) / e).toFixed(9)), 'COMPUTED', meta),
    observation_window: window,
  };
  const consistency = checkConsistency(out);
  if (!consistency.valid) throw new Error('funnel_math: inconsistent result: ' + consistency.errors.join('; '));
  return { transition: out, consistency };
}

// Deterministic consistency check usable by validators on a stored FunnelTransition:
//   exited <= entered ; conversion_rate + dropoff_rate == 1 (or both 0 for empty stage) ;
//   rates in [0,1].
function checkConsistency(t) {
  const errors = [];
  const num = f => (f && typeof f === 'object' && 'value' in f) ? Number(f.value) : Number(f);
  const entered = num(t.entered), exited = num(t.exited);
  const cr = num(t.conversion_rate), dr = num(t.dropoff_rate);
  if (Number.isFinite(entered) && Number.isFinite(exited) && exited > entered + EPS) errors.push(`exited ${exited} > entered ${entered}`);
  if (Number.isFinite(cr) && (cr < -EPS || cr > 1 + EPS)) errors.push(`conversion_rate ${cr} out of [0,1]`);
  if (Number.isFinite(dr) && (dr < -EPS || dr > 1 + EPS)) errors.push(`dropoff_rate ${dr} out of [0,1]`);
  if (Number.isFinite(cr) && Number.isFinite(dr)) {
    const sum = cr + dr;
    const emptyStage = Math.abs(cr) < EPS && Math.abs(dr) < EPS;
    if (!emptyStage && Math.abs(sum - 1) > 1e-6) errors.push(`conversion_rate + dropoff_rate = ${sum} (expected 1)`);
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { computeTransition, checkConsistency, PRODUCER };
