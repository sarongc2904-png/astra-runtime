# ASTRA-11L — RETRIEVAL & RESOLUTION

## Retrieval index contract (`retrieval.js`)

`retrieve({ memories, query })`. **No embeddings, no vector similarity, no LLM** —
`uses_embeddings: false`, `uses_vector_similarity: false`, `uses_llm: false`.

### Query fields (all optional, all exact-match filters)

`business_id`, `memory_types[]`, `source_engine`, `entity_ids[]`, `semantic_target`,
`status_filters` (temporal statuses to include), `time_window`, `scope` (context scope),
`include_scope_mismatch` (default false).

### Filtering

1. `business_id` must match.
2. Type / engine / entity / semantic filters applied if present.
3. Temporal status: default keeps `ACTIVE` and `STALE`; excludes `SUPERSEDED`, `EXPIRED`,
   `INVALIDATED` unless named in `status_filters`.
4. `compareScope(memory.scope, query.scope)`:
   - `SCOPE_MATCH` / `SCOPE_PARTIAL` / `SCOPE_UNKNOWN` → kept.
   - `SCOPE_MISMATCH` → dropped unless `include_scope_mismatch`.

### Deterministic ordering (total order — no ties left to chance)

`scope_rank` (MATCH < PARTIAL < UNKNOWN) → `scopeSpecificity` desc → `status_rank`
(ACTIVE < STALE) → recency (`observed_at` desc) → `evidence_rank` (EVIDENCE_VALID < PARTIAL) →
`memory_id` asc.

`validateRetrieval(result)` asserts the scope ordering is monotonic (no PARTIAL ranked above a
MATCH), else throws.

## Retrieval resolution (`resolution.js`)

`resolve({ retrievalResult, memoriesById, conflicts })` → `RESOLUTION_STATUS`:

| status | meaning | selection |
|---|---|---|
| `RESOLVED_SINGLE` | exactly one applicable memory | that memory |
| `RESOLVED_MULTIPLE_COMPATIBLE` | several, no conflict, same direction | top-ranked + list |
| `RESOLVED_CONDITIONAL` | several that differ **by scope** (`SCOPE_CONDITIONAL_DIFFERENCE`) | none picked; returns the scoped set with conditions |
| `UNRESOLVED_CONFLICT` | ≥2 in `DIRECT_CONFLICT` / `UNRESOLVED_CONFLICT` over the query scope | **nothing selected**; both surfaced with the conflict |
| `NO_APPLICABLE_MEMORY` | filter/scope left nothing | nothing |

`arbitrary_selection: false` always. On `UNRESOLVED_CONFLICT` the resolver never breaks the
tie by recency or evidence — it reports the conflict and lets the caller decide. A
`TEMPORAL_CHANGE` pair resolves to the **newer** memory with a `superseded_by_time` note (that
is a dated change, not a contradiction).
