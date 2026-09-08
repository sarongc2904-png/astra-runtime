// ═══════════════════════════════════════════════════════════════════════
//  classifier_decision_cache.js — content-addressed persistent decision cache
//  Target: OPERATIONAL determinism ONLY (NOT cold-start / model determinism).
//
//  Same exact versioned (query + evidence) -> same decision_key -> same persisted
//  classifier result -> replay from disk with ZERO classifier LLM calls.
//
//  Store: one immutable JSON record per decision_key under a local cache dir
//  (durable across process restart). Singular-winner first materialization via
//  atomic exclusive create (writeFileSync flag 'wx'): on a race, exactly one
//  writer creates the record; losers get EEXIST and reread the canonical winner.
//  Read path is fail-closed: a malformed / incomplete / integrity-mismatched
//  record is treated as absent (re-materialize) — never served.
//
//  Pure Node built-ins (crypto/fs/path). No external deps. Not benchmark-specific.
//  Never stores secrets/API keys.
// ═══════════════════════════════════════════════════════════════════════
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ── canonicalization helpers ──
function nfcLF(s) {
  return String(s == null ? '' : s).normalize('NFC').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}
function sha256Hex(s) {
  return crypto.createHash('sha256').update(Buffer.from(String(s), 'utf8')).digest('hex');
}
// Deterministic JSON: lexicographically sorted object keys, no insignificant
// whitespace, arrays preserve order. Strings serialized via JSON.stringify.
function canonicalize(v) {
  if (Array.isArray(v)) return '[' + v.map(canonicalize).join(',') + ']';
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(v[k])).join(',') + '}';
  }
  return JSON.stringify(v); // strings/numbers/bool/null
}

// ── evidence hash: SHA256 of the exact classifier-input evidence string ──
// (NFC + CRLF->LF). Excludes advisory cosine / timestamps / transient metadata
// by construction — only the string the classifier actually consumes is hashed.
function evidenceHash(evidenceText) {
  return sha256Hex(nfcLF(evidenceText));
}

// ── decision key: SHA256 over canonical JSON of the material components ──
// No floats, no timestamps, no request ids, no benchmark ids/labels.
function decisionKey(parts) {
  const key = {
    classifier_version: String(parts.classifier_version),
    prompt_version: String(parts.prompt_version),
    model: String(parts.model),
    model_config_version: String(parts.model_config_version),
    schema_version: String(parts.schema_version),
    query: nfcLF(parts.query),
    evidence_hash: String(parts.evidence_hash),
  };
  return sha256Hex(canonicalize(key));
}

function cacheDir() {
  return process.env.CLASSIFIER_CACHE_DIR || path.join(__dirname, '.cache', 'classifier_decisions');
}
function recordPath(dir, key) {
  return path.join(dir, key + '.json');
}

// Integrity hash over the material record fields (excludes the integrity field
// itself), so a partial/corrupt/tampered write is detected on read.
function integrityHash(rec) {
  return sha256Hex(canonicalize({
    decision_key: rec.decision_key,
    query_hash: rec.query_hash,
    evidence_hash: rec.evidence_hash,
    classifier_version: rec.classifier_version,
    prompt_version: rec.prompt_version,
    model: rec.model,
    model_config_version: rec.model_config_version,
    schema_version: rec.schema_version,
    label: rec.label,
    structured_classifier_result: rec.structured_classifier_result,
    created_at: rec.created_at,
    provenance: rec.provenance,
  }));
}

const REQUIRED_FIELDS = ['decision_key', 'query_hash', 'evidence_hash', 'classifier_version',
  'prompt_version', 'model', 'model_config_version', 'schema_version', 'label',
  'structured_classifier_result', 'created_at', 'record_integrity_sha256'];

// Fail-closed read. Returns the validated record, {__corrupt:true}, or null (absent).
function get(key) {
  const p = recordPath(cacheDir(), key);
  let raw;
  try {
    if (!fs.existsSync(p)) return null;
    raw = fs.readFileSync(p, 'utf8');
  } catch (e) { return null; }
  let rec;
  try { rec = JSON.parse(raw); } catch (e) { return { __corrupt: true, reason: 'malformed_json' }; }
  if (!rec || typeof rec !== 'object') return { __corrupt: true, reason: 'not_object' };
  for (const f of REQUIRED_FIELDS) if (!(f in rec)) return { __corrupt: true, reason: 'missing_field:' + f };
  if (rec.decision_key !== key) return { __corrupt: true, reason: 'key_mismatch' };
  const sr = rec.structured_classifier_result;
  if (!sr || typeof sr !== 'object' || typeof sr.decision !== 'string') return { __corrupt: true, reason: 'bad_structured_result' };
  if (integrityHash(rec) !== rec.record_integrity_sha256) return { __corrupt: true, reason: 'integrity_mismatch' };
  return rec;
}

// Atomic singular-winner create. Never overwrites an existing record.
// Returns {written:true} if this call materialized the record, {written:false,exists:true}
// if another writer won the race. Throws on real IO failure (caller decides bypass).
function putIfAbsent(key, record) {
  const dir = cacheDir();
  fs.mkdirSync(dir, { recursive: true });
  const rec = Object.assign({}, record);
  rec.record_integrity_sha256 = integrityHash(rec);
  const data = JSON.stringify(rec);
  const p = recordPath(dir, key);
  try {
    fs.writeFileSync(p, data, { encoding: 'utf8', flag: 'wx' }); // exclusive create
    return { written: true };
  } catch (e) {
    if (e && e.code === 'EEXIST') return { written: false, exists: true };
    throw e;
  }
}

module.exports = { nfcLF, sha256Hex, canonicalize, evidenceHash, decisionKey, cacheDir, recordPath, integrityHash, get, putIfAbsent };
