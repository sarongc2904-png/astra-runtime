# PROVENANCE_CONTRACT — ASTRA-11B

Implemented by `astra/src/commercial/provenance/provenance.js` and
`astra/src/commercial/provenance/evidence_graph.js`. Enforced by
`astra/src/commercial/validation/validate_entity.js`.

## 1. Source classes (exactly four — no redundant categories)

| class | meaning | numeric field allowed? |
|---|---|---|
| `OBSERVED` | directly measured / recorded from a real artifact (an export, a transcript, a log). Must carry ≥1 evidence ref. | **yes** |
| `COMPUTED` | produced by a **deterministic** module. Must name a producer `deterministic:<module>`. | **yes** |
| `USER_PROVIDED` | asserted by the business owner / operator. | **yes** |
| `INFERRED` | reasoned by a model (or a human analyst) from other material. | **no — stays annotation text** |

`COMPUTED` is the ASTRA-11B addition to ASTRA's existing provenance vocabulary. It is the
only way a *derived* number becomes canonical, and by construction an LLM node cannot emit
it (the deterministic-producer check).

## 2. The ProvenanceValue

Every material field on a canonical entity is a `ProvenanceValue`:

```
{
  value,                     // the fact
  source_class,              // OBSERVED | COMPUTED | INFERRED | USER_PROVIDED
  evidence_refs: [ref_id],   // -> EvidenceReference ids resolved by the EvidenceGraph
  produced_by,               // "deterministic:<module>" | node id | null
  transform,                 // code/prompt version that produced a COMPUTED/INFERRED value
  as_of,                     // when the fact is true / measured
  observed_period,           // {start,end} the observation covers
  ingested_at,               // when it entered the system
  confidence,                // a ConfidenceAssessment (deterministic) or null
  freshness_days,            // age of the newest supporting evidence
  content_hash               // sha256(canonical(this value + trace)) — tamper-evident
}
```

Constructed via `pv(value, source_class, opts)`. It throws on an unsupported class, so a
bad class can never be silently stored. **No silent loss of provenance is permitted** — a
provenanced field that is not a valid `ProvenanceValue` (and is not the explicit `UNKNOWN`
sentinel) fails validation.

## 3. Required provenance capabilities (authorization §B) — coverage

| required | field | 
|---|---|
| source id | `Source.source_id`, `EvidenceReference.source_id` |
| source type | `Source.source_type` (free label; `system` is also free, never a coupled provider type) |
| source timestamp | `Source.source_timestamp` |
| ingested timestamp | `Source.ingested_at`, `ProvenanceValue.ingested_at` |
| observation period | `ProvenanceValue.observed_period`, `Source.observation_period` |
| evidence refs | `ProvenanceValue.evidence_refs[]` |
| transform / version | `ProvenanceValue.transform`, `Provenance.transform_version` |
| confidence | `ProvenanceValue.confidence` → a deterministic `ConfidenceAssessment` |
| freshness | `ProvenanceValue.freshness_days` |
| content hash | `ProvenanceValue.content_hash`, `Source.content_hash` |

## 4. The EvidenceGraph (fail-closed reference integrity)

`EvidenceGraph` holds `Source`, `Evidence`, `EvidenceReference` nodes plus a registry of
entities and their `{evidence_refs, derived_from}` edges.

- `resolveRef(ref_id)` → `{ref, source, evidence?}` or **throws** (`EvidenceError`) if any
  hop is missing. There is no "soft" resolution.
- `checkRefs([ids])` → `{valid, errors[]}` — collects every dangling ref (used by the
  validator so a caller sees all problems at once).
- `addEvidence` / `addReference` themselves reject an unknown `source_id` / `evidence_id`
  at insert time — a dangling reference can never enter the graph.

### Traversal (authorization §E)

`trace(entity_id)` walks `derived_from` + `evidence_refs` down to root `Source` ids,
deterministically (sorted output, `trace_hash`), fail-closed on any dangling ref or a
cycle (`maxDepth`). This supports:

```
Recommendation → Insight → Evidence → Source
Persona → VoiceOfCustomerObservation → Source
Insight(BOTTLENECK) → Metric refs → FunnelStage event_source_refs → Source
```

Validated by tests 2, 11, and "evidence graph trace walks Recommendation → … → Source".

## 5. Where evidence refs are hard-required

The validator fail-closes evidence refs on: any field literally named `evidence_refs`, any
`OBSERVED` `ProvenanceValue`, and any canonical `metric` that is a `ProvenanceValue`.
Entities where `evidence_refs` is a **required non-empty** array:
`MarketObservation`, `Competitor`, `VoiceOfCustomerObservation`, `Insight`,
`Recommendation`, `BusinessLearning`.

## 6. UNKNOWN

`provenance.UNKNOWN` is the single explicit "we do not know" sentinel. It is a legal value
for any non-identity field. The model never invents a value to fill a gap (authorization
§G). Required identity/link fields (`*_ref`, `*_slug`, `*_key`, `*_id`, natural-key fields)
may **not** be `UNKNOWN`.
