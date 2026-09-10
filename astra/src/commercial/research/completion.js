'use strict';
// [ASTRA-11D remediation §10] Deterministic research completion assessment.
// An LLM may NEVER mark research complete — generated_by is a deterministic producer.
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const COMPLETION_STATUS = Object.freeze(['COMPLETE_FOR_SCOPE', 'PARTIAL', 'INSUFFICIENT', 'BLOCKED']);
const REASON_CODES = Object.freeze([
  'LOW_SOURCE_COUNT', 'LOW_SOURCE_DIVERSITY', 'STALE_EVIDENCE', 'GEOGRAPHIC_MISMATCH',
  'MISSING_PRICING', 'MISSING_CUSTOMER_SIGNAL', 'CONFLICTED_EVIDENCE', 'SOURCE_FAILURE',
]);
const PRODUCER = 'deterministic:ucdm/research/completion';

const MIN_SOURCES_FOR_SCOPE = { SAMPLE: 3, LOCAL: 4, CATEGORY: 6, GLOBAL: 9 };

function assessCompletion({ coverage, pricingStats, customerSignals, conflicts, ingestion, plan, request }) {
  const reasons = [];
  const detail = {};

  const scope = plan.scope || 'SAMPLE';
  const minSources = MIN_SOURCES_FOR_SCOPE[scope] || 3;
  if (coverage.source_count < minSources) { reasons.push('LOW_SOURCE_COUNT'); detail.LOW_SOURCE_COUNT = { have: coverage.source_count, need: minSources }; }
  if (coverage.source_diversity < 0.4) { reasons.push('LOW_SOURCE_DIVERSITY'); detail.LOW_SOURCE_DIVERSITY = { diversity: coverage.source_diversity }; }
  if (coverage.time_coverage && coverage.time_coverage.stale) { reasons.push('STALE_EVIDENCE'); detail.STALE_EVIDENCE = { newest_age_days: coverage.time_coverage.newest_age_days }; }
  if (!coverage.geographic_coverage.unknown && coverage.geographic_coverage.match === false) { reasons.push('GEOGRAPHIC_MISMATCH'); detail.GEOGRAPHIC_MISMATCH = coverage.geographic_coverage; }

  const objs = new Set(plan.objectives || []);
  const pricingSamples = pricingStats ? Object.values(pricingStats.by_currency).reduce((s, c) => s + c.sample_size, 0) : 0;
  if (objs.has('PRICING') && pricingSamples === 0) { reasons.push('MISSING_PRICING'); }
  if (objs.has('CUSTOMER_PROBLEMS') && (customerSignals || []).length === 0) { reasons.push('MISSING_CUSTOMER_SIGNAL'); }

  const openConflicts = (conflicts || []).filter(c => c.status === 'OPEN').length;
  if (openConflicts > 0) { reasons.push('CONFLICTED_EVIDENCE'); detail.CONFLICTED_EVIDENCE = { open: openConflicts }; }

  const failedRecs = (ingestion && ingestion.ingestion_records || []).filter(r => r.status === 'REJECTED' && r.errors.some(e => /no adapter matched|adapter/i.test(e))).length;
  const normalizedRecs = (ingestion && ingestion.ingestion_records || []).filter(r => r.status === 'NORMALIZED').length;
  if (failedRecs > 0) { reasons.push('SOURCE_FAILURE'); detail.SOURCE_FAILURE = { rejected_source_records: failedRecs }; }

  let status;
  if (normalizedRecs === 0) status = 'BLOCKED';
  else if (coverage.source_count < 2 || (reasons.includes('MISSING_PRICING') && reasons.includes('MISSING_CUSTOMER_SIGNAL'))) status = 'INSUFFICIENT';
  else if (reasons.length > 0) status = 'PARTIAL';
  else status = 'COMPLETE_FOR_SCOPE';

  const body = {
    schema_version: 'ucdm-research-1.0.0',
    status,
    scope,
    reason_codes: [...new Set(reasons)].sort(),
    detail,
    normalized_source_records: normalizedRecs,
    generated_by: PRODUCER,
    note: 'deterministic; an LLM may never mark research complete',
  };
  body.completion_id = 'mcmp_' + sha256Hex(canonicalize({ ...body, completion_id: undefined }));
  return deepFreeze(body);
}

module.exports = { COMPLETION_STATUS, REASON_CODES, assessCompletion, MIN_SOURCES_FOR_SCOPE };
