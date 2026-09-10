'use strict';
// [ASTRA-11G §F] Segment size discipline. ASTRA may deterministically COUNT supplied
// observations / customers. It may NOT extrapolate a market share ("40% of the market")
// from a convenience sample. External market size is UNKNOWN unless explicitly supplied.
// No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const SIZE_BASIS = Object.freeze(['OBSERVED_SAMPLE_COUNT', 'KNOWN_CUSTOMER_COUNT', 'ESTIMATED_EXTERNAL_MARKET_SIZE', 'UNKNOWN']);

// computeSegmentMetrics(candidate, { suppliedSizes }) -> frozen SegmentMetrics
//   suppliedSizes: { <segment_id>: { known_customer_count?, estimated_external_market_size?, estimate_source? } }
function computeSegmentMetrics(candidate, { suppliedSizes = {} } = {}) {
  const s = candidate.observed_sample;
  const supplied = suppliedSizes[candidate.segment_id] || {};
  const known = supplied.known_customer_count != null ? Number(supplied.known_customer_count)
    : (s.known_customer_count != null ? s.known_customer_count : null);
  const external = supplied.estimated_external_market_size != null
    ? { value: Number(supplied.estimated_external_market_size), source: String(supplied.estimate_source || 'business_supplied'), basis: 'ESTIMATED_EXTERNAL_MARKET_SIZE' }
    : { value: null, source: null, basis: 'UNKNOWN' };

  const body = {
    schema_version: 'ucdm-customer-model-1.0.0', kind: 'SegmentMetrics', segment_id: candidate.segment_id,
    observed_sample_count: s.deduped_observation_count,
    observed_source_count: s.unique_source_count,
    known_customer_count: known,
    estimated_external_market_size: external,
    share_of_sample: null, // deliberately null-able; only set when a total is meaningful
    fabricated_market_share: false,
    coverage_note: 'counts reflect the supplied sample only; this is NOT a projection to the whole market',
    generated_by: 'deterministic:ucdm/customer_model/metrics',
  };
  body.metrics_id = 'segx_' + sha256Hex(canonicalize({ ...body, metrics_id: undefined }));
  return deepFreeze(body);
}

// Optional: share of the SUPPLIED sample only (never "share of market"). Explicit denominator.
function shareOfSample(metrics, totalDedupedSampleObservations) {
  if (!totalDedupedSampleObservations) return { share: null, denominator: 0, note: 'no sample denominator' };
  return {
    share: Number((metrics.observed_sample_count / totalDedupedSampleObservations).toFixed(4)),
    denominator: totalDedupedSampleObservations,
    note: 'fraction of the SUPPLIED sample — not a market share',
  };
}

const MARKET_SHARE_RE = /\b\d{1,3}\s?%\s*(of|del?)\s*(the\s*)?(market|mercado|customers|clientes|population|poblaci[oó]n)\b/i;
function validateSegmentMetrics(m) {
  const errors = [];
  if (m.estimated_external_market_size.basis === 'ESTIMATED_EXTERNAL_MARKET_SIZE' && !m.estimated_external_market_size.source) errors.push('an external market-size estimate must name its source');
  if (MARKET_SHARE_RE.test(JSON.stringify(m))) errors.push('segment metrics must not state a market-share percentage from a sample');
  if (m.fabricated_market_share !== false) errors.push('fabricated_market_share must be false');
  return { valid: errors.length === 0, errors };
}

module.exports = { SIZE_BASIS, computeSegmentMetrics, shareOfSample, validateSegmentMetrics };
