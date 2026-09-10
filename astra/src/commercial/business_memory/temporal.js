'use strict';
// [ASTRA-11L §7] Temporal validity. Every memory has a temporal state. Expiration dates are
// NEVER invented — no staleness policy => STALENESS_UNKNOWN. No LLM, no implicit clock.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const TEMPORAL_STATUS = Object.freeze(['ACTIVE', 'STALE', 'EXPIRED', 'SUPERSEDED', 'INVALIDATED']);

// buildTemporal({ created_at, observed_at, valid_from, valid_until, last_confirmed_at,
//                 staleness_policy, referenceTime, superseded, invalidated, stalenessClass })
function buildTemporal(x) {
  const ref = x.referenceTime ? Date.parse(x.referenceTime) : NaN;
  const vu = x.valid_until ? Date.parse(x.valid_until) : NaN;
  const policy = x.staleness_policy || null;

  let status;
  if (x.invalidated) status = 'INVALIDATED';
  else if (x.superseded) status = 'SUPERSEDED';
  else if (Number.isFinite(vu) && Number.isFinite(ref) && ref > vu) status = 'EXPIRED';
  else if (x.stalenessClass === 'STALE') status = 'STALE';
  else status = 'ACTIVE';

  const age_days = (x.observed_at && Number.isFinite(ref) && Number.isFinite(Date.parse(x.observed_at)))
    ? Number(((ref - Date.parse(x.observed_at)) / 86400000).toFixed(2)) : null;

  const body = {
    schema_version: 'ucdm-business-memory-1.0.0', kind: 'MemoryTemporal',
    created_at: x.created_at || null,
    observed_at: x.observed_at || null,
    valid_from: x.valid_from || null,
    valid_until: x.valid_until || null,
    last_confirmed_at: x.last_confirmed_at || null,
    staleness_policy: policy,
    age_days,
    reference_time: x.referenceTime || null,
    status,
    staleness_class: policy ? (x.stalenessClass || 'UNKNOWN') : 'STALENESS_UNKNOWN',
    invented_expiry: false,
    note: !policy ? 'no staleness policy supplied — STALENESS_UNKNOWN; no expiry invented'
      : status === 'EXPIRED' ? 'reference time is past valid_until' : 'temporal state derived from supplied dates + policy only',
    generated_by: 'deterministic:ucdm/business_memory',
  };
  body.temporal_id = 'bmt_' + sha256Hex(canonicalize({ ...body, temporal_id: undefined }));
  return deepFreeze(body);
}

function validateTemporal(t) {
  const errors = [];
  if (!TEMPORAL_STATUS.includes(t.status)) errors.push(`bad temporal status "${t.status}"`);
  if (!t.staleness_policy && t.staleness_class !== 'STALENESS_UNKNOWN') errors.push('no staleness policy must yield STALENESS_UNKNOWN');
  if (t.invented_expiry !== false) errors.push('no expiry date may be invented');
  if (t.status === 'EXPIRED' && !t.valid_until) errors.push('EXPIRED requires an explicit valid_until');
  return { valid: errors.length === 0, errors };
}

module.exports = { TEMPORAL_STATUS, buildTemporal, validateTemporal };
