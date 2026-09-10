# ASTRA_11B_DESIGN — Unified Commercial Data Model

**Authorization:** `HUMAN_AUTHORIZATION_ASTRA_11B_UNIFIED_COMMERCIAL_DATA_MODEL_DESIGN_2026-09-09`
**Mode:** design + schema implementation + offline deterministic validation only.
**This authorization does not waive or modify any ASTRA-10 gate.**

## 1. Purpose

Turn the ASTRA-11A UCDM proposal into a precise, versioned, machine-validatable,
**provider-neutral** contract that the future Commercial Intelligence Operating System
(ASTRA-11C+) reads and writes. It is a contract library only — it wires up no runtime, no
LLM node, no integration, no database.

## 2. What was built

All new, under `astra/src/commercial/` and `astra/astra11b/`. No existing file modified.

```
astra/src/commercial/
  index.js                         public surface
  schema/
    entities.js                    39 canonical provider-neutral entities (declarative field specs)
    versioning.js                  entity identity, immutable version identity, append-only supersession, conflict detection
    experiment_lifecycle.js        PROPOSED→APPROVED→RUNNING→COMPLETED(+KEEP/ITERATE/REJECT/INCONCLUSIVE); BusinessLearning traceability
  provenance/
    provenance.js                  SOURCE_CLASSES, ProvenanceValue, Source, EvidenceReference, UNKNOWN sentinel
    evidence_graph.js              deterministic, fail-closed evidence graph + provenance trace
  validation/
    canonical.js                   deterministic canonicalization + SHA-256 content/entity/version hashing (independent re-impl of the frozen decision-cache pattern)
    validate_entity.js             one-pass entity validator (structure + provenance + numeric integrity + evidence integrity + enums + UNKNOWN)
    numeric_integrity.js           "an LLM number never becomes a canonical metric"
    confidence.js                  deterministic ConfidenceAssessment from measurable signals
    funnel_math.js                 deterministic conversion/drop-off math + consistency check
    recommendation.js              deterministic priority + deterministic evidence-integrity check
astra/tests/astra11b.test.js       21 offline deterministic tests
```

## 3. The eight commercial domains, all representable

| Domain | Entities |
|---|---|
| MARKET | Business, Market, MarketObservation, Competitor |
| CUSTOMER | Segment, Persona, ICP, VoiceOfCustomerObservation, JTBD, CustomerJourney, CustomerJourneyStage |
| STRATEGY | Positioning, Offer, Product |
| ACQUISITION | Channel, Campaign, Creative, Lead, Conversation, Appointment, Opportunity |
| REVENUE | Sale, RevenueEvent, RetentionEvent, UpsellEvent |
| OPTIMIZATION | Funnel, FunnelStage, FunnelTransition, Metric, Insight, Recommendation |
| EXPERIMENTATION | Experiment, ExperimentResult |
| BUSINESS MEMORY | BusinessLearning |
| (cross-cutting) | Evidence, EvidenceReference, Source, Provenance, ConfidenceAssessment |

Full field lists: [`COMMERCIAL_ENTITY_CATALOG.md`](COMMERCIAL_ENTITY_CATALOG.md).

## 4. The five invariants this contract enforces

