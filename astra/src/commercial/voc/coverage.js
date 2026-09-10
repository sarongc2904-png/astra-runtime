'use strict';
// [ASTRA-11F §O §P §Q §W] VocCoverage + deterministic segment / journey comparisons +
// deterministic VocCompletion. NO demographic inference. Journey stage is NEVER silently
// inferred. An LLM cannot mark VOC complete. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const COMPLETION_STATUS = Object.freeze(['COMPLETE_FOR_SCOPE', 'PARTIAL', 'INSUFFICIENT', 'BLOCKED']);
const REASON_CODES = Object.freeze([
  'LOW_SOURCE_COUNT', 'LOW_SPEAKER_COUNT', 'LOW_SOURCE_DIVERSITY', 'UNKNOWN_SPEAKER_HEAVY',
  'MISSING_SEGMENT_COVERAGE', 'MISSING_JOURNEY_COVERAGE', 'STALE_DATA', 'DUPLICATE_HEAVY',
  'LANGUAGE_MISMATCH', 'SOURCE_FAILURE',
]);
const JOURNEY_STAGES = Object.freeze(['awareness', 'consideration', 'evaluation', 'purchase', 'onboarding', 'retention', 'upsell', 'advocacy']);

function computeCoverage({ utterances, observations, envelopesBySource = {}, request = {}, referenceTime = null, ingestion = null }) {
  const sources = new Set(utterances.map(u => u.source_ref).filter(Boolean));
  const speakerIds = utterances.map(u => u.speaker_pseudonym).filter(Boolean);
  const knownSpeakers = new Set(speakerIds).size;
  const unknownSpeakerUtterances = utterances.filter(u => !u.speaker_pseudonym).length;
  const sourceTypes = new Set(utterances.map(u => u.source_type).filter(Boolean));
  const segments = new Set(utterances.map(u => u.segment_ref).filter(Boolean));
  const stages = new Set(utterances.map(u => u.journey_stage_ref).filter(Boolean));
  const langs = new Set(utterances.map(u => u.language).filter(Boolean));
  const times = utterances.map(u => u.timestamp).filter(Boolean).map(t => Date.parse(t)).filter(Number.isFinite);
  const latest = times.length ? new Date(Math.max(...times)).toISOString() : null;
  const newestAge = latest && referenceTime ? Number(((Date.parse(referenceTime) - Date.parse(latest)) / 86400000).toFixed(2)) : null;

  // duplicate ratio: identical verbatim text (across ANY source — copy-paste / bot / same person)
  const seenText = new Map();
  for (const u of utterances) { const k = u.verbatim_text.trim().toLowerCase(); seenText.set(k, (seenText.get(k) || 0) + 1); }
  let dup = 0;
  for (const [, n] of seenText) if (n > 1) dup += n - 1;

  const cov = {
    schema_version: 'ucdm-voc-1.0.0',
    source_count: sources.size,
    utterance_count: utterances.length,
    observation_count: observations.length,
    unique_speaker_count: knownSpeakers || null,
    known_vs_unknown_speakers: { known: knownSpeakers, unknown_utterances: unknownSpeakerUtterances },
    source_type_diversity: sourceTypes.size,
    source_types: [...sourceTypes].sort(),
    segment_coverage: { segments: [...segments].sort(), count: segments.size },
    journey_stage_coverage: { stages: [...stages].sort(), count: stages.size },
    time_coverage: { latest, newest_age_days: newestAge, stale: newestAge == null ? null : newestAge > 365 },
    language_coverage: { languages: [...langs].sort(), count: langs.size, request_language: request.language || null, mismatch: request.language ? !langs.has(request.language) && langs.size > 0 : false },
    duplicate_ratio: utterances.length ? Number((dup / utterances.length).toFixed(4)) : 0,
    sampling_limitations: [],
    generated_by: 'deterministic:ucdm/voc/coverage',
  };
  if (cov.source_count < 5) cov.sampling_limitations.push('few sources — not representative of the customer base');
  if (!cov.unique_speaker_count) cov.sampling_limitations.push('speakers not identifiable — prevalence cannot be expressed as "% of customers"');
  if (unknownSpeakerUtterances / Math.max(1, utterances.length) > 0.5) cov.sampling_limitations.push('majority of utterances have unknown speaker attribution');
  cov.coverage_id = 'vocov_' + sha256Hex(canonicalize({ ...cov, coverage_id: undefined }));
  return deepFreeze(cov);
}

