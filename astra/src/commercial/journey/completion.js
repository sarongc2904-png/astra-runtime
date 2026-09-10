'use strict';
// [ASTRA-11H §Z] Deterministic JourneyModelCompletion. An LLM can NEVER mark completion.
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const COMPLETION_STATUS = Object.freeze(['COMPLETE_FOR_SCOPE', 'PARTIAL', 'INSUFFICIENT', 'BLOCKED']);
const REASON_CODES = Object.freeze([
  'LOW_JOURNEY_EVIDENCE', 'LOW_UNIQUE_SPEAKER_COUNT', 'MISSING_TRIGGER', 'MISSING_TRANSITION_EVIDENCE',
  'MISSING_PURCHASE_EVIDENCE', 'MISSING_POST_PURCHASE_EVIDENCE', 'MISSING_OUTCOME', 'MISSING_ALTERNATIVE',
  'MISSING_PROOF_REQUIREMENT', 'LOW_JTBD_COVERAGE', 'SEGMENT_CONFLICT', 'TEMPORAL_AMBIGUITY', 'SOURCE_FAILURE',
]);

function assessCompletion(x) {
  const { coverage, triggers = [], transitions = [], proofRequirements = [], alternatives = [], jobs = [], jobOutcomes = [], conflicts = [], temporalSplit = null, vocResult = {} } = x;
  const reasons = [];

  if (coverage.observed_journey_observation_count < 5) reasons.push('LOW_JOURNEY_EVIDENCE');
  if (!coverage.voc_unique_speaker_count || coverage.voc_unique_speaker_count < 5) reasons.push('LOW_UNIQUE_SPEAKER_COUNT');
  if (triggers.length === 0) reasons.push('MISSING_TRIGGER');
  if (transitions.length === 0) reasons.push('MISSING_TRANSITION_EVIDENCE');
  if (!coverage.has_purchase_evidence) reasons.push('MISSING_PURCHASE_EVIDENCE');
  if (!coverage.has_post_purchase) reasons.push('MISSING_POST_PURCHASE_EVIDENCE');
  if (jobOutcomes.length === 0) reasons.push('MISSING_OUTCOME');
  if (alternatives.length === 0) reasons.push('MISSING_ALTERNATIVE');
  if (proofRequirements.length === 0) reasons.push('MISSING_PROOF_REQUIREMENT');
  if (jobs.length === 0 || jobs.every(j => j.unknowns.length >= 8)) reasons.push('LOW_JTBD_COVERAGE');
  if (conflicts.some(c => ['MIXED', 'POLARIZED'].includes(c.status))) reasons.push('SEGMENT_CONFLICT');
  if (temporalSplit && temporalSplit.unknown.length > (temporalSplit.current.length + temporalSplit.historical.length)) reasons.push('TEMPORAL_AMBIGUITY');
  const failedRecs = ((vocResult.ingestion && vocResult.ingestion.ingestion_records) || []).filter(r => r.status === 'REJECTED').length;
  if (failedRecs > 0) reasons.push('SOURCE_FAILURE');

  let status;
  if (coverage.journey_observation_count === 0) status = 'BLOCKED';
  else if (coverage.observed_journey_observation_count === 0 || coverage.voc_source_count < 2) status = 'INSUFFICIENT';
  else if (reasons.length > 0) status = 'PARTIAL';
  else status = 'COMPLETE_FOR_SCOPE';

  const body = {
    schema_version: 'ucdm-journey-1.0.0', kind: 'JourneyModelCompletion',
    status, reason_codes: [...new Set(reasons)].sort(),
    generated_by: 'deterministic:ucdm/journey/completion',
    note: 'an LLM may never mark the journey model complete',
  };
  body.completion_id = 'jcmp_' + sha256Hex(canonicalize({ ...body, completion_id: undefined }));
  return deepFreeze(body);
}

module.exports = { COMPLETION_STATUS, REASON_CODES, assessCompletion };
