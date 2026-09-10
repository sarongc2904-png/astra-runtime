# ASTRA-11L — MEMORY MODEL

`BUSINESS_MEMORY_SCHEMA_VERSION = 'ucdm-business-memory-1.0.0'`.

## MemoryCandidate (`candidate.js`)

Required: `business_id`, `memory_type`, `claim`, `source_engine`, `evidence_refs` (non-empty).
Optional: `scope`, `source_report_id`, `source_entity_id`, `source_memory_type`, `observed_at`,
`limitations`, `staleness_policy`, `replaces`, `semantic_target`, `promotion_source`.

`normalizeClaim(c)` = NFC + LF + collapse internal whitespace + trim + lowercase — used for
identity so cosmetic edits do not fork a memory.

Outcomes: `CANDIDATE_VALID` | `CANDIDATE_MALFORMED`. Empty `evidence_refs` ⇒
`reject_code: 'MEMORY_EVIDENCE_REQUIRED'`.

## MemoryRecord (`record.js`)

```
{
  schema_version, kind: 'MemoryRecord',
  memory_id, semantic_key,
  business_id, memory_type, claim, normalized_claim,
  scope, scope_status,
  evidence_status, provenance_complete,
  temporal_status, staleness_class,
  identity_status, supersession_status, conflict_status,
  promotion_status,          // only meaningful for LEARNING candidates
  record_status: 'ACCEPTED' | 'REJECTED',
  reject_reason?,            // MEMORY_EVIDENCE_REQUIRED | EVIDENCE_INVALID |
                            // ASSERTIVE_TYPE_REQUIRES_VALID_EVIDENCE |
                            // LEARNING_PROMOTION_NOT_PERMITTED | PROVENANCE_INCOMPLETE
  is_opinion: false,
  preserved_causal_status?, preserved_statistical_status?, preserved_limitations?,
  generated_by: 'deterministic:ucdm/business_memory/record'
}
```

`memory_id = 'mem_' + sha256Hex(canonicalize({ business_id, memory_type, normalized_claim,
scope, source_engine, source_entity_id, evidence_refs })).slice(0,48)` — content-addressed,
timestamp-independent.

`semantic_key = 'sem_' + sha256Hex(canonicalize({ business_id, memory_type, semantic_target ||
normalized_claim topic, scope key })).slice(0,40)` — groups memories that talk about the same
thing for conflict / supersession.

## Assertive vs non-assertive

`ASSERTIVE_TYPES = ['FACT','LEARNING','CONSTRAINT','UNIT_ECONOMICS','FUNNEL_STATE']` — these
require `EVIDENCE_VALID` (FUNNEL_STATE excepted: a PARTIAL denominator state is allowed but
carried through). A non-VALID assertive candidate ⇒ `ASSERTIVE_TYPE_REQUIRES_VALID_EVIDENCE`.

`NON_CAUSAL_TYPES` may never carry a causal verb in the stored claim; causal phrasing is
preserved only when it came from an ASTRA-11K evaluation that itself permitted causality.

## Retention

Nothing is deleted. Superseded ⇒ `temporal_status: 'SUPERSEDED'`, retained. Invalidated ⇒
`temporal_status: 'INVALIDATED'`, `physically_deleted: false`, retained in
`invalidated_history`. Conflicting memories both retained; resolution refuses to pick.
