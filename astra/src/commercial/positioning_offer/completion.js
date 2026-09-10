'use strict';
// [ASTRA-11I §AB] Deterministic OfferModelCompletion. An LLM can NEVER mark completion.
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const COMPLETION_STATUS = Object.freeze(['COMPLETE_FOR_SCOPE', 'PARTIAL', 'INSUFFICIENT', 'BLOCKED']);
const REASON_CODES = Object.freeze([
  'LOW_MARKET_EVIDENCE', 'LOW_VOC_COVERAGE', 'LOW_SEGMENT_COVERAGE', 'LOW_JTBD_COVERAGE',
  'MISSING_PROBLEM', 'MISSING_DESIRED_OUTCOME', 'MISSING_DIFFERENTIATOR', 'MISSING_PROOF',
  'MISSING_PRICING', 'MISSING_BUSINESS_CAPABILITY', 'UNADDRESSED_CORE_OBJECTION', 'COMPETITOR_PARITY',
  'POSITIONING_CONFLICT', 'OFFER_SEGMENT_MISMATCH', 'SOURCE_FAILURE',
]);

function assessCompletion(x) {
  const {
    researchResult = null, vocResult = {}, customerModel = null, journeyResult = null,
    territories = [], valueProps = [], differentiation = [], proofStrategy = null, pricing = null,
    businessInput = {}, objectionMap = [], offerSegmentFits = [], conflicts = [], competitorComparison = null,
  } = x;
  const reasons = [];

  if (!researchResult || (researchResult.facts || []).length < 3) reasons.push('LOW_MARKET_EVIDENCE');
  const vc = vocResult.coverage || {};
  if ((vc.source_count || 0) < 5) reasons.push('LOW_VOC_COVERAGE');
  const supportedSeg = ((customerModel && customerModel.segments) || []).filter(s => s.status === 'SUPPORTED').length;
  if (supportedSeg === 0) reasons.push('LOW_SEGMENT_COVERAGE');
  if (((journeyResult && journeyResult.jobs) || []).length === 0) reasons.push('LOW_JTBD_COVERAGE');
  if (territories.every(t => t.problem_context === 'UNKNOWN')) reasons.push('MISSING_PROBLEM');
  if (territories.every(t => t.desired_progress === 'UNKNOWN')) reasons.push('MISSING_DESIRED_OUTCOME');
  if (differentiation.length === 0 || differentiation.every(d => d.customer_relevance !== 'EVIDENCED')) reasons.push('MISSING_DIFFERENTIATOR');
  if (!proofStrategy || proofStrategy.available.length === 0) reasons.push('MISSING_PROOF');
  if (!pricing || (pricing.own_supplied_price.status === 'UNKNOWN' && pricing.observed_competitor_prices.length === 0)) reasons.push('MISSING_PRICING');
  if ((businessInput.capabilities || []).length === 0) reasons.push('MISSING_BUSINESS_CAPABILITY');
  if (objectionMap.some(m => m.handling_status === 'UNADDRESSED')) reasons.push('UNADDRESSED_CORE_OBJECTION');
  if (competitorComparison && competitorComparison.dimensions.some(d => d.status === 'SAME')) reasons.push('COMPETITOR_PARITY');
  if (conflicts.some(c => ['MIXED', 'POLARIZED'].includes(c.status) && c.dimension.includes('POSITIONING'))) reasons.push('POSITIONING_CONFLICT');
  if (offerSegmentFits.some(f => ['POOR', 'WEAK'].includes(f.fit_band))) reasons.push('OFFER_SEGMENT_MISMATCH');
  const failedRecs = ((vocResult.ingestion && vocResult.ingestion.ingestion_records) || []).filter(r => r.status === 'REJECTED').length;
  if (failedRecs > 0) reasons.push('SOURCE_FAILURE');

  let status;
  if (territories.length === 0) status = 'BLOCKED';
  else if (supportedSeg === 0 && (vc.source_count || 0) < 2) status = 'INSUFFICIENT';
  else if (valueProps.every(v => ['INSUFFICIENT', 'HYPOTHESIS'].includes(v.status))) status = 'INSUFFICIENT';
  else if (reasons.length > 0) status = 'PARTIAL';
  else status = 'COMPLETE_FOR_SCOPE';

  const body = {
    schema_version: 'ucdm-positioning-offer-1.0.0', kind: 'OfferModelCompletion',
    status, reason_codes: [...new Set(reasons)].sort(),
    generated_by: 'deterministic:ucdm/positioning_offer/completion',
    note: 'an LLM may never mark the positioning/offer model complete',
  };
  body.completion_id = 'pocmp_' + sha256Hex(canonicalize({ ...body, completion_id: undefined }));
  return deepFreeze(body);
}

module.exports = { COMPLETION_STATUS, REASON_CODES, assessCompletion };
