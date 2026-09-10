# ASTRA-11L — EVIDENCE & PROVENANCE

## NO MEMORY WITHOUT EVIDENCE

A `MemoryCandidate` with an empty `evidence_refs` is rejected at intake with
`reject_code: 'MEMORY_EVIDENCE_REQUIRED'`. It never reaches classification.

## Evidence binding (`evidence.js`)

`bindEvidence({ evidence_refs, known_valid_refs, invalidated_refs, superseded_refs,
partial_refs })` classifies the candidate's evidence set:

| status | condition |
|---|---|
| `EVIDENCE_VALID` | every ref ∈ known_valid_refs, none invalidated/superseded |
| `EVIDENCE_PARTIAL` | some refs valid, some unknown / partial, none invalidated |
| `EVIDENCE_MISSING` | no ref is confirmable against known_valid_refs |
| `EVIDENCE_INVALID` | ≥1 ref ∈ invalidated_refs |
| `EVIDENCE_SUPERSEDED` | ≥1 ref ∈ superseded_refs and none invalid |

`permits_strong_promotion = (status === 'EVIDENCE_VALID')`. Anything else blocks LEARNING
promotion (`EVIDENCE_NOT_VALID`) and blocks acceptance of an assertive type
(`ASSERTIVE_TYPE_REQUIRES_VALID_EVIDENCE`, except `FUNNEL_STATE` with a PARTIAL denominator).

Evidence refs are IDs of validated ASTRA-11B..11K entities (evidence units, VoC signals,
funnel diagnostics, experiment evaluations…). ASTRA-11L does not re-derive them and does not
fetch anything.

## Provenance (`provenance.js`)

`buildProvenance({ source_engine, source_report_id, source_entity_id, source_kind,
observed_at, input_scope, evidence_refs })` →

```
{ source_engine, source_report_id, source_entity_id, source_kind,
  observed_at, source_hash: sha256Hex(canonicalize(source tuple)),
  input_scope_hash: scopeHash(input_scope),
  evidence_refs: [...sorted],
  complete: bool, missing: [fields...],
  generated_by: 'deterministic:ucdm/business_memory/provenance' }
```

`complete` is true when source_engine, source_report_id, source_entity_id, observed_at and at
least one evidence ref are all present. `validateProvenance({ requireComplete })` — when the
engine is run with `provenanceRequireComplete: true`, an incomplete provenance rejects the
record with `PROVENANCE_INCOMPLETE`; otherwise the record is accepted but carries
`provenance_complete: false` and a caveat.

Every memory therefore answers: which engine, which report, which entity, observed when, over
which input scope, backed by which evidence.
