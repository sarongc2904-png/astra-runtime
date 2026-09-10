# ASTRA-11L — Business Memory Engine — DESIGN

**Authorization:** `HUMAN_AUTHORIZATION_ASTRA_11L_BUSINESS_MEMORY_ENGINE_2026_09_09`.
**Mode:** DESIGN + DETERMINISTIC OFFLINE IMPLEMENTATION + ISOLATED OFFLINE BENCHMARKING.

**ASTRA-11L persists nothing.** No Supabase, no vector DB, no Redis, no external storage, no
production writes, no embeddings, no LLM summarization, no autonomous long-term memory, no
CRM/Meta, no experiment execution, no campaign modification, no deploy, no production routing.
It builds the offline memory engine + its contracts only. No ASTRA-11L output may feed
production routing or autonomous action.

Deterministic-first — Node.js, small modules, `crypto` only, no LLM. Same valid input set ⇒
same `memory_id`, same `report_id`, same resolution result.

## Pipeline

```
Validated ASTRA-11B..11K Evidence
  -> MemoryCandidate           candidate.js       (§1)
  -> Type Classification       types.js           (§2)
  -> Evidence Binding          evidence.js        (§3)
  -> Scope Binding             scope.js           (§4)   (reuses 11J time_window / cohort / channel)
  -> Provenance                provenance.js      (§5)
  -> Memory Identity           identity.js        (§6)
  -> Temporal Validity         temporal.js        (§7)
  -> Staleness Evaluation      staleness.js       (§8)
  -> Conflict Detection        conflicts.js       (§9)
  -> Supersession Resolution   supersession.js    (§10)
  -> Learning Promotion        promotion.js       (§11)
  -> Memory Invalidation       invalidation.js    (§12)
  -> MemoryRecord              record.js
  -> Retrieval Index / Resolution   retrieval.js · resolution.js   (§13 §14)
  -> BusinessMemorySnapshot    snapshot.js        (§15)
  -> Integrity Attestation     integrity.js
  -> BusinessMemoryReport      report.js · engine.js               (§16)
```

`engine.runBusinessMemory({ businessId, candidates, existingMemories?, invalidations?,
retrievalQueries?, knownValidEvidenceRefs?, invalidatedEvidenceRefs?, referenceTime })` is the
single orchestrator. Every stage validates fail-closed.

## Modules (`astra/src/commercial/business_memory/` — 20 modules, ~1,366 LoC, `crypto` only)

| module | responsibility | § |
|---|---|---|
| `candidate.js` | `MemoryCandidate`; rejects a candidate missing business_id / memory_type / claim / source_engine / evidence_refs (`MEMORY_EVIDENCE_REQUIRED`) | 1 |
| `types.js` | 16 controlled `MEMORY_TYPES`; forbidden auto-transitions (HYPOTHESIS→FACT/LEARNING, …) | 2 |
| `evidence.js` | `EVIDENCE_VALID / PARTIAL / MISSING / INVALID / SUPERSEDED`; non-VALID blocks strong promotion | 3 |
| `scope.js` | 12-field scope; `SCOPE_MATCH / PARTIAL / MISMATCH / UNKNOWN`; never widened to global | 4 |
| `provenance.js` | source engine/report/entity/timestamp/hash + evidence + input_scope_hash | 5 |
| `identity.js` | content-addressed `memory_id`; `NEW / DUPLICATE / UPDATED_CONTEXT / CONFLICTING` | 6 |
| `temporal.js` | `ACTIVE / STALE / EXPIRED / SUPERSEDED / INVALIDATED`; no invented expiry (`STALENESS_UNKNOWN`) | 7 |
| `staleness.js` | `CURRENT / POTENTIALLY_STALE / STALE / UNKNOWN` from explicit inputs; version-drift; `probabilistic: false` | 8 |
| `conflicts.js` | `DIRECT_CONFLICT / SCOPE_CONDITIONAL_DIFFERENCE / TEMPORAL_CHANGE / NO_CONFLICT / UNRESOLVED_CONFLICT` | 9 |
| `supersession.js` | `NOT_SUPERSEDED / SUPERSEDED / PARTIALLY_SUPERSEDED`; `prior_memories_deleted: false` | 10 |
| `promotion.js` | strict RESULT→LEARNING policy; `LEARNING_PROMOTION_NOT_PERMITTED`; preserves causal/statistical/limitations | 11 |
| `invalidation.js` | `INVALIDATED` with reason/at/by; `physically_deleted: false` | 12 |
| `record.js` | `MemoryRecord` — accepted/rejected; `is_opinion: false` | — |
| `retrieval.js` | deterministic order: scope exactness → specificity → status → recency → evidence → memory_id; no embeddings/vector/LLM | 13 |
| `resolution.js` | `RESOLVED_SINGLE / MULTIPLE_COMPATIBLE / CONDITIONAL / UNRESOLVED_CONFLICT / NO_APPLICABLE_MEMORY`; `arbitrary_selection: false` | 14 |
| `snapshot.js` | `BusinessMemorySnapshot`; `is_absolute_truth: false` | 15 |
| `integrity.js` | self-scan attestation — network/llm/db/external-storage/deploy = 0, persists nothing | — |
| `report.js` | 37-section `BusinessMemoryReport`; deterministic `report_id`; boundary section | 16 |
| `engine.js` | orchestrator; `provenance_note` | — |

## Fundamental principles (enforced)

1. **NO MEMORY WITHOUT EVIDENCE** — no `evidence_refs` ⇒ `MEMORY_EVIDENCE_REQUIRED`, candidate rejected.
2. **HYPOTHESIS IS NOT FACT** — a hypothesis never auto-promotes to FACT or LEARNING.
3. **INCONCLUSIVE IS NOT LEARNING** — an `INCONCLUSIVE / INSUFFICIENT_EVIDENCE / INVALIDATED` experiment never becomes a positive learning.
4. **NO SILENT GENERALIZATION** — a result about one scope is never a global business claim.
5. **NO SILENT OVERWRITE** — new evidence coexists / supersedes / invalidates / conflicts explicitly; prior memory is retained.
6. **MEMORY MUST AGE** — every memory has a temporal state.
7. **DETERMINISTIC-FIRST** — same inputs ⇒ same `memory_id` / `report_id` / resolution.
8. **NO PRODUCTION MEMORY** — offline engine + contracts only.

## Never fabricated

An expected lift · significance · causality · sample size · benchmarks · conversions ·
results · revenue · margin · a probabilistic confidence score · an expiration date without a
policy · a global claim from a partial scope.
