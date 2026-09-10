# MARKET_COVERAGE_CONTRACT — ASTRA-11D

Implemented by `research/coverage.js`, `research/pricing.js`, `research/landscapes.js`,
`research/sophistication.js`, `research/completion.js`.

## MarketCoverage (`research/coverage.js`)

```
{ coverage_id, source_count, distinct_observation_count, competitor_count, review_count,
  review_source_count, source_categories{CAT: n}, source_diversity (0..1),
  geographic_coverage{requested, observed[], match, unknown},
  time_coverage{earliest, latest, span_days, newest_age_days, window_requested, within_window, stale},
  category_coverage{requested, observed_categories[], match},
  dedup{possible_duplicates, duplicate_member_count, distinct_groups},
  generated_by: 'deterministic:ucdm/research/coverage' }
```

- `source_count` = **distinct** `source_id` (an exact-duplicate raw source is quarantined by
  ASTRA-11C and never counted — W30).
- `distinct_observation_count` = distinct `canonical_content_hash` (identical content across
  sources does not inflate — W29).
- `review_count` = customer `QUOTE` observations from `REVIEW`-category sources (a `RATING`
  observation is not an extra review).
- `source_diversity` = `min(1, distinct_categories / min(4, source_count))` — deterministic.
- `time_coverage.stale` = newest evidence age > **180 days** vs the caller `referenceTime`
  (W28). No implicit clock.

### assessGlobalExtrapolation(coverage, scope) — the SAMPLE vs GLOBAL gate

`SAMPLE` is always allowed. Broader scope **fails closed** unless the coverage minimums
are met:

| scope | min sources | min diversity | min competitors |
|---|---|---|---|
| `SAMPLE` | 1 | 0.0 | 0 |
| `LOCAL` | 3 | 0.34 | 2 |
| `CATEGORY` | 5 | 0.5 | 3 |
| `GLOBAL` | 8 | 0.6 | 5 |

Returns `{ allowed, downgrade_to: 'SAMPLE', reasons[] }`. This is what lets ASTRA distinguish
*"6 of 8 observed competitors…"* (a SAMPLE claim) from *"The market…"* (a GLOBAL claim) —
**global extrapolation from insufficient local evidence fails closed** (W12, benchmark
`adv/single_competitor`).

## Pricing intelligence (`research/pricing.js`)

`PricingObservation` (`OBSERVED` only — no inferred price, W14):
```
{ pricing_id, pricing_kind, amount, currency, currency_known, unit, observed_at,
  subject_ref, source_ref, evidence_refs[], status: 'OBSERVED' }
```

**Pricing kinds:** `LISTED_PRICE · STARTING_PRICE · RANGE · SUBSCRIPTION · ONE_TIME · FINANCING · DISCOUNT`.

`computePricingStats` (W15, W16): **strictly per-currency**, never mixed, never FX-converted.
```
by_currency: { <CUR>: { currency, sample_size, min, max, median, mean,
  distribution_buckets{ '<0.75x','0.75-1.25x','1.25-2x','>=2x' } (relative to the per-currency median),
  by_pricing_kind{...}, confidence, status: 'COMPUTED', produced_by: 'deterministic:ucdm/research/pricing' } }
currencies[], mixed_currency: bool
```
`amount` is never touched — no conversion. `currency` is always explicit.

## Landscapes (`research/landscapes.js`)

| landscape | observed fields | frequency |
|---|---|---|
| **Offer** (§3) | `core_product_service, bonus, guarantee, discount, financing, trial, delivery_time, scarcity, urgency, bundle, support, implementation` | `computeComponentFrequencies` → `{component, present_count, competitor_count, fraction}` COMPUTED (W17) |
| **Message** (§4) | `headline, promise, pain, desired_outcome, mechanism, proof, cta, objection_addressed, identity_language` | each `MessageObservation` keeps `verbatim_text` + `verbatim_hash` traceable to ASTRA-11C (W18) |
| **Customer signals** (§5) | `pain, desire, fear, objection, complaint, purchase_barrier, alternative` | one observation per signal — **no clustering** (W19); untagged quotes are not signals (no model guessing) |
| **Demand** (§6) | `review_volume, review_recency, search_evidence, business_count, transaction_evidence, lead_volume, public_engagement` | each labelled `DIRECT` / `PROXY` / `UNKNOWN`; `market_size: 'NOT_ESTIMATED'` always (W20, W21) |

`review_volume` and `review_recency` are `COMPUTED` (deterministic, from review `QUOTE`
observations vs `referenceTime`).

## Market sophistication (`research/sophistication.js`) — analytical contract only (§7)

```
{ assessment_id, stage ∈ {STAGE_1..STAGE_5, UNKNOWN}, rationale, signals, evidence_refs[] (required, non-empty),
  confidence (required, deterministic), classifier: 'deterministic-conservative', produced_by }
```

- `evidence_refs` **mandatory** — `makeSophisticationAssessment` throws on empty (W23).
- `confidence` **required** — must be a deterministic `ConfidenceAssessment`.
- Default is `UNKNOWN`. A conservative deterministic heuristic raises it only with broad
  multi-competitor evidence (`competitor_count ≥ 4` **and** mechanism+proof messaging
  fractions ≥ 0.6). It **never forces a stage from thin evidence** (W22). No runtime LLM.

## Research completion (`research/completion.js`) — §10

```
{ completion_id, status ∈ {COMPLETE_FOR_SCOPE, PARTIAL, INSUFFICIENT, BLOCKED},
  scope, reason_codes[], detail, normalized_source_records,
  generated_by: 'deterministic:ucdm/research/completion' }
```

**Reason codes:** `LOW_SOURCE_COUNT · LOW_SOURCE_DIVERSITY · STALE_EVIDENCE ·
GEOGRAPHIC_MISMATCH · MISSING_PRICING · MISSING_CUSTOMER_SIGNAL · CONFLICTED_EVIDENCE ·
SOURCE_FAILURE`.

- `BLOCKED` — zero normalized source records.
- `INSUFFICIENT` — `source_count < 2`, or both pricing and customer signal missing.
- `PARTIAL` — one or more reason codes.
- `COMPLETE_FOR_SCOPE` — none.

**An LLM may never mark research complete** — `generated_by` is a deterministic producer
(W26, W27, W28).
