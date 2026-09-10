# INGESTION_NORMALIZATION_CONTRACT — ASTRA-11C

`ingest_schema_version = ucdm-ingest-1.0.0` · downstream target `ucdm-1.0.0`

## A. RawSourceEnvelope (`ingestion/raw_source.js`)

Provider-neutral shell. The **only** place a raw provider payload legally exists.

| field | required | notes |
|---|---|---|
| `source_id` | ✅ | stable per-source id |
| `source_category` | ✅ | one of the 17 canonical categories below |
| `captured_at` | ✅ | ISO timestamp |
| `provider` | | free label (e.g. `google_reviews`) — **never** a category |
| `external_id` | | provider's id for this item |
| `uri`, `published_at`, `observation_start`, `observation_end`, `locale`, `language` | | as known |
| `raw_payload`, `raw_content`, `metadata` | | opaque; retained for audit / re-processing |
| `ingestion_id` | | per-run handle |
| `raw_source_hash` | (computed) | `rsh_` + sha256 over raw material + identity/temporal frame (excludes `ingestion_id`) — the idempotency key |

**Source categories (vendor names are NOT categories):**
`WEB_PAGE · SEARCH_RESULT · REVIEW · SOCIAL_POST · SOCIAL_COMMENT · ADVERTISEMENT · CRM_RECORD · CONVERSATION · MESSAGE · CALL_TRANSCRIPT · SURVEY_RESPONSE · FORM_RESPONSE · ANALYTICS_EVENT · TRANSACTION · DOCUMENT · USER_INPUT · OTHER`

`META_AD`, `WHATSAPP_MESSAGE`, `STRIPE_TRANSACTION` → **rejected** (test 2).

## B. Source adapter contract (`ingestion/fake_adapters.js`)

```
identify(raw)           -> bool          may inspect provider payload
validate(raw)           -> {valid,errors}
extract(raw)            -> [obs spec]     emits PROVIDER-NEUTRAL observation specs
normalizeMetadata(raw)  -> {}             provider-neutral map (scanned for leaks)
```

Everything an adapter emits is scanned by `provider_neutrality.assertProviderNeutral`
against the ASTRA-11B `PROVIDER_COUPLED` regex + a vendor-id-key regex (`fbid`, `ad_id`,
`wamid`, `charge_id`, `gclid`, `utm_*`, …). A leak → the item is QUARANTINED with the
offending paths.

Fake adapters provided (deterministic, no real API): Google review · Meta ad · WhatsApp
conversation · CRM lead · Stripe-like transaction.

## C. IngestionRecord (`ingestion/ingestion_record.js`)

Immutable. `content_hash` = `ing_` + sha256(canonical body).

| field | |
|---|---|
| `ingestion_id`, `raw_source_hash`, `source_id`, `adapter_id`, `adapter_version` | identity |
| `received_at`, `processed_at` | timing (caller-supplied) |
| `status` | `RECEIVED → VALIDATED → NORMALIZED` \| `REJECTED` \| `QUARANTINED` |
| `errors[]`, `warnings[]`, `schema_version` | |

Legal transitions only (`advance()` throws otherwise). `REJECTED` (structurally unusable)
and `QUARANTINED` (held for review — possible-dup, already-ingested, ambiguous) are never
discarded (spec §C, §N). Test 21, 22.

## D. NormalizedObservation (`normalization/normalized_observation.js`)

| field | notes |
|---|---|
| `observation_type` | one of the 10 types (`EVIDENCE_TAXONOMY.md`) |
| `subject` | a subjectRef (`RESOLVED`/`UNRESOLVED`/`AMBIGUOUS`) or `UNKNOWN` |
| `content` | `{text, normalized_text}` for TEXT-ish types |
| `verbatim` | a verbatim block for QUOTE / CLAIM (required) |
| `numeric` | a NumericObservation for METRIC / TRANSACTION / RATING |
| `structured_values` | provider-neutral key/values (scanned) |
| `source_ref` | required — envelope `source_id` or an EvidenceReference id |
| `temporal` | 4-kind temporal block or null |
| `language`, `locale` | normalized |
| `provenance` | ASTRA-11B `ProvenanceValue` (`OBSERVED` requires ≥1 evidence_ref) |
| `quality` | a source-quality block or null |
| `content_hash` | `obs_` — full record |
| `canonical_content_hash` | `occ_` — verbatim + numeric + structured (for CONTENT dedup) |
| `normalized_content_hash` | `onc_` — normalized_text + numeric (for POSSIBLE dedup) |

## E. Verbatim (`normalization/verbatim.js`)

`{ verbatim_text (exact), normalized_text (derived), language, actor, timestamp, time_range, source_ref, verbatim_hash }`.
`normalizeText` = NFC + LF + strip C0/C1 controls (keep `\n`/`\t`) + collapse horizontal
whitespace + tidy line breaks + trim. **Case and punctuation preserved.**
`verifyVerbatim` fails closed on any post-hoc alteration. Tests 3, 4.

