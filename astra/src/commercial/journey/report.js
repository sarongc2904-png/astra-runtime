'use strict';
// [ASTRA-11H §AA] CustomerJourneyReport. Every material statement stays evidence-linked.
// No unsupported narrative facts. Reproducible from identical inputs. Missing sections stay
// UNKNOWN. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const SECTION_NAMES = Object.freeze([
  'executive_summary', 'scope', 'evidence_coverage', 'journey_map', 'stages', 'events', 'transitions',
  'triggers', 'frictions', 'questions', 'proof_requirements', 'alternatives', 'touchpoints',
  'segment_differences', 'buying_role_differences', 'pre_purchase_journey', 'post_purchase_journey',
  'bottleneck_candidates', 'jobs_to_be_done', 'forces_of_progress', 'job_outcomes',
  'retention_churn_signals', 'conflicts', 'unknowns', 'limitations', 'evidence_appendix',
]);

function sec(v) {
  const empty = v == null || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
  return empty ? { status: 'UNKNOWN' } : v;
}

function buildReport(x) {
  const {
    request = {}, referenceTime = null, mode = 'B2C',
    journeyObservations = [], events = [], transitions = [], stalls = null, triggers = [], frictions = [],
    questions = [], proofRequirements = [], alternatives = [], touchpoints = [], metrics = null,
    segmentJourneys = null, committeeJourneys = null, prePost = null, bottlenecks = [],
    jobs = [], jobStatements = [], forces = null, jobOutcomes = [], retentionChurn = null,
    conflicts = [], coverage = null, completion = null, temporalSplit = null,
  } = x;

  // evidence appendix
  const seen = new Set(); const entries = [];
  const add = (er, sr) => { const k = `${er}::${sr}`; if (er && !seen.has(k)) { seen.add(k); entries.push({ evidence_ref: er, source_ref: sr || null }); } };
  for (const o of journeyObservations) for (const er of o.evidence_refs) add(er, o.source_ref);
  for (const e of events) for (const er of e.evidence_refs) add(er, e.source_ref);
  entries.sort((a, b) => (a.evidence_ref < b.evidence_ref ? -1 : a.evidence_ref > b.evidence_ref ? 1 : 0));
  const appendixRefs = new Set(entries.map(e => e.evidence_ref));

  // evidence-graph validity
  const obsIds = new Set(journeyObservations.map(o => o.observation_id));
  const graphErrors = [];
  for (const t of transitions) { for (const oid of [t.from_observation, t.to_observation]) if (!obsIds.has(oid)) graphErrors.push(`transition ${t.transition_id} -> missing observation ${oid}`); for (const er of t.evidence_refs) if (!appendixRefs.has(er)) graphErrors.push(`transition ${t.transition_id} -> evidence ${er} not in appendix`); }
  for (const o of journeyObservations) for (const er of o.evidence_refs) if (!appendixRefs.has(er)) graphErrors.push(`observation ${o.observation_id} -> evidence ${er} not in appendix`);
  for (const j of jobs) for (const er of j.evidence_refs) if (er && !appendixRefs.has(er)) graphErrors.push(`jtbd ${j.job_id} -> evidence ${er} not in appendix`);

  const stageRows = {};
  for (const o of journeyObservations) { if (o.stage === 'UNKNOWN') continue; const s = stageRows[o.stage] || (stageRows[o.stage] = { stage: o.stage, phase: o.phase, observation_count: 0, observed: 0, evidence_refs: new Set() }); s.observation_count++; if (o.status === 'OBSERVED') s.observed++; for (const er of o.evidence_refs) s.evidence_refs.add(er); }
  const stages = Object.values(stageRows).map(s => ({ ...s, evidence_refs: [...s.evidence_refs].sort() })).sort((a, b) => (a.stage < b.stage ? -1 : 1));

  const report = {
    schema_version: 'ucdm-journey-1.0.0',
    downstream_schema_versions: { ucdm: 'ucdm-1.0.0', ingest: 'ucdm-ingest-1.0.0', research: 'ucdm-research-1.0.0', competitor: 'ucdm-competitor-1.0.0', voc: 'ucdm-voc-1.0.0', customer_model: 'ucdm-customer-model-1.0.0' },
    request_ref: request.request_id || null,
    reference_time: referenceTime,
    mode,
    generated_by: 'deterministic:ucdm/journey',
    counts: {
      journey_observations: journeyObservations.length, events: events.length, transitions: transitions.length,
      triggers: triggers.length, frictions: frictions.length, jobs: jobs.length, bottlenecks: bottlenecks.length,
    },
    sections: {
      executive_summary: sec(completion ? { status: completion.status, reason_codes: completion.reason_codes, stages_covered: stages.length, transitions: transitions.length, jobs: jobs.length, mode } : null),
      scope: { objectives: request.objectives || [], language: request.language || null, mode },
      evidence_coverage: sec(coverage),
      journey_map: sec({ stages: stages.map(s => s.stage), transitions: transitions.map(t => ({ from: t.from_state, to: t.to_state, relation: t.relation, status: t.transition_status })), non_linear: transitions.some(t => t.relation !== 'FORWARD') }),
      stages: sec(stages),
      events: sec([...new Set(events.map(e => e.event_type))].sort()),
      transitions: sec(transitions.map(t => ({ from: t.from_state, to: t.to_state, relation: t.relation, status: t.transition_status, temporal_basis: t.temporal_basis }))),
      triggers: sec([...new Set(triggers.map(t => t.category))].sort()),
      frictions: sec([...new Set(frictions.map(f => f.category))].sort()),
      questions: sec(questions.map(q => ({ status: q.status, text: q.verbatim_question || q.information_need, stage: q.stage }))),
      proof_requirements: sec(proofRequirements.map(p => ({ proof_type: p.proof_type, status: p.status }))),
      alternatives: sec([...new Set(alternatives.map(a => a.alternative_type))].sort()),
      touchpoints: sec(touchpoints.map(t => ({ touchpoint: t.touchpoint, stages: t.stages, implies_attribution: t.implies_attribution }))),
      segment_differences: sec(segmentJourneys ? { segments_differ: segmentJourneys.segments_differ, differences: segmentJourneys.differences } : null),
      buying_role_differences: sec(committeeJourneys && committeeJourneys.status !== 'NOT_APPLICABLE' ? { roles_differ: committeeJourneys.roles_differ, roles: committeeJourneys.role_journeys.map(r => ({ role: r.role, status: r.status, stages: r.stages })) } : { status: 'NOT_APPLICABLE' }),
      pre_purchase_journey: sec(prePost ? prePost.pre_purchase : null),
      post_purchase_journey: sec(prePost ? prePost.post_purchase : null),
      bottleneck_candidates: sec(bottlenecks.map(b => ({ location: b.candidate_location, reason_codes: b.reason_codes, sufficiency: b.sufficiency, is_fact: b.is_fact }))),
      jobs_to_be_done: sec(jobs.map((j, i) => ({ job_id: j.job_id, job_kind: j.job_kind, statement: jobStatements[i] ? jobStatements[i].text : null, unknowns: j.unknowns }))),
      forces_of_progress: sec(forces ? { present: forces.present_forces, unknown: forces.unknown_forces, complete_four_force_model: forces.complete_four_force_model } : null),
      job_outcomes: sec(jobOutcomes.map(o => ({ desired_outcome: o.desired_outcome, current_performance: o.current_performance && o.current_performance.direction ? o.current_performance.direction : 'UNKNOWN' }))),
      retention_churn_signals: sec(retentionChurn ? { types: retentionChurn.signal_types_present, churn_probability: retentionChurn.churn_probability } : null),
      conflicts: sec(conflicts.filter(c => c.status !== 'INSUFFICIENT').map(c => ({ dimension: c.dimension, status: c.status, likely_separate_segment_journeys: c.likely_separate_segment_journeys }))),
      unknowns: buildUnknowns({ stages, prePost, forces, jobs, transitions }),
      limitations: sec(completion ? completion.reason_codes : (coverage ? coverage.limitations : null)),
      evidence_appendix: { count: entries.length, entries },
    },
    journey_metrics: metrics || null,
    temporal_separation: temporalSplit ? { current: temporalSplit.current.length, historical: temporalSplit.historical.length, unknown: temporalSplit.unknown.length, merged: false } : null,
    evidence_graph_valid: graphErrors.length === 0,
    evidence_graph_errors: graphErrors.sort(),
    completion_status: completion ? completion.status : null,
    caveats: [
      'Journey stages are never invented because they are conventional; missing evidence is UNKNOWN.',
      'The journey is not forced linear — loops, regressions, skipped stages and re-entry are preserved.',
      'A transition exists only from same-customer evidence at two stages, never from a generic funnel.',
      'A channel appearing in evidence does not imply attribution or causality.',
      'Conversion / drop-off / time-to-purchase / attribution percentages are NULL without a valid denominator.',
      'Bottleneck candidates are analytical (is_fact:false); no causal bottleneck is claimed.',
      'Emotional / social jobs require explicit customer evidence; otherwise UNKNOWN. Job statements add no facts.',
      'Historical and current journeys are separated, never silently merged.',
      'No churn probability is produced.',
      'No ASTRA-11H output may feed production routing or autonomous action.',
    ],
  };
  report.section_names = Object.keys(report.sections);
  report.report_id = 'jmr_' + sha256Hex(canonicalize({ ...report, report_id: undefined }));
  report.content_hash = report.report_id;
  return deepFreeze(report);
}

function buildUnknowns({ stages, prePost, forces, jobs, transitions }) {
  const u = new Set();
  if (!stages.some(s => s.phase === 'POST_PURCHASE')) u.add('post_purchase_journey');
  if (!stages.some(s => s.stage === 'PURCHASE')) u.add('purchase_evidence');
  if (transitions.length === 0) u.add('transitions');
  if (forces) for (const f of forces.unknown_forces) u.add('force:' + f);
  for (const j of jobs) for (const k of j.unknowns) u.add('jtbd:' + k);
  return [...u].sort();
}

module.exports = { SECTION_NAMES, buildReport };
