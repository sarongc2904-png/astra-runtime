'use strict';
// [ASTRA-11C] Provider-neutral RAW SOURCE ENVELOPE (spec §A).
// The envelope is the ONLY place a raw provider payload legally exists. Provider identity
// lives in `provider` / `external_id` / `metadata` — never in the canonical source category.
// Everything downstream of the adapter boundary must be provider-neutral.
// Reuses ASTRA-11B canonical hashing. No LLM, no web, no I/O.
const { canonicalize, sha256Hex, nfcLF, deepFreeze } = require('../validation/canonical');

const INGEST_SCHEMA_VERSION = 'ucdm-ingest-1.0.0';

// Canonical, vendor-free source categories. A vendor name (META_AD, WHATSAPP_MESSAGE,
// STRIPE_TRANSACTION, ...) is NEVER a category — it is `provider` metadata.
const SOURCE_CATEGORIES = Object.freeze([
  'WEB_PAGE', 'SEARCH_RESULT', 'REVIEW', 'SOCIAL_POST', 'SOCIAL_COMMENT', 'ADVERTISEMENT',
  'CRM_RECORD', 'CONVERSATION', 'MESSAGE', 'CALL_TRANSCRIPT', 'SURVEY_RESPONSE', 'FORM_RESPONSE',
  'ANALYTICS_EVENT', 'TRANSACTION', 'DOCUMENT', 'USER_INPUT', 'OTHER',
]);

// Fields the envelope accepts. `raw_payload` / `raw_content` / `metadata` are opaque here.
const ENVELOPE_FIELDS = new Set([
  'source_id', 'source_category', 'provider', 'external_id', 'uri', 'captured_at', 'published_at',
  'observation_start', 'observation_end', 'locale', 'language', 'raw_payload', 'raw_content',
  'metadata', 'ingestion_id',
]);

// Only these are structurally required; unknowns stay unknown (spec §A "Do not require fields that are unknown").
const REQUIRED = ['source_id', 'source_category', 'captured_at'];

function rawSourceHash(env) {
  // Hash the *raw* material + the identity/temporal frame — NOT ingestion_id (which is a
  // per-run handle) — so identical raw input yields an identical hash across runs (idempotency §O).
  return 'rsh_' + sha256Hex(canonicalize({
    source_id: nfcLF(env.source_id),
    source_category: String(env.source_category),
    provider: env.provider == null ? null : String(env.provider),
    external_id: env.external_id == null ? null : String(env.external_id),
    uri: env.uri == null ? null : String(env.uri),
    captured_at: String(env.captured_at),
    published_at: env.published_at == null ? null : String(env.published_at),
    observation_start: env.observation_start == null ? null : String(env.observation_start),
    observation_end: env.observation_end == null ? null : String(env.observation_end),
    locale: env.locale == null ? null : String(env.locale),
    language: env.language == null ? null : String(env.language),
    raw_payload: env.raw_payload === undefined ? null : env.raw_payload,
    raw_content: env.raw_content == null ? null : String(env.raw_content),
    metadata: env.metadata === undefined ? null : env.metadata,
  }));
}

function validateRawSourceEnvelope(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, errors: ['envelope must be an object'] };
  for (const k of Object.keys(input)) if (!ENVELOPE_FIELDS.has(k)) errors.push(`unknown envelope field "${k}" (fail closed)`);
  for (const k of REQUIRED) if (input[k] == null || input[k] === '') errors.push(`missing required field "${k}"`);
  if (input.source_category != null && !SOURCE_CATEGORIES.includes(input.source_category)) {
    errors.push(`unsupported source_category "${input.source_category}" (allowed: ${SOURCE_CATEGORIES.join(', ')})`);
  }
  // timestamps, when present, must be ISO-parseable
  for (const k of ['captured_at', 'published_at', 'observation_start', 'observation_end']) {
    if (input[k] != null && Number.isNaN(Date.parse(input[k]))) errors.push(`invalid timestamp "${k}": ${input[k]}`);
  }
  if (input.observation_start != null && input.observation_end != null && Date.parse(input.observation_start) > Date.parse(input.observation_end)) {
    errors.push('observation_start is after observation_end');
  }
  return { valid: errors.length === 0, errors };
}

// makeRawSourceEnvelope(input) -> frozen envelope with a stable raw_source_hash.
// Throws on structural invalidity (fail closed) — callers that want soft handling call
// validateRawSourceEnvelope first and route to REJECTED.
function makeRawSourceEnvelope(input) {
  const v = validateRawSourceEnvelope(input);
  if (!v.valid) throw new Error(`[ASTRA-11C] invalid RawSourceEnvelope: ${v.errors.join(' | ')}`);
  const env = {
    schema_version: INGEST_SCHEMA_VERSION,
    source_id: String(input.source_id),
    source_category: String(input.source_category),
    provider: input.provider == null ? null : String(input.provider),
    external_id: input.external_id == null ? null : String(input.external_id),
    uri: input.uri == null ? null : String(input.uri),
    captured_at: String(input.captured_at),
    published_at: input.published_at == null ? null : String(input.published_at),
    observation_start: input.observation_start == null ? null : String(input.observation_start),
    observation_end: input.observation_end == null ? null : String(input.observation_end),
    locale: input.locale == null ? null : String(input.locale),
    language: input.language == null ? null : String(input.language),
    raw_payload: input.raw_payload === undefined ? null : input.raw_payload,
    raw_content: input.raw_content == null ? null : String(input.raw_content),
    metadata: input.metadata === undefined ? null : input.metadata,
    ingestion_id: input.ingestion_id == null ? null : String(input.ingestion_id),
  };
  env.raw_source_hash = rawSourceHash(env);
  return deepFreeze(env);
}

module.exports = { INGEST_SCHEMA_VERSION, SOURCE_CATEGORIES, ENVELOPE_FIELDS, makeRawSourceEnvelope, validateRawSourceEnvelope, rawSourceHash };
