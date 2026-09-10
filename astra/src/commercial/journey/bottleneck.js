'use strict';
// [ASTRA-11H §M] JourneyBottleneckCandidate — ANALYTICAL only. A causal bottleneck is NEVER
// claimed without sufficient evidence. `is_fact: false` always. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');

const BOTTLENECK_REASONS = Object.freeze([
  'REPEATED_FRICTION', 'STAGE_STALL', 'REGRESSION', 'ABANDONMENT_EVENT', 'HIGH_OBJECTION_FREQUENCY',
  'LONG_DURATION', 'TRANSITION_FAILURE_EVIDENCE',
]);

// buildBottleneckCandidates({ frictions, stalls, events, transitions, metrics, vocResult })
function buildBottleneckCandidates({ frictions = [], stalls = null, events = [], transitions = [], metrics = null, vocResult = {} }) {
  const byStage = {};
  const bump = (stage, reason, evidence_refs) => {
    const s = byStage[stage] || (byStage[stage] = { stage, reasons: new Set(), evidence_refs: new Set(), signal_count: 0 });
    s.reasons.add(reason); s.signal_count++;
    for (const er of evidence_refs) s.evidence_refs.add(er);
  };

  // repeated friction at a stage
  const fricByStage = {};
  for (const f of frictions) (fricByStage[f.stage] = fricByStage[f.stage] || []).push(f);
  for (const [stage, fs] of Object.entries(fricByStage)) if (fs.length >= 3) bump(stage, 'REPEATED_FRICTION', fs.flatMap(f => f.evidence_refs));

  // stalls / regressions
  for (const r of (stalls ? stalls.repeated_stage_instances : [])) bump(r.stage, 'STAGE_STALL', r.evidence_refs);
  for (const r of (stalls ? stalls.regression_instances : [])) bump(r.to_state, 'REGRESSION', []);

  // abandonment events
  for (const e of events) if (['CANCELLATION_REQUESTED', 'PAYMENT_ATTEMPTED'].includes(e.event_type)) bump(e.evidenced_stage, 'ABANDONMENT_EVENT', e.evidence_refs);

  // high objection frequency (from VoC clusters)
  for (const c of (vocResult.clusters || [])) {
    if (['OBJECTION', 'REASON_NOT_TO_BUY'].includes(c.aspect) && c.frequency.deduped_observation_count >= 3) {
      bump('PURCHASE_INTENT', 'HIGH_OBJECTION_FREQUENCY', c.representative_quotes.flatMap(q => q.evidence_refs));
    }
  }

  // long duration (only with real timestamps)
  for (const d of (metrics ? metrics.elapsed_durations : [])) if (d.elapsed_days > 30) bump(d.to_stage, 'LONG_DURATION', []);

  const out = [];
  for (const s of Object.values(byStage)) {
    const evidence_refs = [...s.evidence_refs].sort();
    // "sufficient evidence" gate: >=2 distinct signals AND some evidence, else it is a weak hint
    const sufficient = s.reasons.size >= 2 && evidence_refs.length >= 2;
    const body = {
      schema_version: 'ucdm-journey-1.0.0', kind: 'JourneyBottleneckCandidate',
      candidate_location: s.stage,
      reason_codes: [...s.reasons].sort(),
      signal_count: s.signal_count,
      evidence_refs,
      coverage: { distinct_signals: s.reasons.size, evidence_count: evidence_refs.length },
      sufficiency: sufficient ? 'SUFFICIENT_FOR_HYPOTHESIS' : 'WEAK_HINT',
      causal_claim: 'NONE',
      is_fact: false,
      is_recommendation: false,
      confidence: assess({ evidence_count: evidence_refs.length, distinct_sources: evidence_refs.length, coverage: sufficient ? 0.5 : 0.25, agree_count: s.signal_count, conflict_count: 0 }),
      note: 'analytical candidate only — a causal bottleneck is NOT claimed',
      generated_by: 'deterministic:ucdm/journey/bottleneck',
    };
    body.bottleneck_id = 'jbn_' + sha256Hex(canonicalize({ ...body, bottleneck_id: undefined, confidence: body.confidence.content_hash }));
    out.push(deepFreeze(body));
  }
  return out.sort((a, b) => (a.candidate_location < b.candidate_location ? -1 : 1));
}

function validateBottleneck(b) {
  const errors = [];
  if (b.is_fact !== false) errors.push('a bottleneck candidate is never a fact');
  if (b.is_recommendation !== false) errors.push('a bottleneck candidate is never a recommendation');
  if (b.causal_claim !== 'NONE') errors.push('no causal bottleneck claim is permitted');
  if (b.reason_codes.some(r => !BOTTLENECK_REASONS.includes(r))) errors.push('uncontrolled bottleneck reason code');
  if (b.sufficiency === 'SUFFICIENT_FOR_HYPOTHESIS' && b.evidence_refs.length === 0) errors.push('a bottleneck hypothesis needs evidence');
  return { valid: errors.length === 0, errors };
}

module.exports = { BOTTLENECK_REASONS, buildBottleneckCandidates, validateBottleneck };
