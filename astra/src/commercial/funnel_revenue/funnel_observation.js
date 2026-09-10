'use strict';
// [ASTRA-11J §B] Canonical FunnelObservation. Counts are OBSERVED / USER_PROVIDED / COMPUTED
// from valid canonical inputs — never invented. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { SOURCE_CLASSES } = require('../provenance/provenance');
const { normalizePeriod } = require('./time_window');
const { normalizeChannel } = require('./channel');
const { basisOf } = require('./cohort');

const COUNT_STATUS = Object.freeze(['OBSERVED', 'USER_PROVIDED', 'COMPUTED', 'UNKNOWN']);

function makeFunnelObservation(x) {
  const status = COUNT_STATUS.includes(x.status) ? x.status : (x.count == null ? 'UNKNOWN' : (x.source_class === 'COMPUTED' ? 'COMPUTED' : 'USER_PROVIDED'));
  const period = normalizePeriod(x.period);
  const body = {
    schema_version: 'ucdm-funnel-revenue-1.0.0', kind: 'FunnelObservation',
    stage: String(x.stage),
    stage_key: x.stage_key ? String(x.stage_key) : String(x.stage),
    count: x.count == null || Number.isNaN(Number(x.count)) ? null : Number(x.count),
    status,
    source_class: SOURCE_CLASSES.includes(x.source_class) ? x.source_class : (status === 'COMPUTED' ? 'COMPUTED' : 'USER_PROVIDED'),
    entity_ref: x.entity_ref == null ? null : String(x.entity_ref),
    account_ref: x.account_ref == null ? null : String(x.account_ref),
    campaign_ref: x.campaign_ref == null ? null : String(x.campaign_ref),
    source_ref: x.source_ref == null ? null : String(x.source_ref),
    period, timezone: period.tz,
    cohort: x.cohort == null ? null : String(x.cohort),
    cohort_basis: basisOf(x),
    channel: normalizeChannel(x.channel),
    channel_raw: x.channel == null ? null : String(x.channel),
    segment: x.segment == null ? null : String(x.segment),
    offer: x.offer == null ? null : String(x.offer),
    geography: x.geography == null ? null : String(x.geography),
    currency: x.currency == null ? null : String(x.currency),
    evidence_refs: [...new Set((x.evidence_refs || []).map(String))].sort(),
    note: x.note == null ? null : String(x.note),
    generated_by: 'deterministic:ucdm/funnel_revenue',
  };
  body.observation_id = 'fo_' + sha256Hex(canonicalize({ ...body, observation_id: undefined }));
  return deepFreeze(body);
}

function validateFunnelObservation(o) {
  const errors = [];
  if (!COUNT_STATUS.includes(o.status)) errors.push(`bad count status "${o.status}"`);
  if (o.status !== 'UNKNOWN' && o.count == null) errors.push('a non-UNKNOWN observation needs a count');
  if (o.count != null && o.count < 0) errors.push('a funnel count cannot be negative');
  if (['OBSERVED', 'USER_PROVIDED'].includes(o.status) && o.source_class === 'INFERRED') errors.push('an INFERRED count can never be OBSERVED/USER_PROVIDED');
  return { valid: errors.length === 0, errors };
}

// dedupe identical observations (same stage_key + period + all filter fields + count)
function dedupeObservations(list) {
  const seen = new Map();
  const kept = []; const duplicates = [];
  for (const o of list) {
    const k = canonicalize({ s: o.stage_key, p: [o.period.start, o.period.end], co: o.cohort, ch: o.channel, se: o.segment, of: o.offer, ge: o.geography, cu: o.currency, c: o.count });
    if (seen.has(k)) { duplicates.push(o.observation_id); continue; }
    seen.set(k, true); kept.push(o);
  }
  return { kept, duplicate_ids: duplicates };
}

module.exports = { COUNT_STATUS, makeFunnelObservation, validateFunnelObservation, dedupeObservations };
