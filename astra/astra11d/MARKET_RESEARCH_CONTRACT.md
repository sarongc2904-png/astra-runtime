# MARKET_RESEARCH_CONTRACT — ASTRA-11D

`research_schema_version = ucdm-research-1.0.0` · on `ucdm-1.0.0` (11B) + `ucdm-ingest-1.0.0` (11C)

## A. MarketResearchRequest (`research/request.js`)

| field | req | notes |
|---|---|---|
| `business_ref` | ✅ | |
| `product_or_service` | ✅ | |
| `objectives` | ✅ | ≥1 of the 12 objectives, or `UNKNOWN` |
| `category`, `geography`, `target_customer` | | default `UNKNOWN` |
| `research_questions` | | free-text array |
| `research_scope` | | `{scope: SAMPLE\|LOCAL\|CATEGORY\|GLOBAL}` (default SAMPLE) |
| `time_window`, `language`, `locale`, `constraints` | | as known |
| `request_id` | (computed) | `mrq_` + content hash |

**Objectives:** `MARKET_OVERVIEW · CUSTOMER_PROBLEMS · COMPETITOR_LANDSCAPE · PRICING · OFFERS · MESSAGING · DEMAND_SIGNALS · TRENDS · CATEGORY_SOPHISTICATION · MARKET_GAPS · PURCHASE_BARRIERS · ALTERNATIVES`. `UNKNOWN` stays valid.

## B. ResearchPlan (`research/plan.js`)

`{ request_id, objectives, scope, questions, evidence_needed[], preferred_source_categories[],
min_evidence_coverage, geographic_requirements, temporal_requirements, stopping_criteria, plan_id }`.

`evidence_needed[]` = `{ for_objective, fact_types[], min_facts, min_distinct_sources }`.

**Deterministic guards:** plan objectives ⊆ request objectives · plan scope ≤ request scope ·
`preferred_source_categories` ⊆ ASTRA-11C categories.

**`enforceAuthorizedScope(candidatePlan, request)`** → `{authorized, violations[]}` — the
gate any *experimental LLM-authored* plan must pass. Fails closed on: mismatched
`request_id`, added/dropped objective, widened scope, sub-minimum threshold, non-canonical
source category. The LLM cannot silently change the research objective.

## C. Evidence collection boundary (`research/source_provider.js`)

`ResearchSourceProvider = { provider_id, provider_kind: 'FIXTURE'|'LIVE', supports(plan), collect(plan, {referenceTime}) }`.

- `makeFixtureProvider({provider_id, records})` — returns frozen provider-shaped rows,
  stamped with `captured_at = referenceTime`. Deterministic.
- `makeLiveProviderStub(id)` — `provider_kind: 'LIVE'`; `collect()` **throws**. LIVE
  research is not authorized in this gate.
- Provider rows go straight to **ASTRA-11C `ingest()`** — 11D adds no second ingestion
  path, and provider payloads still pass 11C's provider-neutrality boundary.

## D. MarketFact (`research/market_fact.js`)

`{ fact_id, fact_type, value, evidence_refs[], source_classes[], source_ref, subject_ref,
observation_window, observed_at, geography, confidence (ConfidenceAssessment), status, ... }`.

**`status ∈ {OBSERVED, COMPUTED}` only.** An `INFERRED` observation → **not a fact** (→
`excluded_inferred`). `COMPUTED` facts are aggregates, `produced_by: 'deterministic:ucdm/research'`.
`validateMarketFact` rejects any fact whose `source_classes` include `INFERRED`, or whose
confidence is not a deterministic `ConfidenceAssessment`.

**Fact types:** `COMPETITOR_PRICE · ADVERTISED_PROMISE · PUBLISHED_CLAIM · OFFER_COMPONENT ·
OBSERVED_GUARANTEE · OBSERVED_CTA · REVIEW_COMPLAINT · REVIEW_DESIRE · REVIEW_STATEMENT ·
LOCATION_SERVED · PRODUCT_CATEGORY · RATING · REVIEW_COUNT`.

