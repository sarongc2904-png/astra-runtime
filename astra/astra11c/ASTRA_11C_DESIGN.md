# ASTRA_11C_DESIGN — Evidence Ingestion & Normalization Contract

**Authorization:** `HUMAN_AUTHORIZATION_ASTRA_11C_EVIDENCE_INGESTION_NORMALIZATION_2026-09-09`
**Mode:** design + offline deterministic implementation + testing only.
**Does not waive or modify any ASTRA-10 gate.**

## 1. Purpose

The common **deterministic** ingestion + normalization layer every future ASTRA Commercial
Intelligence engine consumes. It converts heterogeneous external/raw observations into
canonical, provider-neutral, provenance-preserving evidence — **without** letting
provider-specific payloads reach ASTRA's commercial domain model (ASTRA-11B UCDM,
`schema_version ucdm-1.0.0`).

**No LLM is used anywhere in this layer.** No web call, no integration, no Supabase write,
no deploy.

## 2. Pipeline (as built)

```
RAW SOURCE (provider-shaped payload)
   │  ingestion/raw_source.js — RawSourceEnvelope (provider-neutral shell; raw payload kept here ONLY)
   ▼
SOURCE ADAPTER (ingestion/fake_adapters.js — deterministic simulations only)
   │  identify() → validate() → extract() → normalizeMetadata()
   │  ← the provider boundary: everything after this is provider-neutral
   ▼
INGESTION RECORD (ingestion/ingestion_record.js — immutable; RECEIVED→VALIDATED→NORMALIZED | REJECTED | QUARANTINED)
   ▼
NORMALIZATION (normalization/normalize.js, verbatim.js, numeric_observation.js)
   │  verbatim preserved separately; normalized_text derived; units/currency mapped (NO FX)
   ▼
EVIDENCE EXTRACTION → NormalizedObservation (normalization/normalized_observation.js)
   │  10 observation types; provider-neutrality re-checked; content/canonical/normalized hashes
   ▼
PROVENANCE (reuses ASTRA-11B provenance/provenance.js — OBSERVED/COMPUTED/INFERRED/USER_PROVIDED)
   ▼
DEDUPLICATION (evidence/dedup.js — deterministic only; POSSIBLE_DUPLICATE never merged)
   ▼
QUALITY ASSESSMENT (evidence/source_quality.js — attestation vs veracity_support)
   ▼
EVIDENCE BATCH (evidence/evidence_batch.js — reproducible container; content_hash)
   ▼
→ (later) ASTRA COMMERCIAL ENGINES
```

Orchestrated by `ingestion/pipeline.js` `ingest({ rawInputs, referenceTime, batch_id, ledger? })`.
`referenceTime` is caller-supplied — this layer never reads the system clock.

## 3. Files created (all new — nothing modified)

`astra/src/commercial/` (16 modules, ~1,520 LoC):

| area | file | spec § |
|---|---|---|
| A raw source | `ingestion/raw_source.js` | RawSourceEnvelope, 17 provider-neutral `SOURCE_CATEGORIES` |
| B adapter boundary | `ingestion/provider_neutrality.js` | `assertProviderNeutral` — fails closed on any provider-coupled / vendor-id key |
| B fake adapters | `ingestion/fake_adapters.js` | Google review, Meta ad, WhatsApp conversation, CRM lead, Stripe-like transaction — **deterministic simulations, no real APIs** |
| C ingestion record | `ingestion/ingestion_record.js` | immutable record, 5 statuses, legal-only transitions |
| D+E observation | `normalization/normalized_observation.js` + `normalization/verbatim.js` | 10 observation types; verbatim never overwritten |
| D normalization | `normalization/normalize.js` | text/unit/currency/locale — deterministic, no conversion |
| F numeric | `normalization/numeric_observation.js` | integrates ASTRA-11B numeric integrity; INFERRED number ⇒ TEXT annotation |
| G dedup | `evidence/dedup.js` | EXACT / SOURCE / CONTENT / POSSIBLE / DISTINCT — deterministic; POSSIBLE never merged |
| H quality | `evidence/source_quality.js` | `attestation` (was it said) vs `veracity_support` (is it true), category-capped |
| I claim/evidence | (taxonomy — `EVIDENCE_TAXONOMY.md`) | ASTRA-11C owns SOURCE + OBSERVATION only; `CLAIM` = "source asserted X", not an Insight |
| J temporal | `evidence/temporal.js` | 4 time kinds + observation window; freshness vs caller reference time |
| K subject resolution | `evidence/subject_resolution.js` | RESOLVED / UNRESOLVED / AMBIGUOUS — explicit only, no fuzzy, no LLM |
| L privacy | `ingestion/redaction.js` | 6 sensitive classes; deterministic classify + shape-preserving mask (hook, not auto-applied) |
| M batch | `evidence/evidence_batch.js` | reproducible container, order-independent `content_hash` |
| pipeline | `ingestion/pipeline.js` | the deterministic orchestrator + `IngestionLedger` (idempotency §O) |
| surface | `ingestion/index.js` | public API |

