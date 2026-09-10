# NUMERIC_INTEGRITY_CONTRACT — ASTRA-11B

> **An LLM-generated number must never become a canonical commercial metric.**

Implemented by `astra/src/commercial/validation/numeric_integrity.js`, enforced by
`validate_entity.js` on every field declared `kind: 'metric'`.

## 1. Rule

A canonical numeric field is valid only if it is a `ProvenanceValue` whose `source_class`
is one of:

| allowed | why |
|---|---|
| `OBSERVED` | measured from a real artifact (must carry evidence refs) |
| `USER_PROVIDED` | asserted by the business owner |
| `COMPUTED` | produced by a deterministic module — `produced_by` **must** start with `deterministic:` |

Anything else is rejected:

- `source_class: 'INFERRED'` on a metric field → **REJECT** ("an INFERRED number must stay annotation text").
- `source_class: 'COMPUTED'` but `produced_by: 'llm:...'` (or missing) → **REJECT** ("an LLM node cannot label output COMPUTED").
- a bare number (no `ProvenanceValue` wrapper) on a metric field → **REJECT** ("a raw number cannot be canonical without provenance").

## 2. Where INFERRED numbers are allowed

Inside `prov` (non-metric) fields whose value is narrative — e.g. `Market.tam_note`,
`Insight.statement`, `Recommendation.recommendation_text`. A number in that prose is
**annotation**. The guard `assertInferredNumbersStayText` additionally rejects an
`INFERRED` value that tries to self-flag `canonical_metric: true`.

Pattern in the schema: a metric has a `_note` / narrative sibling.
`Market` has both `tam_note` (prov, narrative, INFERRED ok) and `tam_value` (metric,
INFERRED forbidden). `Competitor` has `pricing_note` (prov) and `price_points` (metric).

## 3. Canonical metric fields in the model

`Market.tam_value` · `MarketObservation.magnitude` · `Competitor.price_points` ·
`Segment.size` · `VoiceOfCustomerObservation.frequency_bucket` ·
`Offer.price/margin/capacity` · `Product.list_price` · `Campaign.spend` ·
`Opportunity.expected_value` · `Sale.amount` · `RevenueEvent.amount` ·
`RetentionEvent.mrr_delta` · `UpsellEvent.amount` ·
`FunnelStage.entered/exited` · `FunnelTransition.entered/exited/conversion_rate/dropoff_rate/cost/value` ·
`Metric.value/target/baseline` · `Recommendation.priority` ·
`Experiment.baseline/target` · `ExperimentResult.lift/p_value/sample_size` ·
`ConfidenceAssessment.score`.

## 4. Deterministic producers (the only sources of `COMPUTED`)

| module | produces |
|---|---|
| `deterministic:ucdm/funnel_math` | `conversion_rate`, `dropoff_rate`, `cost_per_exit`, `value_per_entered`, stage `entered`/`exited` |
| `deterministic:ucdm/confidence` | `ConfidenceAssessment.score` |
| `deterministic:ucdm/recommendation` | `Recommendation.priority` |
| `deterministic:ucdm/<revenue|retention|cohort|unit_economics>` | ASTRA-11C analytics module (spec pending) — revenue rollups, LTV/CAC, retention curves, experiment stats |

`funnel_math.computeTransition` also **fails closed** on structurally impossible inputs
(`exited > entered`, negative counts) so an impossible transition can never be stored, and
`checkConsistency` lets a validator re-verify a stored `FunnelTransition`
(`conversion_rate + dropoff_rate == 1`, rates in `[0,1]`).

## 5. Tests

| test | asserts |
|---|---|
| 4 | `tam_value` as `INFERRED` → rejected |
| 5 | `tam_value` as `COMPUTED(deterministic:…)` → accepted |
| 5b | `COMPUTED` with `produced_by: 'llm:…'` → rejected |
| 10 | funnel math deterministic + `exited > entered` throws + stored transition with `INFERRED` conversion_rate rejected |
| "numeric integrity: a bare number…" | `Sale.amount: 500` (bare) → rejected; `OBSERVED(500,[ref])` → accepted |
| 14 | `ConfidenceAssessment.score` is deterministic, `produced_by: deterministic:ucdm/confidence` |
