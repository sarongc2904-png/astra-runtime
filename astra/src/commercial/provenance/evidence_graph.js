'use strict';
// [ASTRA-11B] Evidence contract (ASTRA-11B section E). A deterministic, fail-closed graph
// that lets a future ASTRA answer walk:
//   Recommendation -> Insight -> Evidence -> Source
//   Persona -> VoiceOfCustomerObservation -> Source
//   Bottleneck (Insight) -> Funnel Metric -> underlying events (Evidence/Source)
// Reference integrity is deterministic: a ref either resolves or the operation fails closed.
// No I/O, no LLM, no network.
const { canonicalize, sha256Hex } = require('../validation/canonical');

class EvidenceError extends Error {
  constructor(msg) { super(msg); this.name = 'EvidenceError'; }
}

class EvidenceGraph {
  constructor() {
    this.sources = new Map();      // source_id -> Source
    this.evidence = new Map();     // evidence_id -> Evidence  {evidence_id, source_id, kind, locator, extracted}
    this.refs = new Map();         // ref_id -> EvidenceReference
    this.entities = new Map();     // entity_id -> { entity_type, evidence_refs:Set, derived_from:Set(entity_id) }
  }

  addSource(src) {
    if (!src || src.kind !== 'Source' || !src.source_id) throw new EvidenceError('addSource: not a Source');
    this.sources.set(src.source_id, src);
    return this;
  }

  addEvidence({ evidence_id, source_id, kind = 'EXCERPT', locator = null, extracted = null }) {
    if (!evidence_id) throw new EvidenceError('addEvidence: evidence_id required');
    if (!this.sources.has(source_id)) throw new EvidenceError(`addEvidence: unknown source_id "${source_id}" (fail closed)`);
    this.evidence.set(String(evidence_id), Object.freeze({ evidence_id: String(evidence_id), source_id: String(source_id), kind: String(kind), locator: locator == null ? null : String(locator), extracted }));
    return this;
  }

  addReference(ref) {
    if (!ref || ref.kind !== 'EvidenceReference') throw new EvidenceError('addReference: not an EvidenceReference');
    if (!this.sources.has(ref.source_id)) throw new EvidenceError(`addReference "${ref.ref_id}": unknown source_id "${ref.source_id}" (fail closed)`);
    if (ref.evidence_id != null && !this.evidence.has(ref.evidence_id)) throw new EvidenceError(`addReference "${ref.ref_id}": unknown evidence_id "${ref.evidence_id}" (fail closed)`);
    this.refs.set(ref.ref_id, ref);
    return this;
  }

  // Register that an entity is supported by evidence_refs and/or derived from other entities.
  registerEntity(entity_id, entity_type, { evidence_refs = [], derived_from = [] } = {}) {
    this.entities.set(String(entity_id), {
      entity_type: String(entity_type),
      evidence_refs: new Set(evidence_refs.map(String)),
      derived_from: new Set(derived_from.map(String)),
    });
    return this;
  }

  hasRef(ref_id) { return this.refs.has(String(ref_id)); }

  // Fail-closed single-ref resolution: ref -> { ref, source, evidence? }. Throws if any hop is missing.
  resolveRef(ref_id) {
    const ref = this.refs.get(String(ref_id));
    if (!ref) throw new EvidenceError(`resolveRef: unresolved evidence reference "${ref_id}" (fail closed)`);
    const source = this.sources.get(ref.source_id);
    if (!source) throw new EvidenceError(`resolveRef "${ref_id}": source "${ref.source_id}" missing (fail closed)`);
    const evidence = ref.evidence_id != null ? this.evidence.get(ref.evidence_id) : null;
    if (ref.evidence_id != null && !evidence) throw new EvidenceError(`resolveRef "${ref_id}": evidence "${ref.evidence_id}" missing (fail closed)`);
    return { ref, source, evidence };
  }

  // Validate that every ref id in a list resolves. Returns { valid, errors[] } — never throws,
  // so a validator can collect all problems; callers that need hard failure use resolveRef.
  checkRefs(ref_ids) {
    const errors = [];
    for (const id of ref_ids || []) {
      try { this.resolveRef(id); } catch (e) { errors.push(e.message); }
    }
    return { valid: errors.length === 0, errors };
  }

  // Deterministic provenance walk from an entity down to its root Sources. Fails closed on
  // any dangling ref / unknown derived-from. `maxDepth` guards against a malformed cycle.
  trace(entity_id, { maxDepth = 32 } = {}) {
    const rootSources = new Set();
    const visitedEntities = new Set();
    const path = [];
    const walk = (eid, depth) => {
      if (depth > maxDepth) throw new EvidenceError(`trace: max depth exceeded at "${eid}" (possible cycle) — fail closed`);
      if (visitedEntities.has(eid)) return;
      visitedEntities.add(eid);
      const node = this.entities.get(String(eid));
      if (!node) throw new EvidenceError(`trace: entity "${eid}" not registered in the evidence graph (fail closed)`);
      path.push({ entity_id: String(eid), entity_type: node.entity_type });
      for (const rid of node.evidence_refs) {
        const { source } = this.resolveRef(rid); // throws if dangling
        rootSources.add(source.source_id);
      }
      for (const dep of node.derived_from) walk(dep, depth + 1);
    };
    walk(String(entity_id), 0);
    return {
      entity_id: String(entity_id),
      path,
      root_source_ids: [...rootSources].sort(),
      trace_hash: sha256Hex(canonicalize({ path, root_source_ids: [...rootSources].sort() })),
    };
  }
}

module.exports = { EvidenceGraph, EvidenceError };
