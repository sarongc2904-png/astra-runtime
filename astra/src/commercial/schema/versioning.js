'use strict';
// [ASTRA-11B] Entity identity + versioning (ASTRA-11B section D).
// - stable entity identity  = hash(entity_type + natural key)
// - immutable version identity = hash(entity_id + content_hash + effective_at + supersedes)
// - append-only: a change produces a NEW version referencing the previous one; the stored
//   snapshot is deep-frozen. Operational-state entities MAY be re-materialized; analytical
//   snapshots are immutable once written.
// Pure functions. No I/O, no LLM, no network.
const { entityId, versionId, contentHash, deepFreeze, canonicalize } = require('../validation/canonical');
const { ENTITIES, SCHEMA_VERSION } = require('./entities');
const { validateEntity } = require('../validation/validate_entity');

// Fields that never enter the content hash (they describe the version, not the fact).
const ENVELOPE_KEYS = new Set(['_meta']);

function stripEnvelope(body) {
  const out = {};
  for (const k of Object.keys(body)) if (!ENVELOPE_KEYS.has(k)) out[k] = body[k];
  return out;
}

function naturalKeyOf(entityType, body) {
  const def = ENTITIES[entityType];
  if (!def) throw new Error(`versioning: unknown entity type "${entityType}"`);
  const nk = {};
  for (const k of def.natural_key) {
    if (body[k] == null) throw new Error(`versioning: ${entityType} natural key field "${k}" is required`);
    nk[k] = body[k];
  }
  return nk;
}

// makeVersion(entityType, body, opts) -> frozen version record.
// opts: { effective_at (required), created_at, supersedes (prior version_id | null), actor, reason, validate:true, evidenceGraph }
function makeVersion(entityType, body, opts = {}) {
  const def = ENTITIES[entityType];
  if (!def) throw new Error(`versioning: unknown entity type "${entityType}"`);
  if (!opts.effective_at) throw new Error('versioning: effective_at is required');

  if (opts.validate !== false) {
    const r = validateEntity(entityType, stripEnvelope(body), { evidenceGraph: opts.evidenceGraph });
    if (!r.valid) throw new Error(`versioning: ${entityType} fails validation, refusing to version: ${r.errors.join(' | ')}`);
  }

  const factBody = stripEnvelope(body);
  const nk = naturalKeyOf(entityType, factBody);
  const eid = entityId(entityType, nk);
  const chash = contentHash(factBody);
  const supersedes = opts.supersedes || null;
  const vid = versionId({ entity_id: eid, content_hash: chash, effective_at: opts.effective_at, supersedes });

  const record = {
    _meta: {
      entity_type: entityType,
      entity_kind: def.kind, // ANALYTICAL_SNAPSHOT | OPERATIONAL_STATE
      entity_id: eid,
      version_id: vid,
      content_hash: chash,
      schema_version: SCHEMA_VERSION,
      created_at: opts.created_at || opts.effective_at,
      effective_at: opts.effective_at,
      supersedes,
      previous_version: supersedes,
      actor: opts.actor || null,
      reason: opts.reason || null,
      immutable: def.kind === 'ANALYTICAL_SNAPSHOT',
    },
    body: factBody,
  };
  // Analytical snapshots are deep-frozen; operational state is frozen at the envelope level
  // only (its `body` may be replaced by a new re-materialization, but never mutated in place).
  if (def.kind === 'ANALYTICAL_SNAPSHOT') return deepFreeze(record);
  Object.freeze(record._meta);
  Object.freeze(record);
  return record;
}

// Verify a stored version record's hashes still hold (tamper / drift detection). Fail closed.
function verifyVersion(record) {
  const errors = [];
  if (!record || !record._meta || !record.body) return { valid: false, errors: ['not a version record'] };
  const m = record._meta;
  const recomputedContent = contentHash(record.body);
  if (recomputedContent !== m.content_hash) errors.push('content_hash mismatch');
  const recomputedId = entityId(m.entity_type, naturalKeyOf(m.entity_type, record.body));
  if (recomputedId !== m.entity_id) errors.push('entity_id mismatch');
  const recomputedVer = versionId({ entity_id: m.entity_id, content_hash: m.content_hash, effective_at: m.effective_at, supersedes: m.supersedes || null });
  if (recomputedVer !== m.version_id) errors.push('version_id mismatch');
  return { valid: errors.length === 0, errors };
}

// Build the next version of an entity (append-only). Throws if the prior record is analytical
// and someone attempts an in-place semantic (this API always creates a new record).
function supersede(priorRecord, newBody, opts = {}) {
  const m = priorRecord._meta;
  return makeVersion(m.entity_type, newBody, {
    effective_at: opts.effective_at,
    created_at: opts.created_at,
    supersedes: m.version_id,
    actor: opts.actor,
    reason: opts.reason || 'superseded',
    validate: opts.validate,
    evidenceGraph: opts.evidenceGraph,
  });
}

// Detect a conflict between two live versions of the same entity: same entity_id, neither
// supersedes the other, different content. Conflicts are surfaced, never auto-resolved.
function detectConflict(a, b) {
  if (a._meta.entity_id !== b._meta.entity_id) return { conflict: false, reason: 'different entity' };
  if (a._meta.version_id === b._meta.version_id) return { conflict: false, reason: 'same version' };
  const lineage = a._meta.supersedes === b._meta.version_id || b._meta.supersedes === a._meta.version_id;
  if (lineage) return { conflict: false, reason: 'linear supersession' };
  if (a._meta.content_hash === b._meta.content_hash) return { conflict: false, reason: 'identical content' };
  return {
    conflict: true,
    entity_id: a._meta.entity_id,
    versions: [a._meta.version_id, b._meta.version_id],
    detected_hash: contentHash({ a: a._meta.version_id, b: b._meta.version_id }),
    status: 'OPEN',
  };
}

module.exports = { makeVersion, verifyVersion, supersede, detectConflict, naturalKeyOf, stripEnvelope, ENVELOPE_KEYS };
