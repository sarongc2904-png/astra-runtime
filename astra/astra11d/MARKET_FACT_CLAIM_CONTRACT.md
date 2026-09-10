# MARKET_FACT_CLAIM_CONTRACT — ASTRA-11D

`research_schema_version = ucdm-research-1.0.0`. Implemented by `research/market_fact.js`,
`research/conflict.js`, `research/aggregate.js`, `research/market_claim.js`,
`research/insight.js`. **Model knowledge is never observed market evidence.**

## MarketFact (`research/market_fact.js`)

```
{ fact_id, fact_type, value, evidence_refs[], source_classes[], source_ref, subject_ref,
  observation_window, observed_at, geography, confidence (ConfidenceAssessment),
  status: 'OBSERVED' | 'COMPUTED', [produced_by / contributing_fact_ids for COMPUTED] }
```

| rule | enforcement |
|---|---|
| `status` is `OBSERVED` or `COMPUTED` **only** | `FACT_STATUS`; `validateMarketFact` |
| an `INFERRED` observation is **never** a fact | `extractFacts` → `excluded_inferred[]` (W7) |
| only `OBSERVED` / `USER_PROVIDED` observations produce an `OBSERVED` fact | `OBSERVED_FACT_CLASSES` |
| a `COMPUTED` fact must name `produced_by: 'deterministic:ucdm/research'` | `validateMarketFact` |
| every `OBSERVED` fact carries ≥1 `evidence_ref` | `validateMarketFact` (W6) |
| confidence is a deterministic `ConfidenceAssessment` (`deterministic:ucdm/confidence`) | `validateMarketFact` (W37) |

**Fact types:** `COMPETITOR_PRICE · ADVERTISED_PROMISE · PUBLISHED_CLAIM · OFFER_COMPONENT ·
OBSERVED_GUARANTEE · OBSERVED_CTA · REVIEW_COMPLAINT · REVIEW_DESIRE · REVIEW_STATEMENT ·
LOCATION_SERVED · PRODUCT_CATEGORY · RATING · REVIEW_COUNT`.

Extraction is deterministic per observation type / `structured_values`. A customer `QUOTE`
becomes `REVIEW_COMPLAINT` / `REVIEW_DESIRE` **only** if the observation already carries an
aspect tag (`structured_values.aspect`) — otherwise `REVIEW_STATEMENT`. No model
classification.

## MarketConflict (`research/conflict.js`)

```
{ conflict_id, kind ∈ {VALUE_CONFLICT, CATEGORICAL_CONFLICT, PRESENCE_CONFLICT},
  fact_type, subject_ref, fact_refs[], source_refs[], detail, status: 'OPEN', resolution: null }
```

- Compared only for `CONFLICT_ELIGIBLE_TYPES` (facts that *should* be consistent:
  `COMPETITOR_PRICE`, `OBSERVED_GUARANTEE`, `OBSERVED_CTA`, `OFFER_COMPONENT`,
  `LOCATION_SERVED`, `PRODUCT_CATEGORY`, `ADVERTISED_PROMISE`, `PUBLISHED_CLAIM`).
  `RATING` / `REVIEW_COUNT` / `REVIEW_*` are **distributional** — natural variation is not a
  conflict.
- Numeric relative tolerance: **2%**. Deterministic pairwise, in `fact_id` order.
- `status: 'OPEN'`, `resolution: null` — **surfaced, never auto-resolved** (W10, W27).

## FactAggregate + COMPUTED roll-ups (`research/aggregate.js`)

Groups by `fact_type::subject_ref` → `{ fact_count, distinct_source_count, evidence_refs[],
conflict_count, distribution, confidence, fact_ids[] }`.

Produces `COMPUTED` roll-up facts:
- categorical → `{ pattern, present_count, sample_size, fraction }` ("N of M")
- numeric → `{ aggregate: RANGE, min, max, mean, sample_size }`

Both `status: 'COMPUTED'`, `produced_by: 'deterministic:ucdm/research'`.

## MarketClaim (`research/market_claim.js`)

```
{ claim_id, statement, statement_source: 'deterministic:ucdm/research',
  supporting_fact_refs[], contradicting_fact_refs[], conflict_refs[],
  coverage{fact_count, distinct_sources, required_facts, required_sources, met},
  confidence, scope, requested_scope, warnings[], status, aggregate_ref }
```

| `status` | condition |
|---|---|
| `INSUFFICIENT` | `fact_count < plan.min_facts` or `distinct_sources < plan.min_distinct_sources` (W26) |
| `CONFLICTED` | an open conflict covers the supporting facts (W27) |
| `PARTIALLY_SUPPORTED` | some (not all) supporting facts conflicted |
| `SUPPORTED` | otherwise |

**Scope discipline (W12):** a claim broader than `SAMPLE` needs
`distinct_sources ≥ SCOPE_MIN_SOURCES[scope]` (SAMPLE 2, LOCAL 3, CATEGORY 5, GLOBAL 8)
**and** aggregate `confidence.score ≥ plan.min_evidence_coverage`. Otherwise scope is
forced to `SAMPLE` with a recorded `warning` and `SUPPORTED → PARTIALLY_SUPPORTED`. The
engine **never asserts a global claim from a thin local sample**. The claim `statement`
itself is a deterministic template ("N of M observed items…") — the sample framing is
built in.

## MarketInsight (`research/insight.js`)

```
{ insight_id, objective, statement, statement_source, claim_refs[], supporting_fact_refs[],
  conflict_refs[], scope, confidence, confidence_band, status, is_recommendation: false }
```

Derived only from `SUPPORTED` / `PARTIALLY_SUPPORTED` / `CONFLICTED` claims, tied to an
authorized objective (via `FACT_TYPE_OBJECTIVE`). **`is_recommendation` is always
`false`** — an insight is a finding, not strategy. (The one recommendation-level object,
`MarketOpportunity`, is defined in `MARKET_GAP_OPPORTUNITY_CONTRACT.md` and is
non-autonomous with no fabricated numbers.)
