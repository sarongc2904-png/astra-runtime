'use strict';
// [ASTRA-11D remediation §1] Deterministic MarketCoverage.
// Distinguishes a SAMPLE claim ("6 of 8 observed competitors...") from a GLOBAL claim
// ("The market..."). Global extrapolation from insufficient local evidence FAILS CLOSED.
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const N_CATEGORIES_SEEN_FOR_FULL_DIVERSITY = 4;

// per-scope minimums for allowing a claim to keep that scope
const SCOPE_MIN = {
  SAMPLE: { sources: 1, diversity: 0.0, competitors: 0 },
  LOCAL: { sources: 3, diversity: 0.34, competitors: 2 },
  CATEGORY: { sources: 5, diversity: 0.5, competitors: 3 },
  GLOBAL: { sources: 8, diversity: 0.6, competitors: 5 },
};

function computeCoverage({ observations, facts, dedupe, envelopesBySource, request, plan, referenceTime }) {
  const sourceIds = new Set();
  const categories = {};
  for (const [sid, env] of Object.entries(envelopesBySource || {})) { sourceIds.add(sid); categories[env.source_category] = (categories[env.source_category] || 0) + 1; }
  const distinctObsHashes = new Set(observations.map(o => o.canonical_content_hash));

  const competitorSubjects = new Set(facts.filter(f => /^subject:Competitor/.test(f.subject_ref)).map(f => f.subject_ref));
  const reviewSources = Object.entries(envelopesBySource || {}).filter(([, e]) => e.source_category === 'REVIEW').map(([s]) => s);
  // one review = one customer QUOTE from a REVIEW source (RATING observations are not extra reviews)
  const reviewObs = observations.filter(o => o.observation_type === 'QUOTE' && (envelopesBySource || {})[o.source_ref] && envelopesBySource[o.source_ref].source_category === 'REVIEW');

  const distinctCategories = Object.keys(categories).length;
  const source_diversity = Number(Math.min(1, distinctCategories / Math.min(N_CATEGORIES_SEEN_FOR_FULL_DIVERSITY, Math.max(1, sourceIds.size))).toFixed(6));

  const geos = new Set(facts.map(f => f.geography).filter(g => g && g !== 'UNKNOWN').map(g => (typeof g === 'object' ? JSON.stringify(g) : String(g))));
  const reqGeo = request.geography && request.geography !== 'UNKNOWN' ? (typeof request.geography === 'object' ? JSON.stringify(request.geography) : String(request.geography)) : null;
  const geographic_coverage = { requested: request.geography, observed: [...geos].sort(), match: reqGeo == null ? true : geos.has(reqGeo), unknown: reqGeo == null };

  const times = facts.map(f => f.observed_at).filter(Boolean).map(t => Date.parse(t)).filter(n => Number.isFinite(n));
  const earliest = times.length ? new Date(Math.min(...times)).toISOString() : null;
  const latest = times.length ? new Date(Math.max(...times)).toISOString() : null;
  const newestAgeDays = latest && referenceTime ? Number(((Date.parse(referenceTime) - Date.parse(latest)) / 86400000).toFixed(2)) : null;
  const w = (plan && plan.temporal_requirements) || request.time_window || null;
  const time_coverage = {
    earliest, latest, span_days: (earliest && latest) ? Number(((Date.parse(latest) - Date.parse(earliest)) / 86400000).toFixed(2)) : null,
    newest_age_days: newestAgeDays,
    window_requested: w, within_window: w == null ? null : (!!earliest && !!latest && (w.start == null || Date.parse(earliest) >= Date.parse(w.start)) && (w.end == null || Date.parse(latest) <= Date.parse(w.end))),
    stale: newestAgeDays == null ? null : newestAgeDays > 180,
  };

  const obsCatSet = new Set(observations.map(o => o.structured_values && o.structured_values.product_category).filter(Boolean));
  const category_coverage = { requested: request.category, observed_categories: [...obsCatSet].sort(), match: request.category === 'UNKNOWN' ? null : obsCatSet.has(request.category) };

  const cov = {
    schema_version: 'ucdm-research-1.0.0',
    source_count: sourceIds.size,
    distinct_observation_count: distinctObsHashes.size,
    competitor_count: competitorSubjects.size,
    review_count: reviewObs.length,
    review_source_count: reviewSources.length,
    source_categories: categories,
    source_diversity,
    geographic_coverage,
    time_coverage,
    category_coverage,
    dedup: dedupe ? { possible_duplicates: dedupe.possible_duplicates.length, duplicate_member_count: dedupe.duplicate_member_count, distinct_groups: dedupe.distinct_count } : null,
    generated_by: 'deterministic:ucdm/research/coverage',
  };
  cov.coverage_id = 'mcov_' + sha256Hex(canonicalize({ ...cov, coverage_id: undefined }));
  return deepFreeze(cov);
}

// The deterministic gate: may a claim of `scope` be asserted given this coverage?
// Returns { allowed, downgrade_to, reasons[] }. SAMPLE is always allowed; broader scope
// fails closed unless the coverage minimums are met.
function assessGlobalExtrapolation(coverage, scope) {
  const min = SCOPE_MIN[scope] || SCOPE_MIN.SAMPLE;
  const reasons = [];
  if (coverage.source_count < min.sources) reasons.push(`source_count ${coverage.source_count} < ${min.sources} required for ${scope}`);
  if (coverage.source_diversity < min.diversity) reasons.push(`source_diversity ${coverage.source_diversity} < ${min.diversity} required for ${scope}`);
  if (coverage.competitor_count < min.competitors) reasons.push(`competitor_count ${coverage.competitor_count} < ${min.competitors} required for ${scope}`);
  if (coverage.time_coverage && coverage.time_coverage.stale) reasons.push('newest evidence is stale (> 180 days)');
  const allowed = reasons.length === 0;
  return { scope, allowed, downgrade_to: allowed ? scope : 'SAMPLE', reasons };
}

module.exports = { computeCoverage, assessGlobalExtrapolation, SCOPE_MIN };
