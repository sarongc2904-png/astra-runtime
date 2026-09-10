'use strict';
// [ASTRA-11H §A] Canonical JourneyObservation. Every observation is evidence-linked or
// explicitly UNKNOWN. Stage *reconstruction* from a single utterance is ANALYTICAL and is
// NEVER upgraded to OBSERVED. No stage is invented because it is conventional. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { SOURCE_CLASSES } = require('../provenance/provenance');
const { assess } = require('../validation/confidence');
const ST = require('./stage_taxonomy');
const { classifyTemporal } = require('./temporal');

const JOURNEY_SCHEMA_VERSION = 'ucdm-journey-1.0.0';
const OBS_STATUS = Object.freeze(['OBSERVED', 'COMPUTED', 'ANALYTICAL', 'UNKNOWN']);
const OBS_ELEMENT = Object.freeze(['EVENT', 'STATE', 'TRANSITION_HINT', 'TRIGGER', 'FRICTION', 'QUESTION', 'ALTERNATIVE', 'PROOF_NEED', 'OUTCOME', 'CHANNEL', 'UNKNOWN']);

// Controlled concept -> candidate stage (analytical). A pain concept is inherently ambiguous
// between pre-purchase PROBLEM_RECOGNITION and post-purchase RETENTION/CHURN_RISK, so it maps
// only to the pre-purchase reading unless an explicit post-purchase event says otherwise.
const CONCEPT_STAGE = Object.freeze({
  PAIN_EXPERIENCED: 'PROBLEM_RECOGNITION',
  PAIN_FEAR: 'VENDOR_EVALUATION',
  SLOW_SERVICE: 'PROBLEM_RECOGNITION',
  RESPONSIVENESS_COMPLAINT: 'PROBLEM_RECOGNITION',
  RESULTS_DESIRED: 'SOLUTION_EXPLORATION',
  RESULTS_UNCERTAINTY: 'VENDOR_EVALUATION',
  PROCESS_UNCLEAR: 'INFORMATION_SEEKING',
  PRICE_CONCERN: 'ALTERNATIVE_COMPARISON',
  PRICE_ACCEPTANCE: 'PURCHASE_DECISION',
  FINANCING_DEMAND: 'PURCHASE_INTENT',
  GUARANTEE_DEMAND: 'VENDOR_EVALUATION',
  TRUST_CONCERN: 'VENDOR_EVALUATION',
  QUALITY_PRAISE: 'VALUE_REALIZATION',
  CONVENIENCE_VALUE: 'PURCHASE_DECISION',
  UNKNOWN_CONCEPT: 'UNKNOWN',
});

function makeJourneyObservation(x) {
  const status = x.status || 'UNKNOWN';
  if (!OBS_STATUS.includes(status)) throw new Error(`[ASTRA-11H] bad journey observation status "${status}"`);
  const element = OBS_ELEMENT.includes(x.element) ? x.element : 'UNKNOWN';
  const stage = ST.isStage(x.stage) ? x.stage : 'UNKNOWN';
  const source_class = SOURCE_CLASSES.includes(x.source_class) ? x.source_class : 'OBSERVED';
  const evidence_refs = [...new Set((x.evidence_refs || []).map(String))].sort();
  const body = {
    schema_version: JOURNEY_SCHEMA_VERSION,
    kind: 'JourneyObservation',
    element,
    stage,
    stage_basis: stage === 'UNKNOWN' ? 'UNKNOWN' : (x.stage_basis || 'ANALYTICAL'),
    phase: ST.phaseOf(stage),
    detail: x.detail == null ? null : String(x.detail),
    span: x.span || null,
    channel: x.channel == null ? 'UNKNOWN' : String(x.channel),
    timestamp: x.timestamp == null ? null : String(x.timestamp),
    temporal_status: x.temporal_status || 'UNKNOWN_CURRENT',
    temporal_age_days: x.temporal_age_days == null ? null : Number(x.temporal_age_days),
    subject_ref: x.subject_ref == null ? null : String(x.subject_ref),
    segment_refs: [...new Set(x.segment_refs || [])].sort(),
    persona_refs: [...new Set(x.persona_refs || [])].sort(),
    speaker_role: x.speaker_role == null ? null : String(x.speaker_role),
    speaker_pseudonym: x.speaker_pseudonym == null ? null : String(x.speaker_pseudonym),
    source_ref: x.source_ref == null ? null : String(x.source_ref),
    evidence_refs,
    source_class,
    utterance_ref: x.utterance_ref == null ? null : String(x.utterance_ref),
    negated: !!x.negated,
    prior_experience: !!x.prior_experience,
    status,
    confidence: x.confidence || assess({ evidence_count: evidence_refs.length, distinct_sources: x.distinct_sources || evidence_refs.length, coverage: 0.4, newest_evidence_age_days: 90 }),
    generated_by: 'deterministic:ucdm/journey',
  };
  body.observation_id = 'jo_' + sha256Hex(canonicalize({ ...body, observation_id: undefined, confidence: body.confidence.content_hash }));
  return deepFreeze(body);
}

