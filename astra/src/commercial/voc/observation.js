'use strict';
// [ASTRA-11F §D] VocObservation — one grounded aspect from one utterance span. status
// OBSERVED (a customer-attributable span) or ANALYTICAL (a derived cross-utterance note).
// Intensity is only set when an EXPLICIT intensity word is present — never inferred from
// punctuation. No hidden psychographic inference. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { assess } = require('../validation/confidence');
const { VOC_ASPECTS } = require('./taxonomy');

const OBS_STATUS = Object.freeze(['OBSERVED', 'ANALYTICAL']);
const POLARITY = Object.freeze(['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED', 'UNKNOWN']);

// makeObservation({ utterance, span, subject, segment_ref, journey_stage_ref })
function makeObservation({ utterance, span, subject = null }) {
  if (!VOC_ASPECTS.includes(span.aspect)) throw new Error(`[ASTRA-11F] unknown VOC aspect "${span.aspect}"`);
  const evidence_refs = [...((utterance.provenance && utterance.provenance.evidence_refs) || [])];
  if (evidence_refs.length === 0) throw new Error('[ASTRA-11F] VocObservation requires an evidence_ref');

  const confidence = assess({
    evidence_count: 1, distinct_sources: 1, newest_evidence_age_days: 90, coverage: 1,
    agree_count: 1, conflict_count: 0, data_quality: span.matched_rule ? 0.7 : 0.4,
  });

  const body = {
    schema_version: 'ucdm-voc-1.0.0',
    utterance_ref: utterance.content_hash,
    aspect: span.aspect,
    subject: subject || 'the business',
    evidence_ref: evidence_refs[0],
    evidence_refs,
    exact_span: { text: span.span_text, start: span.span_start, end: span.span_end },
    span_matches_verbatim: utterance.verbatim_text.slice(span.span_start, span.span_end) === span.span_text,
    normalized_concept: span.canonical_concept,
    concept_map_version: 'voc-concept-v1',
    polarity: POLARITY.includes(span.polarity) ? span.polarity : 'UNKNOWN',
    // intensity: only from an explicit intensity word; null otherwise
    intensity: span.intensity || null,
    intensity_basis: span.intensity ? 'EXPLICIT_INTENSITY_WORD' : 'NOT_DETERMINABLE',
    negated: !!span.negated,
    prior_experience: !!span.prior_experience,
    decision_criterion: span.criterion || null,
    speaker_role: utterance.speaker_role,
    speaker_pseudonym: utterance.speaker_pseudonym,
    source_ref: utterance.source_ref,
    segment_ref: utterance.segment_ref || null,
    journey_stage_ref: utterance.journey_stage_ref || null,
    confidence,
    status: span.aspect === 'UNKNOWN' || !span.matched_rule ? 'ANALYTICAL' : 'OBSERVED',
  };
  body.observation_id = 'voco_' + sha256Hex(canonicalize({ ...body, observation_id: undefined, confidence: confidence.content_hash }));
  return deepFreeze(body);
}

function validateObservation(ob) {
  const errors = [];
  if (!VOC_ASPECTS.includes(ob.aspect)) errors.push(`bad aspect "${ob.aspect}"`);
  if (!OBS_STATUS.includes(ob.status)) errors.push(`bad status "${ob.status}"`);
  if (!ob.evidence_refs || ob.evidence_refs.length === 0) errors.push('observation needs evidence_refs');
  if (ob.exact_span && ob.span_matches_verbatim === false) errors.push('exact_span does not match the verbatim text at its offsets');
  if (ob.intensity && ob.intensity_basis !== 'EXPLICIT_INTENSITY_WORD') errors.push('intensity set without an explicit intensity word');
  return { valid: errors.length === 0, errors };
}

module.exports = { OBS_STATUS, POLARITY, makeObservation, validateObservation };
