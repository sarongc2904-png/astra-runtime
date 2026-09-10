'use strict';
// [ASTRA-11B] Deterministic canonicalization + content hashing for the Unified Commercial
// Data Model. Independent, additive module — it deliberately re-implements (does NOT import)
// the canonicalization pattern proven in the frozen classifier_decision_cache.js so that
// nothing frozen is touched. Pure Node built-ins. No secrets, no I/O, no network, no LLM.
const crypto = require('crypto');

// NFC + CRLF/CR -> LF. Same normalization the frozen decision cache uses for text keys.
function nfcLF(s) {
  return String(s == null ? '' : s).normalize('NFC').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(Buffer.from(String(s), 'utf8')).digest('hex');
}

// Deterministic JSON: object keys lexicographically sorted, arrays preserve order, no
// insignificant whitespace. `undefined` object properties are dropped; `undefined` array
// elements become null (JSON semantics). Numbers must be finite (NaN/Infinity rejected —
// a NaN in a canonical body is always a defect).
function canonicalize(v) {
  if (v === null) return 'null';
  const t = typeof v;
  if (t === 'number') {
    if (!Number.isFinite(v)) throw new Error(`canonicalize: non-finite number (${v})`);
    return JSON.stringify(v);
  }
  if (t === 'string' || t === 'boolean') return JSON.stringify(v);
  if (t === 'undefined') return 'null';
  if (Array.isArray(v)) return '[' + v.map(canonicalize).join(',') + ']';
  if (t === 'object') {
    const keys = Object.keys(v).filter(k => v[k] !== undefined).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(v[k])).join(',') + '}';
  }
  throw new Error(`canonicalize: unsupported type ${t}`);
}

// Content hash over an arbitrary body (already stripped of volatile/meta fields by caller).
function contentHash(body) {
  return sha256Hex(canonicalize(body));
}

// Stable entity identity: hash of the entity type + its declared natural-key fields.
// Natural-key string values are nfcLF-normalized so trivial text variation does not fork identity.
function entityId(entityType, naturalKey) {
  const nk = {};
  for (const k of Object.keys(naturalKey).sort()) {
    const val = naturalKey[k];
    nk[k] = typeof val === 'string' ? nfcLF(val) : val;
  }
  return 'ent_' + sha256Hex(canonicalize({ entity_type: String(entityType), natural_key: nk })).slice(0, 40);
}

// Immutable version identity: bound to the entity, the exact content, when it takes effect,
// and what it supersedes — so the same logical change at a different effective_at, or a
// different lineage, yields a different version id.
function versionId({ entity_id, content_hash, effective_at, supersedes }) {
  return 'ver_' + sha256Hex(canonicalize({
    entity_id: String(entity_id),
    content_hash: String(content_hash),
    effective_at: String(effective_at),
    supersedes: supersedes == null ? null : String(supersedes),
  })).slice(0, 40);
}

// Deep-freeze helper for immutable analytical snapshots.
function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  }
  return obj;
}

module.exports = { nfcLF, sha256Hex, canonicalize, contentHash, entityId, versionId, deepFreeze };
