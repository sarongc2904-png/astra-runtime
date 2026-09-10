'use strict';
// [ASTRA-11C] Deterministic DEDUPLICATION (spec section G).
// NO semantic / LLM dedup. Classification uses source identity, external id, and the two
// content hashes produced by normalized_observation.js.
// POSSIBLE_DUPLICATE is NEVER silently merged.
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex } = require('../validation/canonical');

const DEDUP_RESULT = Object.freeze(['EXACT_DUPLICATE', 'SOURCE_DUPLICATE', 'CONTENT_DUPLICATE', 'POSSIBLE_DUPLICATE', 'DISTINCT']);

// Each item: { key, raw_source_hash, provider, external_id, canonical_content_hash, normalized_content_hash }
function classifyPair(a, b) {
  if (a.raw_source_hash && b.raw_source_hash && a.raw_source_hash === b.raw_source_hash) {
    return { result: 'EXACT_DUPLICATE', reason: 'identical raw_source_hash' };
  }
  if (a.provider && b.provider && a.provider === b.provider && a.external_id != null && a.external_id === b.external_id) {
    return { result: 'SOURCE_DUPLICATE', reason: 'same (provider, external_id)' };
  }
  if (a.canonical_content_hash && a.canonical_content_hash === b.canonical_content_hash) {
    return { result: 'CONTENT_DUPLICATE', reason: 'identical canonical (verbatim) content hash' };
  }
  if (a.normalized_content_hash && a.normalized_content_hash === b.normalized_content_hash) {
    return { result: 'POSSIBLE_DUPLICATE', reason: 'identical normalized content hash but different verbatim/source — held, not merged' };
  }
  return { result: 'DISTINCT', reason: 'no deterministic identity or content match' };
}

// dedupeBatch(items) -> { groups, pairs, possible_duplicates, distinct_count }
// Deterministic: items processed in input order; a group is keyed by the strongest match
// found against an existing representative. POSSIBLE_DUPLICATE items get their own group AND
// a cross-reference — never folded into another group.
function dedupeBatch(items) {
  const groups = [];      // { representative_key, member_keys, match }
  const possible = [];    // { key, matches: [{other_key, reason}] }
  const pairs = [];

  for (const item of items) {
    let placed = false;
    for (const g of groups) {
      const rep = g._rep;
      const c = classifyPair(rep, item);
      pairs.push({ a: rep.key, b: item.key, ...c });
      if (['EXACT_DUPLICATE', 'SOURCE_DUPLICATE', 'CONTENT_DUPLICATE'].includes(c.result)) {
        g.member_keys.push(item.key);
        g.matches.push({ key: item.key, ...c });
        placed = true;
        break;
      }
      if (c.result === 'POSSIBLE_DUPLICATE') {
        possible.push({ key: item.key, against: rep.key, reason: c.reason });
        // do NOT place; continues so it can still form its own group
      }
    }
    if (!placed) {
      groups.push({ representative_key: item.key, member_keys: [item.key], matches: [], _rep: item });
    }
  }
  for (const g of groups) delete g._rep;

  return {
    groups,
    pairs,
    possible_duplicates: possible,
    distinct_count: groups.length,
    duplicate_member_count: items.length - groups.length,
    batch_dedupe_hash: 'dd_' + sha256Hex(canonicalize({ groups, possible })),
  };
}

module.exports = { DEDUP_RESULT, classifyPair, dedupeBatch };