`astra/tests/astra11c.test.js` — **25 offline deterministic tests, 25 pass / 0 fail**.

## 4. Reuse of ASTRA-11B (no duplication — spec §Q)

| ASTRA-11B module | reused for |
|---|---|
| `validation/canonical.js` | all hashing (`canonicalize`, `sha256Hex`, `nfcLF`, `deepFreeze`) |
| `provenance/provenance.js` | `pv`, `SOURCE_CLASSES`, `UNKNOWN`, `CANONICAL_NUMERIC_CLASSES` |
| `validation/numeric_integrity.js` | `extractNumeric`, canonical-metric rules for numeric observations |
| `schema/entities.js` | `PROVIDER_COUPLED` regex (the provider-neutrality lint) |

No provenance / hashing / entity / numeric-integrity logic was re-implemented.

## 5. Invariants enforced

1. **Provider payloads never leak.** They live only in `RawSourceEnvelope.raw_payload`. Every `NormalizedObservation` and adapter metadata map is scanned; a leak → QUARANTINED (pipeline) or throw (`assertProviderNeutral`). Tests 5, 23.
2. **Verbatim is sacred.** `verbatim_text` stored byte-for-byte; `normalized_text` is additive; re-normalization never touches verbatim. Tests 3, 4.
3. **No LLM number becomes a metric.** Numeric observations are OBSERVED/USER_PROVIDED/COMPUTED(deterministic); INFERRED numbers become `INFERRED_NUMBER_ANNOTATION`. Test 14, 15.
4. **Nothing is silently dropped.** Every raw input gets an `IngestionRecord`; failures are REJECTED/QUARANTINED with reasons. Test 21.
5. **Deterministic + idempotent.** Same raw input + adapter/schema versions → same `raw_source_hash`, same observation hashes, same batch `content_hash`; recognized as `ALREADY_INGESTED`. Tests 7, 8, 20.
6. **POSSIBLE_DUPLICATE is never merged.** Test 12.
7. **No implicit clock.** Freshness needs a caller `referenceTime`. Test 16.
8. **Identity stays explicit.** No fuzzy / LLM subject resolution; ambiguity stays AMBIGUOUS. Test 17.
9. **Attestation ≠ veracity.** A review strongly attests "this was said" and weakly supports "this is true". Test 13.

## 6. Not in this gate (spec §N–P + hard constraints)

No Market Research / VoC extraction / Persona / Journey / Insight generation; no real
provider integration; no semantic/LLM dedup or identity resolution; no FX; no deploy;
no change to `READY_FOR_PRODUCTION_ROUTING` (FALSE), the ASTRA-10AX `QUALITY_GATE` (FAIL),
`BENCHMARK_WINNER` (NOT_DECLARED), or any frozen ASTRA-10 artifact.

Forward-compatible with later ingestion of web research, reviews, social, ads, CRM,
WhatsApp, call transcripts, surveys, analytics, transactions, documents — each via a new
adapter under a future authorization, with the core layer unchanged.