| Invariant | Where | Contract doc |
|---|---|---|
| **Provider neutrality.** No `MetaCampaign`, no `WhatsAppLead`. A load-time lint rejects any provider-coupled field name; the validator rejects unknown fields (fail closed) so an external payload cannot leak in. | `entities.js` lint, `validate_entity.js` | this doc §5 |
| **Provenance on every material fact.** Every provenanced field is a `ProvenanceValue` carrying source id/type/timestamps, observation period, evidence refs, transform+version, confidence, freshness, and a content hash. No silent loss. | `provenance.js`, `validate_entity.js` | [`PROVENANCE_CONTRACT.md`](PROVENANCE_CONTRACT.md) |
| **Numeric integrity.** A canonical metric field must be `OBSERVED`, `USER_PROVIDED`, or `COMPUTED` (deterministic producer). An `INFERRED`/LLM number stays annotation text. | `numeric_integrity.js`, `validate_entity.js` | [`NUMERIC_INTEGRITY_CONTRACT.md`](NUMERIC_INTEGRITY_CONTRACT.md) |
| **Explicit versioning.** Stable entity id = hash(type + natural key); immutable version id = hash(entity id + content hash + effective_at + supersedes). Analytical snapshots are deep-frozen and append-only; operational state may be re-materialized but never mutated in place. | `versioning.js`, `canonical.js` | [`VERSIONING_CONTRACT.md`](VERSIONING_CONTRACT.md) |
| **Deterministic confidence + fail-closed evidence refs.** Confidence is computed from signals, never invented by an LLM. Every evidence reference resolves in the `EvidenceGraph` or the operation fails closed. | `confidence.js`, `evidence_graph.js` | [`PROVENANCE_CONTRACT.md`](PROVENANCE_CONTRACT.md) §4–5 |

## 5. Provider neutrality — how external systems map in later

The core model is closed. In a later authorized gate, an **adapter layer**
(`astra/src/commercial/adapters/`, not built here) is the *only* place that knows about
Meta / WhatsApp / a CRM / Stripe / GA4. An adapter:

1. reads a provider payload,
2. emits `Source` + `Evidence` + `EvidenceReference` records for provenance,
3. maps fields onto canonical entities (e.g. a Meta campaign → `Campaign` with
   `channel_class: 'PAID_SOCIAL'`, never `channel: 'meta'`),
4. runs `validateEntity` — which rejects any leaked provider-coupled field.

The canonical schema never gains a provider-specific field. Test 15 + the registry lint
guarantee this.

## 6. Alignment with the frozen ASTRA-10 architecture

- **Determinism inheritance.** `canonical.js` re-implements (does not import) the exact
  canonicalization discipline of the frozen `classifier_decision_cache.js`: NFC + LF
  normalization, sorted keys, no insignificant whitespace, SHA-256. Same "singular winner,
  never overwrite" spirit as `putIfAbsent`.
- **Provenance model.** `source_class` extends ASTRA's existing
  `{INTERNAL_KNOWLEDGE, EXTERNAL_RESEARCH, USER_PROVIDED_FACTS, INFERENCE}` to the
  ASTRA-11B-mandated `{OBSERVED, COMPUTED, INFERRED, USER_PROVIDED}` — `COMPUTED` is the
  new, explicit "a deterministic module produced this number" class.
- **Fail-closed everywhere.** Missing evidence, unknown field, bad provenance, impossible
  funnel math → rejected, never a fabricated pass — mirrors the hardened workflow's
  `BLOCKED`/`WAITING_FOR_INPUT` gates and the answer policy's `INSUFFICIENT`.
- **`UNKNOWN` is representable** — mirrors the classifier's `AMBIGUOUS` and the
  specialists' `POR DEFINIR` / `USER_PROVIDED_FACTS` discipline; the model never forces an
  invented value.

## 7. What ASTRA-11B deliberately does NOT do (per authorization §11–13, N)

- No decision-producing LLM node.
- No production integration, no Supabase write, no deploy.
- No modification of Agent V1, Strategy-F, the classifier/cache, the answer policy, or
  `astra/benchmarks/astra10ah/`.
- No change to `READY_FOR_PRODUCTION_ROUTING` (stays FALSE), the ASTRA-10AX
  `QUALITY_GATE` (stays FAIL), or `BENCHMARK_WINNER` (stays NOT_DECLARED).

## 8. Hand-off to ASTRA-11C (design readiness only)

If this gate is PASS, `READY_FOR_ASTRA_11C = TRUE` means **the data contract is ready to
build against** — nothing more. ASTRA-11C (Market Research / VoC / Persona / Journey /
integrations / any other ASTRA-11 phase) requires its own separate human authorization.
