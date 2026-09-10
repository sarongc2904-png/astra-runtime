'use strict';
// [ASTRA-11L §6] Memory identity. Content-addressed, deterministic. memory_id derives from
// business_id + memory_type + normalized_claim + scope + source identity + evidence identity.
// Timestamps are NEVER the primary identity. No LLM, no I/O.
const { canonicalize, sha256Hex } = require('../validation/canonical');
const { scopeHash } = require('./scope');

const IDENTITY_STATUS = Object.freeze(['NEW_MEMORY', 'DUPLICATE_MEMORY', 'UPDATED_CONTEXT', 'CONFLICTING_MEMORY']);

function memoryId({ business_id, memory_type, normalized_claim, scope, source_engine, source_entity_id, evidence_refs }) {
  const key = {
    business_id: String(business_id),
    memory_type: String(memory_type),
    normalized_claim: String(normalized_claim),
    scope_hash: scopeHash(scope || {}),
    source_engine: source_engine == null ? null : String(source_engine),
    source_entity_id: source_entity_id == null ? null : String(source_entity_id),
    evidence_key: sha256Hex(canonicalize([...new Set((evidence_refs || []).map(String))].sort())),
  };
  return 'mem_' + sha256Hex(canonicalize(key)).slice(0, 48);
}

// a "semantic key" ignores evidence + source so two memories about the same claim+scope can
// be recognised as candidates for supersession / conflict.
function semanticKey({ business_id, memory_type, semantic_target, normalized_claim, scope }) {
  return 'sem_' + sha256Hex(canonicalize({
    business_id: String(business_id),
    memory_type: String(memory_type),
    target: semantic_target ? String(semantic_target) : String(normalized_claim),
    scope_hash: scopeHash(scope || {}),
  })).slice(0, 40);
}

// classify a new memory against the existing set
function classifyIdentity(newMem, existing = []) {
  const exact = existing.find(m => m.memory_id === newMem.memory_id);
  if (exact) return { status: 'DUPLICATE_MEMORY', matched_id: exact.memory_id };
  const sameSemantic = existing.filter(m => m.semantic_key === newMem.semantic_key && m.memory_id !== newMem.memory_id);
  if (sameSemantic.length) {
    const sameClaim = sameSemantic.every(m => m.normalized_claim === newMem.normalized_claim);
    return { status: sameClaim ? 'UPDATED_CONTEXT' : 'CONFLICTING_MEMORY', related_ids: sameSemantic.map(m => m.memory_id).sort() };
  }
  return { status: 'NEW_MEMORY' };
}

module.exports = { IDENTITY_STATUS, memoryId, semanticKey, classifyIdentity };