## F. NumericObservation (`normalization/numeric_observation.js`)

`{ value, unit, unit_known, currency, currency_known, denominator, aggregation, observation_window, provenance, is_canonical_metric }`.

- `source_class` ∈ `OBSERVED · USER_PROVIDED · COMPUTED` only. `COMPUTED` requires
  `produced_by: "deterministic:*"`. An `INFERRED` number → `inferredNumberAnnotation`
  (`is_canonical_metric: false`).
- `aggregation` ∈ `RAW · SUM · COUNT · MEAN · MEDIAN · RATE · RATIO · MIN · MAX · LAST · FIRST`.
- `normalizeUnit` / `normalizeCurrency` are **metadata mapping only** — `value` is never
  converted, no FX is fetched. Tests 14, 15.

## G. Deduplication (`evidence/dedup.js`)

| result | rule |
|---|---|
| `EXACT_DUPLICATE` | identical `raw_source_hash` |
| `SOURCE_DUPLICATE` | same `(provider, external_id)`, both non-null |
| `CONTENT_DUPLICATE` | identical `canonical_content_hash` (verbatim + numeric + structured) |
| `POSSIBLE_DUPLICATE` | identical `normalized_content_hash` but different verbatim/source — **held, never merged** |
| `DISTINCT` | none of the above |

No semantic/LLM dedup. `dedupeBatch` keeps POSSIBLE_DUPLICATE items as their own groups + a cross-reference. Tests 9–12.

## H. Source quality (`evidence/source_quality.js`)

Returns **two** scores, deliberately distinct (spec §H):

- `attestation` — confidence the source really contains this content (completeness,
  extractability, timestamp availability, authenticity).
- `veracity_support` — how much this source supports the underlying claim being
  objectively true, **capped per source category** (`REVIEW` 0.25, `SOCIAL_COMMENT` 0.2,
  `TRANSACTION` 0.9, `ANALYTICS_EVENT` 0.9, …).

Reason codes include `OPINION_SOURCE_LIMITS_VERACITY`. This is **not** ASTRA-11B's
`ConfidenceAssessment` (that scores a conclusion). Test 13.

## J. Temporal (`evidence/temporal.js`)

4 non-interchangeable time kinds: `event_time`, `publication_time`, `capture_time`,
`ingestion_time`, plus `observation_window {start,end}`. `freshness(temporal, referenceTimeISO)`
→ `{ age_days_by_kind, effective_age_days, freshness_band }` where band ∈
`FRESH ≤30 · RECENT ≤90 · AGING ≤365 · STALE · FUTURE(<0) · UNKNOWN`. **Requires** a caller
reference time — never `Date.now()`. Fails closed on an unparseable timestamp. Test 16.

## K. Subject resolution boundary (`evidence/subject_resolution.js`)

`RESOLVED` (explicit `subject_id`) · `UNRESOLVED` · `AMBIGUOUS` (≥2 candidates, never
auto-picked). `resolution_method` is always `EXPLICIT_ONLY`. No fuzzy matching, no LLM.
Test 17.

## L. Privacy / redaction contract (`ingestion/redaction.js`) — hook only

`SENSITIVE_CLASSES = EMAIL · PHONE · NAME · ADDRESS · ACCOUNT_IDENTIFIER · FREE_FORM_PERSONAL`.
`classifyValue` deterministically detects EMAIL / PHONE / ACCOUNT_IDENTIFIER; NAME /
ADDRESS / FREE_FORM are declared via `markedFields`, never guessed. `buildRedactionPlan` →
deterministic plan (+ `plan_hash`); `applyRedaction` → shape-preserving mask + manifest.
**Nothing is redacted automatically** — this is a contract for a later gate. Test 19.

## M. EvidenceBatch (`evidence/evidence_batch.js`)

`{ batch_id, source_count, observation_count, accepted[], rejected[], quarantined[],
duplicates{possible_duplicates,…}, warnings[], schema_versions[], envelope_hashes[]
(sorted), observation_hashes[] (sorted), content_hash }`. `content_hash` is
order-independent — identical input → identical batch hash. Tests 7, 20.

## N. Fail-closed matrix

| condition | outcome |
|---|---|
| unknown envelope field / missing required / bad timestamp / start>end | REJECTED |
| unsupported source_category | REJECTED |
| no adapter matches | REJECTED |
| adapter `validate` fails | REJECTED |
| adapter `extract` throws | QUARANTINED |
| adapter metadata leaks provider payload | QUARANTINED |
| observation build fails (leak, bad numeric, missing verbatim) | QUARANTINED |
| already ingested (idempotency) | QUARANTINED (`ALREADY_INGESTED`) |
| POSSIBLE_DUPLICATE | flagged on the batch; observation retained, not merged |

## O. Idempotency

`IngestionLedger` keys on `raw_source_hash`. Re-ingesting identical raw input (same
adapter/schema versions) → `ALREADY_INGESTED`, zero new observations, identical hashes.
Tests 7, 8.
