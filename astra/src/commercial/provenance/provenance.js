'use strict';
// [ASTRA-11B] Provenance model for the Unified Commercial Data Model.
// Every material fact in the UCDM is a ProvenanceValue: a value plus a full, non-lossy
// trace of where it came from. Pure data + pure validators. No I/O, no LLM, no network.
const { sha256Hex, canonicalize, nfcLF } = require('../validation/canonical');

// The four required source classes (ASTRA-11B section B). Deliberately minimal — no
// redundant categories. A DERIVED-from-DERIVED value is still COMPUTED (deterministic) or
// INFERRED (model reasoning); the distinction is *how* it was produced, not how many hops.
const SOURCE_CLASSES = Object.freeze(['OBSERVED', 'COMPUTED', 'INFERRED', 'USER_PROVIDED']);

// Source classes whose numeric values MAY become canonical commercial metrics (section C).
const CANONICAL_NUMERIC_CLASSES = Object.freeze(['OBSERVED', 'COMPUTED', 'USER_PROVIDED']);

// Producers that count as "deterministic" for a COMPUTED value. A COMPUTED ProvenanceValue
// MUST name a producer matching this prefix, so an LLM node can never label its output COMPUTED.
const DETERMINISTIC_PRODUCER_PREFIX = 'deterministic:';

// Explicit "we do not know" sentinel. Representable everywhere an optional field is allowed;
// never invented to fill a gap (section G).
const UNKNOWN = Object.freeze({ __ucdm_unknown: true });
function isUnknown(v) { return v === UNKNOWN || (v && typeof v === 'object' && v.__ucdm_unknown === true); }

// A Source is the origin artifact (a review export, an interview transcript, an analytics
// export, a user statement). Sources are provider-neutral: `system` is a free label, never
// a coupled type.
function makeSource({ source_id, source_type, system = null, uri_or_label = null, source_timestamp = null, ingested_at, observation_period = null, content }) {
  if (!source_id) throw new Error('makeSource: source_id required');
  if (!source_type) throw new Error('makeSource: source_type required');
  if (!ingested_at) throw new Error('makeSource: ingested_at required');
  const text = content == null ? '' : String(content);
  return Object.freeze({
    kind: 'Source',
    source_id: String(source_id),
    source_type: String(source_type),
    system: system == null ? null : String(system),
    uri_or_label: uri_or_label == null ? null : String(uri_or_label),
    source_timestamp: source_timestamp == null ? null : String(source_timestamp),
    ingested_at: String(ingested_at),
    observation_period: observation_period, // {start,end} | null
    content_hash: sha256Hex(nfcLF(text)),
  });
}

// An EvidenceReference points from a fact to the Source (and optional locator within it)
// that supports it. Deterministic: it is just ids + a locator, resolved by the EvidenceGraph.
function makeEvidenceReference({ ref_id, source_id, locator = null, quote = null, evidence_id = null }) {
  if (!ref_id) throw new Error('makeEvidenceReference: ref_id required');
  if (!source_id) throw new Error('makeEvidenceReference: source_id required');
  return Object.freeze({
    kind: 'EvidenceReference',
    ref_id: String(ref_id),
    source_id: String(source_id),
    evidence_id: evidence_id == null ? null : String(evidence_id),
    locator: locator == null ? null : String(locator), // e.g. "row:42", "chunk:abc", "ts:00:14:20"
    quote: quote == null ? null : String(quote),
  });
}

// The ProvenanceValue itself. `transform` names the code/prompt version that produced a
// COMPUTED/INFERRED value; `content_hash` addresses the value+trace so it is tamper-evident.
function pv(value, source_class, opts = {}) {
  if (!SOURCE_CLASSES.includes(source_class)) {
    throw new Error(`pv: unsupported provenance class "${source_class}" (allowed: ${SOURCE_CLASSES.join(', ')})`);
  }
  const body = {
    value,
    source_class,
    evidence_refs: (opts.evidence_refs || []).map(String),
    produced_by: opts.produced_by == null ? null : String(opts.produced_by),
    transform: opts.transform == null ? null : String(opts.transform),
    as_of: opts.as_of == null ? null : String(opts.as_of),
    observed_period: opts.observed_period == null ? null : opts.observed_period,
    ingested_at: opts.ingested_at == null ? null : String(opts.ingested_at),
    confidence: opts.confidence == null ? null : opts.confidence, // a ConfidenceAssessment ref/object or null
    freshness_days: opts.freshness_days == null ? null : Number(opts.freshness_days),
  };
  body.content_hash = sha256Hex(canonicalize({ ...body, content_hash: undefined }));
  return Object.freeze(body);
}

function isProvenanceValue(v) {
  return !!v && typeof v === 'object' && SOURCE_CLASSES.includes(v.source_class) && Array.isArray(v.evidence_refs) && typeof v.content_hash === 'string';
}

// Structural validation of a ProvenanceValue. Returns { valid, errors[] }. Does NOT resolve
// evidence refs (that is the EvidenceGraph's job) — this only checks the shape + rules that
// are local to the value.
function validateProvenanceValue(x, { requireEvidenceForObserved = true } = {}) {
  const errors = [];
  if (!isProvenanceValue(x)) return { valid: false, errors: ['not a ProvenanceValue'] };
  if (!SOURCE_CLASSES.includes(x.source_class)) errors.push('bad source_class:' + x.source_class);
  if (x.source_class === 'COMPUTED') {
    if (!x.produced_by || !x.produced_by.startsWith(DETERMINISTIC_PRODUCER_PREFIX)) {
      errors.push('COMPUTED value must name a deterministic producer ("' + DETERMINISTIC_PRODUCER_PREFIX + '<module>")');
    }
  }
  if (x.source_class === 'OBSERVED' && requireEvidenceForObserved && x.evidence_refs.length === 0) {
    errors.push('OBSERVED value must carry at least one evidence_ref');
  }
  const recomputed = sha256Hex(canonicalize({ ...x, content_hash: undefined }));
  if (recomputed !== x.content_hash) errors.push('content_hash mismatch (tampered or malformed ProvenanceValue)');
  return { valid: errors.length === 0, errors };
}

module.exports = {
  SOURCE_CLASSES, CANONICAL_NUMERIC_CLASSES, DETERMINISTIC_PRODUCER_PREFIX, UNKNOWN,
  isUnknown, makeSource, makeEvidenceReference, pv, isProvenanceValue, validateProvenanceValue,
};
