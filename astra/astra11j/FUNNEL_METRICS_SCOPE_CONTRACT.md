# FUNNEL_METRICS_SCOPE_CONTRACT — ASTRA-11J

Modules: `transition_metrics.js`, `scope_validation.js`, `time_window.js`, `cohort.js`,
`channel.js`, `attribution.js`, `dropoff.js`, `internal_baseline.js`, `delta.js`.

## Transition metrics (§C §D) — `transition_metrics.js`

```
{ metric_id, from_stage, to_stage, upstream_count, downstream_count,
  status ∈ {VALID, UNKNOWN, INVALID_DENOMINATOR, SCOPE_MISMATCH, MISSING_COUNT},
  conversion_rate|null, drop_off_count|null, drop_off_rate|null, overflow_flag,
  scope, causal_claim: false, denominator_note, evidence_refs[] }
```

`conversion_rate = downstream / upstream` is produced **only** when:
1. both counts are present (`MISSING_COUNT` otherwise),
2. `compareScope` returns `same_scope` (`SCOPE_MISMATCH` otherwise, with the exact mismatched
   fields), and
3. `denominatorState(upstream) === 'VALID'` (`INVALID_DENOMINATOR` for 0 / missing / negative).

`drop_off_count = upstream − downstream`, `drop_off_rate = 1 − conversion_rate` — **never
described as causality** (`causal_claim: false`; `validateTransitionMetric` rejects `true`).
When downstream > upstream the transition is flagged `overflow_flag` and drop-off is clamped
to 0 (a scope/double-count signal).

## Scope validation (§C) — `scope_validation.js`

`compareScope(up, down)` checks, and returns every mismatch in `mismatches[]`:

| field | rule |
|---|---|
| `period` | `samePeriod` (strict start/end/tz identity) for a single ratio; `periodsComparable` for a period-vs-period delta |
| `cohort` | `cohortComparable` — same `cohort_basis`; if `COHORT_METRIC`, same cohort id |
| `channel` | `channelsComparable` on the normalized channel |
| `segment` / `offer` / `geography` | exact match |
| `currency` | exact match when either side has one |

## Time windows (§F) — `time_window.js`

Every metric preserves `{ start, end, tz, aggregation, span_days }`. `periodsComparable`
returns `TIMEZONE_MISMATCH` / `AGGREGATION_MISMATCH` / `DIFFERENT_PERIOD` /
`MISSING_OR_INVALID_PERIOD`. **Different periods are never silently compared** (W7).

## Cohort discipline (§G) — `cohort.js`

`COHORT_BASIS` = `PERIOD_METRIC · COHORT_METRIC · UNKNOWN_BASIS`. A January-generated-leads →
March-purchases metric (`COHORT_METRIC`, cohort `2026-01`) is not comparable to a
January-purchases metric (`PERIOD_METRIC`) — `cohortComparable` returns
`COHORT_BASIS_MISMATCH` / `DIFFERENT_COHORT` / `UNKNOWN_COHORT_BASIS` (W8).

## Channel / attribution (§H §I) — `channel.js`, `attribution.js`

`CHANNELS` (12, provider-neutral). The source field **does not prove causal attribution**.
`AttributionContext` = `SOURCE_REPORTED / FIRST_TOUCH / LAST_TOUCH / USER_PROVIDED / UNKNOWN`
with `multi_touch_model: 'NOT_FABRICATED'`, `causal: false`. `validateAttribution` enforces
both — **multi-touch attribution is never fabricated and sequence is never treated as cause**
(W17–W19).

## Volume vs efficiency (§E) — `dropoff.js`

`summarizeFunnel` reports `volume` (per-stage counts), `top_of_funnel_volume`, `efficiency`
(per-transition conversion + loss), `largest_absolute_loss`, `weakest_conversion`, and an
explicit note: *"a weak downstream result can be a volume problem even when conversion is
strong"* (W13, W14).

## Internal baselines (§X) — `internal_baseline.js`

`BASELINE_KINDS` = `PREVIOUS_PERIOD · PREVIOUS_COHORT · CHANNEL · SEGMENT · OFFER · CREATIVE ·
LOCATION · SALESPERSON · EXPERIMENT_VARIANT · USER_PROVIDED_EXTERNAL`. `compareToBaseline`
validates comparability via `compareScope` **before** `change_declared` can be true.
`validateBaselineComparison` rejects a declared change against a non-comparable baseline and
requires any external industry benchmark to be `USER_PROVIDED_EXTERNAL` (W65, W66).

## Delta (§Y §Z) — `delta.js`

`computeDelta` distinguishes `absolute_delta`, `relative_delta` and (for rates)
`percentage_point_delta` — e.g. 10% → 15% is +5 pp = +50% relative (W67). Always
`statistical_significance: 'NOT_ASSESSED'`, `causal: false` — **ASTRA-11J never declares
statistical significance** (W68); `validateDelta` enforces it.