// §P — deterministic segment comparison; ONLY on explicit segment_refs.
function compareSegments(clusters, observations) {
  const bySeg = {};
  for (const o of observations) {
    if (!o.segment_ref) continue;
    (bySeg[o.segment_ref] = bySeg[o.segment_ref] || {})[`${o.aspect}::${o.normalized_concept}`] =
      ((bySeg[o.segment_ref] || {})[`${o.aspect}::${o.normalized_concept}`] || 0) + 1;
  }
  const segs = Object.keys(bySeg).sort();
  if (segs.length < 2) return deepFreeze({ status: 'INSUFFICIENT_SEGMENT_REFS', note: 'segment comparison requires >= 2 explicit segment_refs; no demographic inference', segments: segs });
  return deepFreeze({
    status: 'OK', segments: segs,
    concept_counts_by_segment: bySeg,
    top_concept_by_segment: Object.fromEntries(segs.map(s => [s, Object.entries(bySeg[s]).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0] || null])),
    generated_by: 'deterministic:ucdm/voc',
    note: 'explicit segment_refs only — no demographic inference',
  });
}

// §Q — deterministic journey-stage comparison; ONLY on supplied stage refs.
function compareJourneyStages(observations) {
  const byStage = {};
  for (const o of observations) { if (!o.journey_stage_ref) continue; (byStage[o.journey_stage_ref] = byStage[o.journey_stage_ref] || {})[o.aspect] = ((byStage[o.journey_stage_ref] || {})[o.aspect] || 0) + 1; }
  const stages = Object.keys(byStage).sort();
  if (stages.length < 2) return deepFreeze({ status: 'INSUFFICIENT_STAGE_REFS', note: 'journey stage is never silently inferred; UNKNOWN remains valid', stages });
  return deepFreeze({ status: 'OK', stages, aspect_counts_by_stage: byStage, generated_by: 'deterministic:ucdm/voc' });
}

function assessCompletion({ coverage, ingestion = null }) {
  const reasons = [];
  if (coverage.source_count < 5) reasons.push('LOW_SOURCE_COUNT');
  if (!coverage.unique_speaker_count || coverage.unique_speaker_count < 8) reasons.push('LOW_SPEAKER_COUNT');
  if (coverage.source_type_diversity < 2) reasons.push('LOW_SOURCE_DIVERSITY');
  if (coverage.known_vs_unknown_speakers.unknown_utterances / Math.max(1, coverage.utterance_count) > 0.5) reasons.push('UNKNOWN_SPEAKER_HEAVY');
  if (coverage.segment_coverage.count === 0) reasons.push('MISSING_SEGMENT_COVERAGE');
  if (coverage.journey_stage_coverage.count === 0) reasons.push('MISSING_JOURNEY_COVERAGE');
  if (coverage.time_coverage.stale) reasons.push('STALE_DATA');
  if (coverage.duplicate_ratio >= 0.25) reasons.push('DUPLICATE_HEAVY');
  if (coverage.language_coverage.mismatch) reasons.push('LANGUAGE_MISMATCH');
  const failedRecs = (ingestion && ingestion.ingestion_records || []).filter(r => r.status === 'REJECTED' && r.errors.some(e => /adapter/i.test(e))).length;
  if (failedRecs > 0) reasons.push('SOURCE_FAILURE');

  let status;
  if (coverage.utterance_count === 0) status = 'BLOCKED';
  else if (coverage.source_count < 2 || coverage.observation_count === 0) status = 'INSUFFICIENT';
  else if (reasons.length > 0) status = 'PARTIAL';
  else status = 'COMPLETE_FOR_SCOPE';

  const body = { schema_version: 'ucdm-voc-1.0.0', status, reason_codes: [...new Set(reasons)].sort(), generated_by: 'deterministic:ucdm/voc/completion', note: 'an LLM may never mark VOC research complete' };
  body.completion_id = 'voccmp_' + sha256Hex(canonicalize({ ...body, completion_id: undefined }));
  return deepFreeze(body);
}

module.exports = { COMPLETION_STATUS, REASON_CODES, JOURNEY_STAGES, computeCoverage, compareSegments, compareJourneyStages, assessCompletion };
