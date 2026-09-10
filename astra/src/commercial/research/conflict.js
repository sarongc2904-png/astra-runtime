'use strict';
// [ASTRA-11D] Deterministic conflict detection (spec section F).
// Conflicts between facts of the same type about the same subject with incompatible values.
// Surfaced, NEVER auto-resolved. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');

const CONFLICT_KINDS = Object.freeze(['VALUE_CONFLICT', 'CATEGORICAL_CONFLICT', 'PRESENCE_CONFLICT']);

// numeric relative tolerance for "same price": 2%.
const NUM_TOLERANCE = 0.02;

// Fact types where two different values about the SAME subject are genuinely contradictory
// (a listed price should be one number). RATING / REVIEW_COUNT / REVIEW_* are distributional
// — natural variation across customers is not a conflict.
const CONFLICT_ELIGIBLE_TYPES = new Set(['COMPETITOR_PRICE', 'OBSERVED_GUARANTEE', 'OBSERVED_CTA', 'OFFER_COMPONENT', 'LOCATION_SERVED', 'PRODUCT_CATEGORY', 'ADVERTISED_PROMISE', 'PUBLISHED_CLAIM']);

function numOf(v) {
  if (v == null || typeof v !== 'object') return null;
  if (typeof v.amount === 'number') return v.amount;
  if (typeof v.score === 'number') return v.score;
  if (typeof v.count === 'number') return v.count;
  return null;
}
function catOf(v) {
  if (v == null || typeof v !== 'object') return null;
  for (const k of ['text', 'cta', 'guarantee', 'component', 'location', 'category']) if (typeof v[k] === 'string') return v[k].trim().toLowerCase();
  return null;
}

// detectConflicts(facts) -> { conflicts[], conflicted_fact_ids:Set-as-array }
function detectConflicts(facts) {
  const groups = new Map(); // `${fact_type}::${subject_ref}` -> facts[]
  for (const f of facts) {
    if (!CONFLICT_ELIGIBLE_TYPES.has(f.fact_type)) continue; // distributional facts are not conflicts
    const key = `${f.fact_type}::${f.subject_ref}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const conflicts = [];
  const conflicted = new Set();

  for (const [key, group] of [...groups.entries()].sort()) {
    if (group.length < 2) continue;
    // pairwise, deterministic order by fact_id
    const sorted = [...group].sort((a, b) => (a.fact_id < b.fact_id ? -1 : 1));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i], b = sorted[j];
        const na = numOf(a.value), nb = numOf(b.value);
        let kind = null, detail = null;
        if (na != null && nb != null) {
          const denom = Math.max(Math.abs(na), Math.abs(nb), 1e-9);
          if (Math.abs(na - nb) / denom > NUM_TOLERANCE) { kind = 'VALUE_CONFLICT'; detail = { a: na, b: nb, relative_diff: Number((Math.abs(na - nb) / denom).toFixed(6)) }; }
        } else {
          const ca = catOf(a.value), cb = catOf(b.value);
          if (ca != null && cb != null && ca !== cb) { kind = 'CATEGORICAL_CONFLICT'; detail = { a: ca, b: cb }; }
        }
        if (kind) {
          const [fk, sr] = key.split('::');
          const c = {
            schema_version: 'ucdm-research-1.0.0',
            kind, fact_type: fk, subject_ref: sr,
            fact_refs: [a.fact_id, b.fact_id].sort(),
            source_refs: [a.source_ref, b.source_ref].filter(Boolean).sort(),
            detail,
            status: 'OPEN', // NEVER auto-resolved
            resolution: null,
          };
          c.conflict_id = 'mcf_' + sha256Hex(canonicalize({ ...c, conflict_id: undefined }));
          conflicts.push(deepFreeze(c));
          conflicted.add(a.fact_id); conflicted.add(b.fact_id);
        }
      }
    }
  }
  return { conflicts, conflicted_fact_ids: [...conflicted].sort() };
}

module.exports = { CONFLICT_KINDS, detectConflicts, NUM_TOLERANCE, CONFLICT_ELIGIBLE_TYPES };
