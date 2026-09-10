# ASTRA-11L — REPORT CONTRACT

`engine.runBusinessMemory(input)` → `{ report, candidates, records, acceptedMemories,
rejectedMemories, evidenceBindings, provenances, conflicts, supersessions, invalidationResult,
stalenessById, promotions, retrievals, resolutions, snapshot, integrity, provenance_note }`.

## `BusinessMemoryReport` (`report.js`)

```
{
  schema_version: 'ucdm-business-memory-1.0.0',
  kind: 'BusinessMemoryReport',
  report_id: 'bmr_report_' + sha256Hex(canonicalize(<all sections, id excluded>)),
  content_hash: <equals report_id>,
  business_id, reference_time,
  sections: { ... 37 named sections ... },
  evidence_graph_valid: bool,
  boundary: { no_supabase_persistence, no_vector_db, no_embeddings, no_llm, no_crm, no_meta,
              no_experiment_execution, no_campaign_modification, no_commercial_action,
              no_deploy, no_production_routing, no_autonomous_long_term_memory },  // all true
  integrity: <IntegrityAttestation>,
  caveats: [...],
  generated_by: 'deterministic:ucdm/business_memory/report'
}
```

`SECTION_NAMES` (37) cover: input summary, candidate intake, malformed candidates, type
classification, evidence bindings, evidence-required rejections, scope bindings, scope
generalization blocks, provenance, provenance-incomplete rejections, identity classification,
duplicates, temporal validity, staleness, staleness-unknown, conflicts, direct conflicts,
scope-conditional differences, temporal changes, supersessions, partial supersessions,
invalidations, invalidation chains, learning promotions, promotion blocks, preserved causal
status, preserved statistical status, accepted memories, rejected memories, retrieval queries,
retrieval results, resolutions, unresolved-conflict resolutions, snapshot, counts, boundary,
integrity.

## Determinism

`report_id === content_hash`. Given the same `businessId`, `candidates`, `existingMemories`,
`invalidations`, `retrievalQueries`, `knownValidEvidenceRefs`, `invalidatedEvidenceRefs`,
`supersededEvidenceRefs`, `referenceTime` and `provenanceRequireComplete`, `report_id` is
byte-stable across processes and OSes (verified by benchmark `deterministic_rerun` /
`deterministic_rerun` dimension).

`evidence_graph_valid` — true iff every accepted memory's `evidence_refs` are all present in
`knownValidEvidenceRefs` (or PARTIAL where the type allows) and none are in
`invalidatedEvidenceRefs`.

## `provenance_note`

> "ASTRA-11L Business Memory Engine — offline, deterministic, evidence-bound. Nothing is
> persisted. No production routing. No autonomous action. No Supabase / vector DB / embeddings
> / LLM. Snapshots and records exist only in this returned object."

## Engine preconditions (throw, fail-closed)

- `referenceTime` missing ⇒ `[ASTRA-11L] referenceTime required`.
- `businessId` missing ⇒ `[ASTRA-11L] businessId required`.
- Any entity failing its `validateX()` ⇒ `[ASTRA-11L] invalid <Entity>: <errors>`.