function validateJourneyObservation(o, evidenceRefSet = null) {
  const errors = [];
  if (!OBS_STATUS.includes(o.status)) errors.push(`bad status "${o.status}"`);
  if (!ST.isStage(o.stage)) errors.push(`uncontrolled stage "${o.stage}"`);
  if (['OBSERVED', 'COMPUTED', 'ANALYTICAL'].includes(o.status) && o.evidence_refs.length === 0) errors.push('a non-UNKNOWN journey observation needs evidence_refs');
  if (o.status === 'OBSERVED' && o.stage_basis === 'ANALYTICAL' && o.element === 'STATE') errors.push('an analytically-reconstructed stage cannot be OBSERVED');
  if (o.source_class === 'INFERRED' && o.status === 'OBSERVED') errors.push('an INFERRED value can never be OBSERVED');
  if (evidenceRefSet) for (const er of o.evidence_refs) if (!evidenceRefSet.has(er)) errors.push(`dangling evidence_ref ${er}`);
  return { valid: errors.length === 0, errors };
}

// deriveStateObservations({ vocResult, customerModel, referenceTime })
//   One STATE observation per OBSERVED VoC observation, with an ANALYTICAL stage from the
//   controlled concept map. Non-eligible speakers stay ANALYTICAL. UNKNOWN concept -> UNKNOWN.
function deriveStateObservations({ vocResult, customerModel = null, referenceTime = null }) {
  const uttByHash = Object.fromEntries((vocResult.utterances || []).map(u => [u.content_hash, u]));
  const personaBySeg = {};
  for (const p of ((customerModel && customerModel.personas) || [])) for (const s of p.segment_refs) personaBySeg[s] = p.persona_id;
  const ELIGIBLE = ['CUSTOMER', 'PROSPECT', 'FORMER_CUSTOMER'];
  const out = [];
  for (const vo of (vocResult.observations || [])) {
    const u = uttByHash[vo.utterance_ref] || null;
    const t = classifyTemporal(u && u.timestamp, referenceTime);
    const stage = CONCEPT_STAGE[vo.normalized_concept] || 'UNKNOWN';
    const eligible = ELIGIBLE.includes(vo.speaker_role);
    const status = (!eligible || vo.status !== 'OBSERVED' || stage === 'UNKNOWN') ? (stage === 'UNKNOWN' ? 'UNKNOWN' : 'ANALYTICAL') : 'ANALYTICAL';
    out.push(makeJourneyObservation({
      element: stage === 'UNKNOWN' ? 'UNKNOWN' : 'STATE',
      stage, stage_basis: 'ANALYTICAL',
      detail: vo.normalized_concept,
      span: vo.exact_span,
      channel: (u && u.source_type) || 'UNKNOWN',
      timestamp: u && u.timestamp,
      temporal_status: t.status, temporal_age_days: t.age_days,
      subject_ref: vo.speaker_pseudonym || null,
      segment_refs: vo.segment_ref ? [vo.segment_ref] : [],
      persona_refs: vo.segment_ref && personaBySeg[vo.segment_ref] ? [personaBySeg[vo.segment_ref]] : [],
      speaker_role: vo.speaker_role, speaker_pseudonym: vo.speaker_pseudonym,
      source_ref: vo.source_ref, evidence_refs: vo.evidence_refs, source_class: 'OBSERVED',
      utterance_ref: vo.utterance_ref, negated: vo.negated, prior_experience: vo.prior_experience,
      status,
    }));
  }
  return out;
}

module.exports = {
  JOURNEY_SCHEMA_VERSION, OBS_STATUS, OBS_ELEMENT, CONCEPT_STAGE,
  makeJourneyObservation, validateJourneyObservation, deriveStateObservations,
};
