'use strict';
// [ASTRA-11L §8] Staleness engine. Uses ONLY explicit inputs (age, business cadence, declared
// market volatility, experiment recency, offer / campaign / funnel version changes). No false
// probabilities. Insufficient inputs => UNKNOWN. No LLM, no implicit clock.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const STALENESS_CLASS = Object.freeze(['CURRENT', 'POTENTIALLY_STALE', 'STALE', 'UNKNOWN']);

// assessStaleness({ age_days, business_cadence, market_volatility, experiment_recency_days,
//                   offer_version, offer_version_at_memory, campaign_version, campaign_version_at_memory,
//                   funnel_version, funnel_version_at_memory, staleness_policy })
function assessStaleness(x) {
  const policy = x.staleness_policy || null;
  const reasons = [];

  // (1) version drift — a definitive stale signal, regardless of age
  const drift = [];
  for (const [name, cur, at] of [
    ['offer', x.offer_version, x.offer_version_at_memory],
    ['campaign', x.campaign_version, x.campaign_version_at_memory],
    ['funnel', x.funnel_version, x.funnel_version_at_memory],
  ]) {
    if (cur != null && at != null && String(cur) !== String(at)) drift.push(name);
  }
  if (drift.length) reasons.push('VERSION_CHANGED:' + drift.join(','));

  // (2) age vs policy / cadence
  const age = num(x.age_days);
  let ageStale = null;
  if (age != null && policy && policy.max_age_days != null) {
    if (age > Number(policy.max_age_days)) { ageStale = 'STALE'; reasons.push('AGE_EXCEEDS_MAX'); }
    else if (age > Number(policy.max_age_days) * 0.66) { ageStale = 'POTENTIALLY_STALE'; reasons.push('AGE_APPROACHING_MAX'); }
    else ageStale = 'CURRENT';
  } else if (age != null && x.business_cadence) {
    const cadenceDays = ({ DAILY: 1, WEEKLY: 7, BIWEEKLY: 14, MONTHLY: 30, QUARTERLY: 90 })[String(x.business_cadence).toUpperCase()] || null;
    if (cadenceDays != null) { ageStale = age > cadenceDays * 3 ? 'STALE' : age > cadenceDays ? 'POTENTIALLY_STALE' : 'CURRENT'; if (ageStale !== 'CURRENT') reasons.push('AGE_VS_CADENCE'); }
  }

  // (3) declared market volatility raises the concern
  const volatility = x.market_volatility ? String(x.market_volatility).toUpperCase() : null;
  if (volatility === 'HIGH' && (ageStale === 'CURRENT' || ageStale == null) && age != null && age > 30) { reasons.push('HIGH_DECLARED_VOLATILITY'); }

  // resolve
  let cls;
  if (drift.length) cls = 'STALE';
  else if (ageStale === 'STALE') cls = 'STALE';
  else if (ageStale === 'POTENTIALLY_STALE' || (volatility === 'HIGH' && age != null && age > 30)) cls = 'POTENTIALLY_STALE';
  else if (ageStale === 'CURRENT') cls = 'CURRENT';
  else cls = 'UNKNOWN';

  const body = {
    schema_version: 'ucdm-business-memory-1.0.0', kind: 'StalenessAssessment',
    staleness_class: cls,
    reasons: [...new Set(reasons)].sort(),
    inputs_used: [
      age != null && 'age_days', policy && 'staleness_policy', x.business_cadence && 'business_cadence',
      volatility && 'market_volatility', x.experiment_recency_days != null && 'experiment_recency_days',
      drift.length && 'version_change',
    ].filter(Boolean).sort(),
    version_drift: drift.sort(),
    probabilistic: false,
    note: cls === 'UNKNOWN' ? 'insufficient explicit inputs to judge staleness' : cls === 'STALE' && drift.length ? 'a versioned dependency changed since this memory was formed' : 'staleness derived from explicit inputs only',
    generated_by: 'deterministic:ucdm/business_memory',
  };
  body.staleness_id = 'bms_' + sha256Hex(canonicalize({ ...body, staleness_id: undefined }));
  return deepFreeze(body);
}
function num(v) { return v == null || Number.isNaN(Number(v)) ? null : Number(v); }

function validateStaleness(s) {
  const errors = [];
  if (!STALENESS_CLASS.includes(s.staleness_class)) errors.push(`bad staleness_class "${s.staleness_class}"`);
  if (s.probabilistic !== false) errors.push('staleness must not be probabilistic');
  if (s.staleness_class !== 'UNKNOWN' && s.inputs_used.length === 0) errors.push('a non-UNKNOWN staleness needs at least one explicit input');
  return { valid: errors.length === 0, errors };
}

module.exports = { STALENESS_CLASS, assessStaleness, validateStaleness };
