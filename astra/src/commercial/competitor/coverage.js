'use strict';
// [ASTRA-11E §S] Competitor-intelligence coverage + deterministic completion assessment.
// An LLM can never mark competitor research complete. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const COMPLETION_STATUS = Object.freeze(['COMPLETE_FOR_SCOPE', 'PARTIAL', 'INSUFFICIENT', 'BLOCKED']);
const REASON_CODES = Object.freeze([
  'LOW_COMPETITOR_COUNT', 'LOW_ATTRIBUTE_COVERAGE', 'STALE_DATA', 'IDENTITY_AMBIGUITY',
  'MISSING_PRICING', 'MISSING_OFFER_DATA', 'MISSING_MESSAGE_DATA', 'MISSING_PROOF_DATA',
  'SOURCE_FAILURE', 'CONFLICTED_DATA',
]);

function ratio(have, of) { return of > 0 ? Number((have / of).toFixed(6)) : 0; }

// computeCoverage({ profiles, byCompetitor, conflicts, ingestion, referenceTime })
function computeCoverage({ profiles, byCompetitor, conflicts = [], ingestion = null, referenceTime = null }) {
  const n = profiles.length;
  const resolved = profiles.filter(p => p.identity_status === 'RESOLVED').length;
  const ambiguous = profiles.filter(p => p.identity_status === 'AMBIGUOUS').length;

  const withPricing = profiles.filter(p => (byCompetitor[p.competitor_ref] || {}).pricingCount > 0 || ((byCompetitor[p.competitor_ref] || {}).offerProfile && byCompetitor[p.competitor_ref].offerProfile.offers.some(o => !o.fields.price.status))).length;
  const withOffer = profiles.filter(p => { const b = byCompetitor[p.competitor_ref] || {}; return b.offerProfile && b.offerProfile.offer_count > 0; }).length;
  const withMessage = profiles.filter(p => { const b = byCompetitor[p.competitor_ref] || {}; return b.messageProfile && b.messageProfile.message_count > 0; }).length;
  const withProof = profiles.filter(p => { const b = byCompetitor[p.competitor_ref] || {}; return b.proofProfile && b.proofProfile.proof_count > 0; }).length;
  const withFunnel = profiles.filter(p => { const b = byCompetitor[p.competitor_ref] || {}; return b.funnelProfile && b.funnelProfile.observed_touchpoints.length > 0; }).length;
  const withCreative = profiles.filter(p => { const b = byCompetitor[p.competitor_ref] || {}; return b.creativeProfile && b.creativeProfile.creative_count > 0; }).length;
  const withAttrs = profiles.filter(p => ((byCompetitor[p.competitor_ref] || {}).attributes || []).some(a => a.kind === 'OBSERVED')).length;

  const geos = new Set(profiles.map(p => JSON.stringify(p.geography)).filter(g => g !== '"UNKNOWN"'));
  const allObservedAt = profiles.flatMap(p => ((byCompetitor[p.competitor_ref] || {}).attributes || []).map(a => a.observed_at).filter(Boolean)).map(t => Date.parse(t)).filter(Number.isFinite);
  const latest = allObservedAt.length ? new Date(Math.max(...allObservedAt)).toISOString() : null;
  const newestAge = latest && referenceTime ? (Date.parse(referenceTime) - Date.parse(latest)) / 86400000 : null;
  // a competitor whose freshest dated snapshot is not CURRENT contributes to staleness
  const staleCompetitors = profiles.filter(p => {
    const snaps = ((byCompetitor[p.competitor_ref] || {}).pricingSnapshots) || [];
    return snaps.length > 0 && !snaps.some(s => s.recency === 'CURRENT');
  }).length;

  const cov = {
    schema_version: 'ucdm-competitor-1.0.0',
    competitors_observed: n,
    competitors_resolved: resolved,
    competitors_ambiguous: ambiguous,
    attribute_coverage: ratio(withAttrs, n),
    pricing_coverage: ratio(withPricing, n),
    offer_coverage: ratio(withOffer, n),
    message_coverage: ratio(withMessage, n),
    proof_coverage: ratio(withProof, n),
    funnel_coverage: ratio(withFunnel, n),
    creative_coverage: ratio(withCreative, n),
    geographic_coverage: { distinct_geographies: geos.size },
    time_coverage: { latest, newest_age_days: newestAge == null ? null : Number(newestAge.toFixed(2)), stale: (newestAge != null && newestAge > 180) || staleCompetitors > 0, stale_competitors: staleCompetitors },
    generated_by: 'deterministic:ucdm/competitor/coverage',
  };
  cov.coverage_id = 'cmcov_' + sha256Hex(canonicalize({ ...cov, coverage_id: undefined }));
  return deepFreeze(cov);
}

function assessCompletion({ coverage, conflicts = [], ingestion = null }) {
  const reasons = [];
  if (coverage.competitors_observed < 4) reasons.push('LOW_COMPETITOR_COUNT');
  if (coverage.attribute_coverage < 0.5) reasons.push('LOW_ATTRIBUTE_COVERAGE');
  if (coverage.time_coverage.stale) reasons.push('STALE_DATA');
  if (coverage.competitors_ambiguous > 0) reasons.push('IDENTITY_AMBIGUITY');
  if (coverage.pricing_coverage === 0) reasons.push('MISSING_PRICING');
  if (coverage.offer_coverage === 0) reasons.push('MISSING_OFFER_DATA');
  if (coverage.message_coverage === 0) reasons.push('MISSING_MESSAGE_DATA');
  if (coverage.proof_coverage === 0) reasons.push('MISSING_PROOF_DATA');
  if ((conflicts || []).length > 0) reasons.push('CONFLICTED_DATA');
  const failedRecs = (ingestion && ingestion.ingestion_records || []).filter(r => r.status === 'REJECTED' && r.errors.some(e => /adapter/i.test(e))).length;
  if (failedRecs > 0) reasons.push('SOURCE_FAILURE');
  const normalized = (ingestion && ingestion.ingestion_records || []).filter(r => r.status === 'NORMALIZED').length;

  let status;
  if (coverage.competitors_observed === 0 || (ingestion && normalized === 0)) status = 'BLOCKED';
  else if (coverage.competitors_observed < 2 || (reasons.includes('MISSING_MESSAGE_DATA') && reasons.includes('MISSING_PRICING'))) status = 'INSUFFICIENT';
  else if (reasons.length > 0) status = 'PARTIAL';
  else status = 'COMPLETE_FOR_SCOPE';

  const body = {
    schema_version: 'ucdm-competitor-1.0.0',
    status, reason_codes: [...new Set(reasons)].sort(),
    generated_by: 'deterministic:ucdm/competitor/completion',
    note: 'an LLM may never mark competitor research complete',
  };
  body.completion_id = 'cmcmp_' + sha256Hex(canonicalize({ ...body, completion_id: undefined }));
  return deepFreeze(body);
}

module.exports = { COMPLETION_STATUS, REASON_CODES, computeCoverage, assessCompletion };
