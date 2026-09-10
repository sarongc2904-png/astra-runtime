'use strict';
// [ASTRA-11L §13] Deterministic retrieval. Ordering: (1) scope exactness, (2) status,
// (3) recency, (4) evidence strength, (5) deterministic tie-breaker (memory_id).
// NO embeddings, NO vector similarity, NO LLM. No I/O.
const { canonicalize, sha256Hex, deepFreeze } = require('../validation/canonical');
const { compareScope, scopeSpecificity } = require('./scope');

const STATUS_RANK = { ACTIVE: 0, STALE: 1, SUPERSEDED: 2, EXPIRED: 3, INVALIDATED: 4 };
const EVIDENCE_RANK = { EVIDENCE_VALID: 0, EVIDENCE_PARTIAL: 1, EVIDENCE_SUPERSEDED: 2, EVIDENCE_INVALID: 3, EVIDENCE_MISSING: 4 };

// retrieve({ memories, query }) -> frozen RetrievalResult
//   query: { business_id, memory_types[], scope, status_filters[], time_window, semantic_target,
//            source_engine, entity_ids[], include_invalidated }
function retrieve({ memories = [], query = {} }) {
  const q = query;
  let pool = memories.filter(m => m.record_status === 'ACCEPTED');
  if (q.business_id) pool = pool.filter(m => m.business_id === String(q.business_id));
  if (q.memory_types && q.memory_types.length) pool = pool.filter(m => q.memory_types.includes(m.memory_type));
  if (q.source_engine) pool = pool.filter(m => m.source_engine === String(q.source_engine));
  if (q.entity_ids && q.entity_ids.length) pool = pool.filter(m => q.entity_ids.includes(m.source_entity_id));
  if (q.semantic_target) pool = pool.filter(m => (m.semantic_target || m.metric) === String(q.semantic_target));
  if (!q.include_invalidated) pool = pool.filter(m => m.temporal_status !== 'INVALIDATED');
  if (q.status_filters && q.status_filters.length) pool = pool.filter(m => q.status_filters.includes(m.temporal_status));
  if (q.time_window && q.time_window.start && q.time_window.end) {
    const s = Date.parse(q.time_window.start), e = Date.parse(q.time_window.end);
    pool = pool.filter(m => { const t = m.observed_at ? Date.parse(m.observed_at) : NaN; return !Number.isFinite(t) || (t >= s && t <= e); });
  }

  const scored = pool.map(m => {
    const sc = q.scope ? compareScope(q.scope, m.scope) : { status: 'SCOPE_UNKNOWN' };
    const scopeRank = ({ SCOPE_MATCH: 0, SCOPE_PARTIAL: 1, SCOPE_UNKNOWN: 2, SCOPE_MISMATCH: 3 })[sc.status];
    return {
      memory: m, scope_status: sc.status, scope_rank: scopeRank,
      specificity: scopeSpecificity(m.scope),
      status_rank: STATUS_RANK[m.temporal_status] != null ? STATUS_RANK[m.temporal_status] : 5,
      recency: m.observed_at ? Date.parse(m.observed_at) : -Infinity,
      evidence_rank: EVIDENCE_RANK[m.evidence_status] != null ? EVIDENCE_RANK[m.evidence_status] : 5,
    };
  });
  // drop hard scope mismatches from the ordered result unless explicitly permitted
  const kept = q.include_scope_mismatch ? scored : scored.filter(s => s.scope_status !== 'SCOPE_MISMATCH');

  kept.sort((a, b) =>
    a.scope_rank - b.scope_rank ||
    b.specificity - a.specificity ||
    a.status_rank - b.status_rank ||
    b.recency - a.recency ||
    a.evidence_rank - b.evidence_rank ||
    (a.memory.memory_id < b.memory.memory_id ? -1 : 1),
  );

  const body = {
    schema_version: 'ucdm-business-memory-1.0.0', kind: 'RetrievalResult',
    query: { ...q, scope: q.scope || null },
    result_count: kept.length,
    results: kept.map(k => ({ memory_id: k.memory.memory_id, memory_type: k.memory.memory_type, scope_status: k.scope_status, temporal_status: k.memory.temporal_status, evidence_status: k.memory.evidence_status, observed_at: k.memory.observed_at, conflict_state: k.memory.conflict_state })),
    ordering: ['scope_exactness', 'scope_specificity', 'status', 'recency', 'evidence_strength', 'memory_id'],
    uses_embeddings: false, uses_vector_similarity: false, uses_llm: false,
    generated_by: 'deterministic:ucdm/business_memory',
  };
  body.retrieval_id = 'bmrt_' + sha256Hex(canonicalize({ ...body, retrieval_id: undefined }));
  return deepFreeze(body);
}

function validateRetrieval(r) {
  const errors = [];
  if (r.uses_embeddings !== false || r.uses_vector_similarity !== false || r.uses_llm !== false) errors.push('retrieval must be deterministic — no embeddings / vector similarity / LLM');
  // ordering monotonic on scope_rank
  let last = -1;
  for (const res of r.results) {
    const rank = ({ SCOPE_MATCH: 0, SCOPE_PARTIAL: 1, SCOPE_UNKNOWN: 2, SCOPE_MISMATCH: 3 })[res.scope_status];
    if (rank < last) { errors.push('results not ordered by scope exactness'); break; }
    last = rank;
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { retrieve, validateRetrieval };
