'use strict';
// [ASTRA-11H §L] Journey metrics discipline. ASTRA counts ONLY what the supplied observations
// contain. It NEVER fabricates conversion rates, drop-off rates, average time-to-purchase, or
// attribution percentages without valid denominators/data. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const ST = require('./stage_taxonomy');

function computeJourneyMetrics({ journeyObservations = [], transitions = [], events = [], stalls = null, referenceTime = null }) {
  const stageObs = journeyObservations.filter(o => o.stage !== 'UNKNOWN');
  const stagesCovered = [...new Set(stageObs.map(o => o.stage))].sort();
  const subjects = [...new Set(stageObs.map(o => o.subject_ref).filter(Boolean))];

  // durations: only when a subject has >=2 timestamped observations
  const durations = [];
  const bySubject = {};
  for (const o of stageObs) if (o.subject_ref && o.timestamp) (bySubject[o.subject_ref] = bySubject[o.subject_ref] || []).push(o);
  for (const [sub, os] of Object.entries(bySubject)) {
    const ts = os.map(o => Date.parse(o.timestamp)).filter(Number.isFinite).sort((a, b) => a - b);
    if (ts.length >= 2) durations.push({ subject_ref: sub, elapsed_days: Number(((ts[ts.length - 1] - ts[0]) / 86400000).toFixed(2)), from_stage: os[0].stage, to_stage: os[os.length - 1].stage });
  }

  const body = {
    schema_version: 'ucdm-journey-1.0.0', kind: 'JourneyMetrics',
    observed_stage_coverage: { stages: stagesCovered, count: stagesCovered.length, of_total: ST.JOURNEY_STAGES.length - 1 },
    observed_transition_count: transitions.length,
    observed_event_count: events.length,
    observed_stall_count: stalls ? stalls.repeated_stage_instances.length : 0,
    observed_regression_count: stalls ? stalls.regression_instances.length : 0,
    repeated_stage_count: stalls ? stalls.repeated_stage_instances.reduce((s, r) => s + (r.observation_count - 1), 0) : 0,
    unique_subjects_with_journey: subjects.length,
    elapsed_durations: durations.sort((a, b) => (a.subject_ref < b.subject_ref ? -1 : 1)),
    // explicitly NULL — not computable from a review sample without a real funnel denominator
    conversion_rate: null,
    drop_off_rate: null,
    average_time_to_purchase: durations.length ? aggregatePurchaseDuration(durations) : null,
    attribution_percentages: null,
    denominator_note: 'conversion / drop-off / attribution are NULL: a review/VoC sample has no valid funnel denominator. Durations are reported only for subjects with >=2 timestamped observations.',
    generated_by: 'deterministic:ucdm/journey/metrics',
  };
  body.metrics_id = 'jmx_' + sha256Hex(canonicalize({ ...body, metrics_id: undefined }));
  return deepFreeze(body);
}

// Only a real observed purchase-anchored duration counts; otherwise null.
function aggregatePurchaseDuration(durations) {
  const toPurchase = durations.filter(d => ['PURCHASE', 'PURCHASE_DECISION'].includes(d.to_stage));
  if (toPurchase.length === 0) return null;
  const vals = toPurchase.map(d => d.elapsed_days).sort((a, b) => a - b);
  return { basis: 'OBSERVED_TIMESTAMPS', n: vals.length, median_days: vals[Math.floor(vals.length / 2)], note: 'from observed timestamps of subjects who reached a purchase stage — NOT a market average' };
}

function validateMetrics(m) {
  const errors = [];
  for (const k of ['conversion_rate', 'drop_off_rate', 'attribution_percentages']) {
    if (m[k] != null) errors.push(`${k} must be null unless a valid denominator/data set is supplied`);
  }
  if (m.average_time_to_purchase != null && m.average_time_to_purchase.basis !== 'OBSERVED_TIMESTAMPS') errors.push('time-to-purchase must be from observed timestamps only');
  return { valid: errors.length === 0, errors };
}

module.exports = { computeJourneyMetrics, validateMetrics };
