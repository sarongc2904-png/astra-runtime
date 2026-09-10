'use strict';
// [ASTRA-11H §N §Q §S] Canonical JobToBeDone. A JTBD is NOT a persona trait. Functional job
// may be observed or analytical; emotional / social jobs require explicit or strongly-grounded
// customer evidence — otherwise UNKNOWN (no "wants to feel successful" fiction). Multiple jobs
// per customer are supported and never collapsed. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');

const JTBD_SCHEMA_VERSION = 'ucdm-journey-1.0.0';
const JOB_KINDS = Object.freeze(['BUYING_JOB', 'USAGE_JOB', 'IMPLEMENTATION_JOB', 'RETENTION_JOB', 'EXPANSION_JOB']);
const UNKNOWN = { status: 'UNKNOWN' };

// concepts that constitute EXPLICIT customer emotional-language evidence
const EMOTIONAL_CONCEPTS = ['PAIN_FEAR', 'RESULTS_UNCERTAINTY', 'TRUST_CONCERN'];
const FUNCTIONAL_DESIRE_CONCEPTS = ['RESULTS_DESIRED', 'SPEED_NEED', 'CONVENIENCE_VALUE'];

function conceptField(obs, concepts) {
  const rows = obs.filter(o => o.status === 'OBSERVED' && concepts.includes(o.normalized_concept));
  if (!rows.length) return UNKNOWN;
  return { concepts: [...new Set(rows.map(o => o.normalized_concept))].sort(), evidence_refs: [...new Set(rows.flatMap(o => o.evidence_refs))].sort(), basis: 'OBSERVED' };
}

// buildJobsToBeDone({ segment, persona, observations, journeyTriggers, journeyAlternatives, kind })
function buildJob({ segment, persona, observations, journeyTriggers = [], journeyAlternatives = [], kind = 'BUYING_JOB' }) {
  const obs = observations.filter(o => o.status === 'OBSERVED');
  const evAll = [...new Set(obs.flatMap(o => o.evidence_refs))].sort();

  const functional = (() => {
    const f = conceptField(obs, FUNCTIONAL_DESIRE_CONCEPTS);
    if (f.status === 'UNKNOWN' && persona && persona.primary_problem && persona.primary_problem.status !== 'UNKNOWN') {
      return { concepts: [persona.primary_problem.concept], evidence_refs: persona.primary_problem.evidence_refs, basis: 'ANALYTICAL', note: 'reconstructed from the primary problem' };
    }
    return f;
  })();

  const emotional = conceptField(obs, EMOTIONAL_CONCEPTS); // explicit customer emotion language only
  const social = UNKNOWN; // never fabricated; only set when explicit social evidence exists (see below)
  const socialRows = obs.filter(o => o.status === 'OBSERVED' && /reputaci[oó]n|qu[eé] van a pensar|frente a (mis|los)|imagen|me da pena/i.test(o.exact_span.text));
  const socialJob = socialRows.length ? { evidence_refs: [...new Set(socialRows.flatMap(o => o.evidence_refs))].sort(), basis: 'OBSERVED' } : UNKNOWN;

  const job = {
    schema_version: JTBD_SCHEMA_VERSION, kind: 'JobToBeDone', job_kind: kind,
    segment_refs: segment ? [segment.segment_id] : [],
    persona_refs: persona ? [persona.persona_id] : [],
    situation: persona && persona.current_situation && persona.current_situation.status !== 'UNKNOWN'
      ? { concept: persona.current_situation.concept, evidence_refs: persona.current_situation.evidence_refs } : UNKNOWN,
    trigger_context: journeyTriggers.length
      ? { categories: [...new Set(journeyTriggers.map(t => t.category))].sort(), evidence_refs: [...new Set(journeyTriggers.flatMap(t => t.evidence_refs))].sort() } : UNKNOWN,
    functional_job: functional,
    emotional_job: emotional,
    social_job: socialJob,
    desired_progress: persona && persona.desired_situation && persona.desired_situation.status !== 'UNKNOWN'
      ? { concept: persona.desired_situation.concept, evidence_refs: persona.desired_situation.evidence_refs }
      : (Array.isArray(persona && persona.desired_outcomes) ? { concepts: persona.desired_outcomes.map(d => d.concept), evidence_refs: [...new Set(persona.desired_outcomes.flatMap(d => d.evidence_refs))].sort() } : UNKNOWN),
    current_alternative: journeyAlternatives.length
      ? { types: [...new Set(journeyAlternatives.map(a => a.alternative_type))].sort(), evidence_refs: [...new Set(journeyAlternatives.flatMap(a => a.evidence_refs))].sort() } : UNKNOWN,
    constraints: Array.isArray(persona && persona.objections) ? { concepts: persona.objections.map(o => o.concept), evidence_refs: [...new Set(persona.objections.flatMap(o => o.evidence_refs))].sort() } : UNKNOWN,
    anxieties: Array.isArray(persona && persona.fears) ? { concepts: persona.fears.map(f => f.concept), evidence_refs: [...new Set(persona.fears.flatMap(f => f.evidence_refs))].sort() } : UNKNOWN,
    habits_inertia: journeyAlternatives.some(a => ['DO_NOTHING', 'DELAY', 'INTERNAL_SOLUTION'].includes(a.alternative_type))
      ? { types: journeyAlternatives.filter(a => ['DO_NOTHING', 'DELAY', 'INTERNAL_SOLUTION'].includes(a.alternative_type)).map(a => a.alternative_type), evidence_refs: [...new Set(journeyAlternatives.filter(a => ['DO_NOTHING', 'DELAY', 'INTERNAL_SOLUTION'].includes(a.alternative_type)).flatMap(a => a.evidence_refs))].sort() } : UNKNOWN,
    success_criteria: conceptField(obs, ['RESULTS_DESIRED', 'QUALITY_PRAISE', 'CONVENIENCE_VALUE']),
    evidence_refs: evAll,
    confidence: assess({ evidence_count: evAll.length, distinct_sources: segment ? segment.observed_sample.unique_source_count : evAll.length, coverage: 0.4, newest_evidence_age_days: 90 }),
  };
  job.unknowns = ['situation', 'trigger_context', 'functional_job', 'emotional_job', 'social_job', 'desired_progress', 'current_alternative', 'constraints', 'anxieties', 'habits_inertia', 'success_criteria'].filter(k => job[k] && job[k].status === 'UNKNOWN');
  job.job_id = 'jtbd_' + sha256Hex(canonicalize({ ...job, job_id: undefined, confidence: job.confidence.content_hash }));
  return deepFreeze(job);
}

function validateJob(j) {
  const errors = [];
  if (!JOB_KINDS.includes(j.job_kind)) errors.push(`bad job_kind "${j.job_kind}"`);
  if (j.evidence_refs.length === 0) errors.push('a JobToBeDone must be evidence-backed');
  if (j.functional_job.status !== 'UNKNOWN' && (!j.functional_job.evidence_refs || j.functional_job.evidence_refs.length === 0)) errors.push('functional_job present without evidence');
  for (const k of ['emotional_job', 'social_job']) {
    const f = j[k];
    if (f.status !== 'UNKNOWN') {
      if (!f.evidence_refs || f.evidence_refs.length === 0) errors.push(`${k} present without explicit customer evidence`);
      if (f.basis && f.basis !== 'OBSERVED') errors.push(`${k} must be OBSERVED (explicit customer language), not reconstructed`);
    }
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { JTBD_SCHEMA_VERSION, JOB_KINDS, buildJob, validateJob };
