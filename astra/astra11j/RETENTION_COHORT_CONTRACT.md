# RETENTION_COHORT_CONTRACT — ASTRA-11J

Modules: `retention.js`, `cohort.js`, `time_window.js`.

## Cohort basis (§G) — `cohort.js`

Every count carries a `cohort_basis ∈ {PERIOD_METRIC, COHORT_METRIC, UNKNOWN_BASIS}`:
- `COHORT_METRIC` — the count belongs to a named cohort (e.g. leads acquired in `2026-08`)
  and is tracked forward.
- `PERIOD_METRIC` — the count is everything observed in a bounded period, regardless of when
  the entities entered.
- `UNKNOWN_BASIS` — no period and no cohort.

`cohortComparable(up, down)` blocks a division / comparison across different bases
(`COHORT_BASIS_MISMATCH`) or different cohort ids (`DIFFERENT_COHORT`). A booking
conversation-to-sale rate where CONVERSATION is `PERIOD_METRIC` and SOLD is `COHORT_METRIC`
is **not** computed (W64 / benchmark `period_vs_cohort_confusion`).

## RetentionAssessment (§V) — `retention.js`

```
{ retention_id, counts{ACTIVATED,RETAINED,RENEWED,UPSELL,CROSS_SELL,CHURN,REPEAT_PURCHASE},
  rates{ activation_rate, repeat_purchase_rate, renewal_rate, retention_rate, upsell_rate,
         cross_sell_rate, churn_rate },
  expansion_revenue{ amount, currency, cohort_basis, evidence_refs } | { status: 'UNKNOWN' },
  churn_probability: null, cohort_basis_preserved: true }
```

- Each rate is a scope-validated transition (`requireSamePeriod: false` — retention is a
  forward-looking cohort metric). `retention_rate = RETAINED / ACTIVATED`, `renewal_rate =
  RENEWED / RETAINED`, `churn_rate = CHURN / ACTIVATED` — all only on a matched cohort/period.
- `expansion_revenue` records its `cohort_basis` (`COHORT_METRIC` when every expansion
  observation names a cohort, else `UNKNOWN_BASIS`) (W59, W60).
- **`churn_probability` is always `null`** — a probability requires a validated predictive
  model, which ASTRA-11J does not build. `validateRetention` enforces `churn_probability ===
  null` and `cohort_basis_preserved === true` (W61).

## Activation / repeat / renewal / upsell / cross-sell / expansion

All supported as counts + rates; the subscription benchmark fixture exercises
`ACTIVATED → RETAINED → RENEWED` on a `2026-08` cohort plus an `EXPANSION` revenue
observation. A "strong acquisition / poor retention" split surfaces as a `RETENTION_PROBLEM`
diagnosis finding and/or a `POOR_RETENTION` bottleneck candidate (W62).

## LTV cohort discipline (§P)

An `OBSERVED_COHORT_LTV` estimate carries its `window_days` and is described as *"a floor, not
a lifetime projection"* — a 7-day cohort window is not silently extrapolated to a lifetime
value (benchmark `short_cohort`, W45).
