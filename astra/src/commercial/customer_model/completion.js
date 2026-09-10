'use strict';
// [ASTRA-11G §W] Deterministic CustomerModelCompletion. An LLM can NEVER mark completion.
// COMPLETE_FOR_SCOPE / PARTIAL / INSUFFICIENT / BLOCKED. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const COMPLETION_STATUS = Object.freeze(['COMPLETE_FOR_SCOPE', 'PARTIAL', 'INSUFFICIENT', 'BLOCKED']);
const REASON_CODES = Object.freeze([
  'LOW_CUSTOMER_EVIDENCE', 'LOW_VOC_COVERAGE', 'LOW_UNIQUE_SPEAKER_COUNT', 'MISSING_PROBLEM_SIGNAL',
  'MISSING_DESIRED_OUTCOME', 'MISSING_DECISION_CRITERIA', 'UNKNOWN_AWARENESS', 'UNKNOWN_BUDGET_SIGNAL',
  'SEGMENT_CONFLICT', 'LOW_ICP_COVERAGE', 'IDENTITY_AMBIGUITY', 'SOURCE_FAILURE',
]);

// assessCompletion({ coverage, segments, personas, awareness, budget, icp, conflicts, vocResult })
function assessCompletion(x) {
  const { coverage, segments = [], awareness = null, budget = null, icp = null, conflicts = [], vocResult = {} } = x;
  const reasons = [];

  if (coverage.attribute_evidence_observed < 3) reasons.push('LOW_CUSTOMER_EVIDENCE');
  if (coverage.voc_source_count < 5) reasons.push('LOW_VOC_COVERAGE');
  if (!coverage.voc_unique_speaker_count || coverage.voc_unique_speaker_count < 5) reasons.push('LOW_UNIQUE_SPEAKER_COUNT');
  if (!coverage.has_problem_signal) reasons.push('MISSING_PROBLEM_SIGNAL');
  if (!coverage.has_desired_outcome) reasons.push('MISSING_DESIRED_OUTCOME');
  if (!coverage.has_decision_criteria) reasons.push('MISSING_DECISION_CRITERIA');
  if (!awareness || awareness.stage === 'UNKNOWN') reasons.push('UNKNOWN_AWARENESS');
  if (!budget || budget.signal === 'NO_BUDGET_SIGNAL' || budget.signal === 'UNKNOWN') reasons.push('UNKNOWN_BUDGET_SIGNAL');
  if (conflicts.some(c => ['MIXED', 'POLARIZED'].includes(c.status))) reasons.push('SEGMENT_CONFLICT');
  if (icp && icp.status === 'ACTIVE' && (icp.unknowns || []).length > 6) reasons.push('LOW_ICP_COVERAGE');
  if (coverage.voc_utterance_count > 0 && !coverage.voc_unique_speaker_count) reasons.push('IDENTITY_AMBIGUITY');
  const failedRecs = ((vocResult.ingestion && vocResult.ingestion.ingestion_records) || []).filter(r => r.status === 'REJECTED').length;
  if (failedRecs > 0) reasons.push('SOURCE_FAILURE');

  let status;
  if (coverage.voc_utterance_count === 0 || segments.length === 0) status = 'BLOCKED';
  else if (coverage.attribute_evidence_observed === 0 || coverage.voc_source_count < 2) status = 'INSUFFICIENT';
  else if (reasons.length > 0) status = 'PARTIAL';
  else status = 'COMPLETE_FOR_SCOPE';

  const body = {
    schema_version: 'ucdm-customer-model-1.0.0', kind: 'CustomerModelCompletion',
    status, reason_codes: [...new Set(reasons)].sort(),
    generated_by: 'deterministic:ucdm/customer_model/completion',
    note: 'an LLM may never mark the customer model complete',
  };
  body.completion_id = 'cmcmp_' + sha256Hex(canonicalize({ ...body, completion_id: undefined }));
  return deepFreeze(body);
}

module.exports = { COMPLETION_STATUS, REASON_CODES, assessCompletion };
