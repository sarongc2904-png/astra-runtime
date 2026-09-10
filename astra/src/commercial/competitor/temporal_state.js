'use strict';
// [ASTRA-11E §C] Temporal competitor state. Snapshots per (competitor, domain) with
// effective_at / observed_at / supersedes / source_window / content_hash and a deterministic
// recency label. Old pricing/offers are NEVER silently treated as current. No LLM, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const RECENCY = Object.freeze(['CURRENT', 'HISTORICAL', 'UNKNOWN_CURRENT']);
const DOMAINS = Object.freeze(['pricing', 'offer', 'message', 'proof', 'funnel', 'creative']);
const FRESHNESS_DAYS = 180;

function ageDays(iso, referenceTime) {
  if (!iso || !referenceTime) return null;
  const d = (Date.parse(referenceTime) - Date.parse(iso)) / 86400000;
  return Number.isFinite(d) ? d : null;
}

// buildSnapshots({ competitor_ref, domain, dated_items, referenceTime })
//   dated_items: [{ observed_at, evidence_refs, source_ref, payload }]
// Returns [CompetitorSnapshot] newest-first; the newest within FRESHNESS_DAYS is CURRENT,
// older ones are HISTORICAL and carry `supersedes` = the newer snapshot's id. If nothing is
// within the freshness window (or nothing is dated), the newest is UNKNOWN_CURRENT.
function buildSnapshots({ competitor_ref, domain, dated_items = [], referenceTime = null }) {
  const items = dated_items.map(x => ({ ...x, _t: x.observed_at ? Date.parse(x.observed_at) : null }))
    .sort((a, b) => (b._t || -Infinity) - (a._t || -Infinity));
  if (!items.length) return [];

  const newestAge = ageDays(items[0].observed_at, referenceTime);
  const newestIsFresh = newestAge != null && newestAge <= FRESHNESS_DAYS;

  const snaps = [];
  let laterId = null;
  items.forEach((it, idx) => {
    const a = ageDays(it.observed_at, referenceTime);
    let recency;
    if (idx === 0) recency = (a == null) ? 'UNKNOWN_CURRENT' : (newestIsFresh ? 'CURRENT' : 'UNKNOWN_CURRENT');
    else recency = 'HISTORICAL';
    const body = {
      schema_version: 'ucdm-competitor-1.0.0',
      competitor_ref, domain,
      effective_at: it.observed_at || null,
      observed_at: it.observed_at || null,
      source_window: { start: items[items.length - 1].observed_at || null, end: items[0].observed_at || null },
      age_days: a,
      recency,
      supersedes: recency === 'HISTORICAL' ? laterId : null,
      evidence_refs: [...new Set(it.evidence_refs || [])].sort(),
      source_ref: it.source_ref || null,
      payload: it.payload != null ? it.payload : null,
    };
    body.content_hash = 'cmsnap_' + sha256Hex(canonicalize({ ...body, content_hash: undefined }));
    if (idx === 0) laterId = body.content_hash;
    snaps.push(deepFreeze(body));
  });
  return snaps;
}

// The single "state we should act on": the CURRENT snapshot if any, else null + UNKNOWN_CURRENT.
function currentState(snaps) {
  const cur = snaps.find(s => s.recency === 'CURRENT');
  return cur ? { state: 'CURRENT', snapshot: cur } : { state: 'UNKNOWN_CURRENT', snapshot: snaps[0] || null };
}

module.exports = { RECENCY, DOMAINS, FRESHNESS_DAYS, buildSnapshots, currentState };
