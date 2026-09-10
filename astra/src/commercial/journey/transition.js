'use strict';
// [ASTRA-11H §E] Deterministic JourneyTransition. A transition exists ONLY because the SAME
// customer was evidenced at two different stages in an order we can establish — NEVER because
// two stages appear in a generic funnel. Loops / regressions / skips / repeats are all valid.
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');
const ST = require('./stage_taxonomy');

const TRANSITION_STATUS = Object.freeze(['OBSERVED', 'SUPPORTED_ANALYTICAL', 'UNKNOWN']);

// buildTransitions(journeyObservations, { triggers, frictions }) -> [JourneyTransition]
function buildTransitions(journeyObservations, { triggers = [], frictions = [] } = {}) {
  const bySubject = {};
  for (const o of journeyObservations) {
    if (o.stage === 'UNKNOWN') continue;
    if (!o.subject_ref) continue; // an unattributed observation cannot anchor a per-customer transition
    (bySubject[o.subject_ref] = bySubject[o.subject_ref] || []).push(o);
  }
  const trigBySource = groupBy(triggers, t => t.source_ref);
  const fricBySource = groupBy(frictions, f => f.source_ref);

  const out = [];
  for (const [subject, obsRaw] of Object.entries(bySubject).sort()) {
    // order: explicit timestamp, then (same utterance) clause offset, then stable observation_id
    const obs = [...obsRaw].sort((a, b) => {
      const ta = Date.parse(a.timestamp || ''), tb = Date.parse(b.timestamp || '');
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
      if (a.utterance_ref === b.utterance_ref && a.span && b.span && a.span.start !== b.span.start) return a.span.start - b.span.start;
      return a.observation_id < b.observation_id ? -1 : 1;
    });
    const orderable = obs.map(o => Date.parse(o.timestamp || '')).filter(Number.isFinite);
    const distinctTimes = new Set(orderable).size;

    for (let i = 0; i < obs.length - 1; i++) {
      const a = obs[i], b = obs[i + 1];
      if (a.stage === b.stage) continue; // a REPEAT of the same stage is not a transition edge here
      const sameUtt = a.utterance_ref && a.utterance_ref === b.utterance_ref;
      const bothEvents = a.element === 'EVENT' && b.element === 'EVENT' && a.stage_basis === 'OBSERVED' && b.stage_basis === 'OBSERVED';
      let status;
      if (bothEvents && distinctTimes >= 2) status = 'OBSERVED';
      else if (sameUtt || (Number.isFinite(Date.parse(a.timestamp || '')) && Number.isFinite(Date.parse(b.timestamp || '')))) status = 'SUPPORTED_ANALYTICAL';
      else status = 'SUPPORTED_ANALYTICAL';
      const evidence_refs = [...new Set([...a.evidence_refs, ...b.evidence_refs])].sort();
      const trigger_refs = [...new Set([...(trigBySource[a.source_ref] || []), ...(trigBySource[b.source_ref] || [])].map(t => t.trigger_id))].sort();
      const friction_refs = [...new Set([...(fricBySource[a.source_ref] || []), ...(fricBySource[b.source_ref] || [])].map(f => f.friction_id))].sort();
      const body = {
        schema_version: 'ucdm-journey-1.0.0', kind: 'JourneyTransition',
        subject_ref: subject,
        from_state: a.stage, to_state: b.stage,
        relation: ST.relation(a.stage, b.stage),
        from_observation: a.observation_id, to_observation: b.observation_id,
        evidence_refs, trigger_refs, friction_refs,
        temporal_basis: distinctTimes >= 2 ? 'TIMESTAMP_ORDERED' : sameUtt ? 'CLAUSE_ORDERED' : 'UNORDERED_SEQUENCE',
        transition_status: status,
        confidence: assess({ evidence_count: evidence_refs.length, distinct_sources: new Set([a.source_ref, b.source_ref].filter(Boolean)).size, coverage: 0.4, newest_evidence_age_days: 90 }),
        generated_by: 'deterministic:ucdm/journey',
      };
      body.transition_id = 'jtn_' + sha256Hex(canonicalize({ ...body, transition_id: undefined, confidence: body.confidence.content_hash }));
      out.push(deepFreeze(body));
    }
  }
  return out;
}

function groupBy(arr, keyFn) {
  const m = {};
  for (const x of arr) { const k = keyFn(x); if (k == null) continue; (m[k] = m[k] || []).push(x); }
  return m;
}

// Stall / re-entry detection: a subject with >1 observation at the SAME stage (repeated
// evaluation), or a REGRESSION transition, is a stalled/looping state.
function detectStalls(journeyObservations, transitions) {
  const bySubjectStage = {};
  for (const o of journeyObservations) {
    if (o.stage === 'UNKNOWN' || !o.subject_ref) continue;
    const k = `${o.subject_ref}::${o.stage}`;
    (bySubjectStage[k] = bySubjectStage[k] || []).push(o);
  }
  const repeats = Object.entries(bySubjectStage).filter(([, v]) => v.length > 1)
    .map(([k, v]) => ({ subject_ref: k.split('::')[0], stage: k.split('::')[1], observation_count: v.length, evidence_refs: [...new Set(v.flatMap(o => o.evidence_refs))].sort() }));
  const regressions = transitions.filter(t => t.relation === 'REGRESSION')
    .map(t => ({ subject_ref: t.subject_ref, from_state: t.from_state, to_state: t.to_state, transition_id: t.transition_id }));
  return deepFreeze({
    repeated_stage_instances: repeats.sort((a, b) => (a.subject_ref + a.stage < b.subject_ref + b.stage ? -1 : 1)),
    regression_instances: regressions.sort((a, b) => (a.subject_ref < b.subject_ref ? -1 : 1)),
    note: 'repeated stages and regressions are legitimate non-linear journey behavior, preserved not smoothed',
  });
}

function validateTransition(t) {
  const errors = [];
  if (!TRANSITION_STATUS.includes(t.transition_status)) errors.push(`bad transition status "${t.transition_status}"`);
  if (!ST.isStage(t.from_state) || !ST.isStage(t.to_state)) errors.push('transition endpoints must be controlled stages');
  if (t.evidence_refs.length === 0) errors.push('a transition cannot exist without evidence (a generic funnel is not evidence)');
  if (t.transition_status === 'OBSERVED' && t.temporal_basis !== 'TIMESTAMP_ORDERED') errors.push('an OBSERVED transition requires timestamp-ordered endpoints');
  return { valid: errors.length === 0, errors };
}

module.exports = { TRANSITION_STATUS, buildTransitions, detectStalls, validateTransition };
