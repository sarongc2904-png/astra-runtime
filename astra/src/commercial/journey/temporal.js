'use strict';
// [ASTRA-11H §Y] Temporal discipline. NO implicit clock — referenceTime is caller-supplied.
// Historical and current journeys are never silently merged. No LLM, no I/O.
const TEMPORAL_STATUS = Object.freeze(['CURRENT', 'HISTORICAL', 'UNKNOWN_CURRENT']);

// Records older than this (vs referenceTime) are treated as HISTORICAL for journey purposes.
const HISTORICAL_AGE_DAYS = 365;

// classifyTemporal(timestamp, referenceTime, { explicit }) -> { status, age_days|null }
function classifyTemporal(timestamp, referenceTime, { explicit = null } = {}) {
  if (explicit && TEMPORAL_STATUS.includes(explicit)) return { status: explicit, age_days: null };
  if (!timestamp || !referenceTime) return { status: 'UNKNOWN_CURRENT', age_days: null };
  const t = Date.parse(timestamp), r = Date.parse(referenceTime);
  if (!Number.isFinite(t) || !Number.isFinite(r)) return { status: 'UNKNOWN_CURRENT', age_days: null };
  const age = Number(((r - t) / 86400000).toFixed(2));
  return { status: age > HISTORICAL_AGE_DAYS ? 'HISTORICAL' : 'CURRENT', age_days: age };
}

// splitByTemporal(observations) -> { current[], historical[], unknown[] } — NEVER merged.
function splitByTemporal(observations) {
  const out = { CURRENT: [], HISTORICAL: [], UNKNOWN_CURRENT: [] };
  for (const o of observations) (out[o.temporal_status] || out.UNKNOWN_CURRENT).push(o);
  return { current: out.CURRENT, historical: out.HISTORICAL, unknown: out.UNKNOWN_CURRENT };
}

module.exports = { TEMPORAL_STATUS, HISTORICAL_AGE_DAYS, classifyTemporal, splitByTemporal };
