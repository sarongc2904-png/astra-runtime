'use strict';
// [ASTRA-11C] Canonical NORMALIZED OBSERVATION (spec section D + I).
// Represents heterogeneous evidence WITHOUT forcing it into Persona / Journey / Market /
// Competitor / Insight. ASTRA-11C owns SOURCE CONTENT + OBSERVATION only. A CLAIM-type
// observation records that *the source asserted* something — it is NOT an ASTRA Insight.
// Provider-neutral: fails closed if a provider payload leaked past the adapter boundary.
// No LLM, no web, no I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { pv, SOURCE_CLASSES, isUnknown, UNKNOWN } = require('../provenance/provenance');
const { assertProviderNeutral } = require('../ingestion/provider_neutrality');
const { normalizeLanguage, normalizeLocale } = require('./normalize');
const { INGEST_SCHEMA_VERSION } = require('../ingestion/raw_source');

// Minimal, extensible taxonomy.
const OBSERVATION_TYPES = Object.freeze([
  'TEXT',              // free text captured from the source
  'QUOTE',             // an exact verbatim quote (carries a verbatim block)
  'CLAIM',             // the source ASSERTS something (verbatim preserved); NOT an ASTRA insight
  'METRIC',            // a numeric observation (carries a NumericObservation)
  'EVENT',             // something happened at a time
  'TRANSACTION',       // a monetary/commercial event
  'INTERACTION',       // a contact between a person and the business
  'RATING',            // a bounded score (stars, NPS-like)
  'ATTRIBUTE',         // a key/value fact about a subject
  'DOCUMENT_FRAGMENT', // a chunk of a larger document
]);

// makeNormalizedObservation(input)
//   observation_type   (required, in OBSERVATION_TYPES)
//   subject            (a subjectRef from subject_resolution.js, or UNKNOWN)
//   content            (text/normalized_text) OR verbatim (a verbatim block) OR numeric (a NumericObservation)
//   structured_values  (provider-neutral key/values; scanned for leaks)
//   source_ref         (required — envelope source_id / an EvidenceReference id)
//   temporal           (a temporal block) | null
//   language, locale
//   provenance_class   (OBSERVED | USER_PROVIDED | COMPUTED | INFERRED)
//   evidence_refs      (ids; required when provenance_class === OBSERVED)
//   quality            (a source_quality block) | null
function makeNormalizedObservation(input) {
  const errors = [];
  const type = input && input.observation_type;
  if (!OBSERVATION_TYPES.includes(type)) errors.push(`observation_type "${type}" not in ${OBSERVATION_TYPES.join('/')}`);
  if (!input || (input.source_ref == null || input.source_ref === '')) errors.push('source_ref is required (no orphan observations)');
  const pc = input && input.provenance_class;
  if (!SOURCE_CLASSES.includes(pc)) errors.push(`provenance_class "${pc}" invalid`);
  if (pc === 'OBSERVED' && (!Array.isArray(input.evidence_refs) || input.evidence_refs.length === 0)) errors.push('OBSERVED observation must carry >= 1 evidence_ref');
  if ((type === 'QUOTE' || type === 'CLAIM') && !input.verbatim) errors.push(`${type} observation must carry a verbatim block`);
  if (type === 'METRIC' && !input.numeric) errors.push('METRIC observation must carry a NumericObservation');
  if (errors.length) throw new Error(`[ASTRA-11C] invalid NormalizedObservation: ${errors.join(' | ')}`);

  // Provider-neutrality boundary (spec §B, §N): scan everything that will be stored.
  assertProviderNeutral({
    observation_type: type,
    content: input.content || null,
    verbatim: input.verbatim || null,
    numeric: input.numeric || null,
    structured_values: input.structured_values || null,
    subject: (input.subject && !isUnknown(input.subject)) ? input.subject : null,
  });

  const body = {
    schema_version: INGEST_SCHEMA_VERSION,
    observation_type: type,
    subject: input.subject != null ? input.subject : UNKNOWN,
    content: input.content != null ? {
      text: input.content.text != null ? String(input.content.text) : null,
      normalized_text: input.content.normalized_text != null ? String(input.content.normalized_text) : null,
    } : null,
    verbatim: input.verbatim || null,
    numeric: input.numeric || null,
    structured_values: input.structured_values != null ? input.structured_values : {},
    source_ref: String(input.source_ref),
    temporal: input.temporal || null,
    language: input.language != null ? normalizeLanguage(input.language) : (input.verbatim ? input.verbatim.language : null),
    locale: input.locale != null ? normalizeLocale(input.locale) : null,
    provenance: pv(
      input.provenance_value_summary != null ? input.provenance_value_summary : `${type} observation from ${input.source_ref}`,
      pc,
      { evidence_refs: input.evidence_refs || [], as_of: (input.temporal && (input.temporal.event_time || input.temporal.publication_time)) || null, produced_by: input.produced_by || null, transform: input.transform || null }
    ),
    quality: input.quality || null,
  };
  body.content_hash = 'obs_' + sha256Hex(canonicalize({ ...body, content_hash: undefined }));
  // A separate hash over ONLY the semantic content (for dedup) — excludes provenance/quality/temporal.
  body.canonical_content_hash = 'occ_' + sha256Hex(canonicalize({
    observation_type: type,
    verbatim_text: input.verbatim ? input.verbatim.verbatim_text : null,
    text: body.content ? body.content.text : null,
    numeric: body.numeric ? { value: body.numeric.value, unit: body.numeric.unit, currency: body.numeric.currency, aggregation: body.numeric.aggregation } : null,
    structured_values: body.structured_values,
  }));
  body.normalized_content_hash = 'onc_' + sha256Hex(canonicalize({
    observation_type: type,
    normalized_text: input.verbatim ? input.verbatim.normalized_text : (body.content ? body.content.normalized_text : null),
    numeric: body.numeric ? { value: body.numeric.value, unit: body.numeric.unit, currency: body.numeric.currency, aggregation: body.numeric.aggregation } : null,
  }));
  return deepFreeze(body);
}

module.exports = { OBSERVATION_TYPES, makeNormalizedObservation };