Extraction is deterministic per observation type / structured value — a `QUOTE` becomes
`REVIEW_COMPLAINT`/`REVIEW_DESIRE` only if the observation already carries an aspect tag
(`structured_values.aspect`), else `REVIEW_STATEMENT`. No LLM classification.

## E. MarketClaim (`research/market_claim.js`)

`{ claim_id, statement, statement_source: 'deterministic:ucdm/research', supporting_fact_refs[],
contradicting_fact_refs[], conflict_refs[], coverage{...}, confidence, scope, requested_scope,
warnings[], status, aggregate_ref }`.

**`status`:**
- `INSUFFICIENT` — `fact_count < plan.min_facts` or `distinct_sources < plan.min_distinct_sources`
- `CONFLICTED` — an open conflict covers the supporting facts
- `PARTIALLY_SUPPORTED` — some but not all supporting facts are conflicted
- `SUPPORTED` — otherwise

**Scope gate:** if `scope > SAMPLE` and (`distinct_sources < SCOPE_MIN_SOURCES[scope]` or
`confidence.score < plan.min_evidence_coverage`) → scope forced to `SAMPLE` + warning, and
`SUPPORTED` → `PARTIALLY_SUPPORTED`. **No global claim from insufficient local evidence.**

## F. Conflict (`research/conflict.js`)

`MarketConflict = { conflict_id, kind ∈ {VALUE_CONFLICT, CATEGORICAL_CONFLICT, PRESENCE_CONFLICT},
fact_type, subject_ref, fact_refs[], source_refs[], detail, status: 'OPEN', resolution: null }`.

Numeric relative tolerance 2%. Deterministic pairwise comparison in `fact_id` order.
Conflicts are **never auto-resolved**.

## G. Aggregation (`research/aggregate.js`)

`FactAggregate = { aggregate_id, fact_type, subject_ref, fact_count, distinct_source_count,
distinct_source_refs[], evidence_refs[], conflict_count, distribution, confidence, fact_ids[] }`.
`distribution` = `{kind: NUMERIC, min/max/mean/n}` or `{kind: CATEGORICAL, n, counts}`.

Produces **COMPUTED roll-up facts**: categorical → `{pattern, present_count, sample_size,
fraction}`; numeric → `{aggregate: RANGE, min, max, mean, sample_size}`. Both
`status: COMPUTED`, `produced_by: deterministic:ucdm/research`.

## H. Confidence (`validation/confidence.js`, reused)

Every fact, aggregate, and claim carries a deterministic `ConfidenceAssessment`
(`score`, `band`, `reason_codes[]`, `signals`, `weights_version`,
`produced_by: 'deterministic:ucdm/confidence'`). Signals are derived from evidence count,
distinct sources, recency (vs `referenceTime`), agreement/conflict counts, and source
quality (ASTRA-11C `attestation`). The LLM never invents a confidence value.

## I. MarketResearchReport (`research/report.js`)

`{ report_id / content_hash, request_id, plan_id, reference_time, scope, generated_by:
'deterministic:ucdm/research', counts{...}, coverage_by_objective{...}, objectives_met,
confidence_band_histogram, observation_hashes[] (sorted), fact_ids[] (sorted),
conflict_ids[], claim_ids[], insight_ids[], excluded_inferred_refs[], caveats[] }`.

Order-independent → reproducible from identical inputs. `caveats` always includes
*"No ASTRA-11D output may feed production routing or autonomous action."*

## Market insights (`research/insight.js`)

`MarketInsight = { insight_id, objective, statement, statement_source, claim_refs[],
supporting_fact_refs[], conflict_refs[], scope, confidence, confidence_band, status,
is_recommendation: false }`. Derived only from `SUPPORTED` / `PARTIALLY_SUPPORTED` /
`CONFLICTED` claims, tied to an authorized objective. **`is_recommendation` is always
`false`** — ASTRA-11D produces findings, not strategy.
