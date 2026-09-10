# BOTTLENECK_DIAGNOSIS_CONTRACT — ASTRA-11J

Modules: `bottleneck.js`, `revenue_leakage.js`, `diagnosis.js`, `priority.js`.

## FunnelBottleneckCandidate (§W) — `bottleneck.js`

```
{ bottleneck_id, transition{from,to}, metric{conversion_rate,drop_off_count},
  baseline{value, basis}, economic_impact|null, reason_codes[], evidence_refs[], coverage,
  confidence, is_fact: false, causal_claim: false, uses_external_benchmark: false }
```

- Reason codes: `LOW_TRANSITION_RATE_VS_INTERNAL_BASELINE · LARGE_ABSOLUTE_LOSS ·
  HIGH_ECONOMIC_LOSS · STALLED_CYCLE · HIGH_COST_PER_PROGRESSION · POOR_RETENTION`.
- **Baseline is INTERNAL only** — the median of the funnel's other valid transitions
  (`INTERNAL_MEDIAN_OF_VALID_TRANSITIONS`) or a `USER_PROVIDED_BASELINE`. **No external
  industry benchmark** unless the business supplied it (`uses_external_benchmark: false`).
- `economic_impact` is present only when a `value_per_progression` (with its own
  `status ∈ {OBSERVED, COMPUTED, MODELLED}` and `input_refs`) is supplied; it is
  `drop_off_count × value` with the methodology recorded.
- **`is_fact: false`, `causal_claim: false`** — `validateBottleneck` enforces both plus the
  no-external-benchmark rule (W63–W65).

## RevenueLeakageCandidate + OpportunityValue (§AA §AB) — `revenue_leakage.js`

`LEAKAGE_SOURCES` (10): `LOST_LEADS · NO_CONTACT · QUALIFICATION_LOSS · BOOKING_LOSS ·
NO_SHOWS · SALES_LOSS · CHECKOUT_ABANDONMENT · REFUNDS · CHURN · MISSED_EXPANSION`.

Each candidate records `lost_units` (from a valid transition drop-off, always known) and a
`value_estimate`:
- `{ status: 'UNKNOWN', reason: 'NO_VALUE_ASSUMPTION_SUPPLIED' }` — lost units known, monetary
  value **not** produced (W71).
- `{ status ∈ {OBSERVED, MODELLED, COMPUTED}, amount, currency, methodology, assumptions,
  input_refs }` — an explicit figure with its full derivation (W70).

`validateLeakage` requires `is_fact: false`, `fabricated: false`, and — for any non-UNKNOWN
value — a `methodology` and (for modelled/computed) `assumptions`.

**`buildOpportunityValue`** aggregates only the per-source estimates that carry a supplied
value assumption, with `methodology`, `assumptions[]`, `input_refs[]`, `coverage`, and a
`status`. Mixed currencies are **not summed** (`total: null`, `mixed_currency: true`).
`status: 'UNKNOWN'` when no leakage carries a value (W72, W73). **ASTRA never fabricates a
"you are losing $X" figure** by multiplying arbitrary averages.

## FunnelDiagnosis (§AC) — `diagnosis.js`

`DIAGNOSIS_TYPES` = `VOLUME_PROBLEM · CONVERSION_PROBLEM · ECONOMICS_PROBLEM · RETENTION_PROBLEM ·
DATA_QUALITY_PROBLEM · MIXED · INSUFFICIENT_EVIDENCE`.

- `DATA_QUALITY_PROBLEM` — ≥ 50% of transitions unusable, or supplied data-quality issues.
- `VOLUME_PROBLEM` — top-of-funnel volume well below a supplied `volume_target`.
- `CONVERSION_PROBLEM` — a transition materially low and/or a large absolute/economic loss vs
  the internal baseline.
- `ECONOMICS_PROBLEM` — CAC above allowable acquisition cost, negative contribution margin, or
  ROAS < 1.
- `RETENTION_PROBLEM` — retention rate < 0.5 on a matched cohort.

`primary_diagnosis` is the single finding type, `MIXED` if several, `INSUFFICIENT_EVIDENCE` if
none. Always `causal: false`, `is_recommendation: false` — **analytical and non-causal unless
evidence supports causality** (W75, W76).

## Priority (§AD) — `priority.js`

Deterministic weighted score (`cm-funnel-priority-w1`, configurable) over `economic_impact ·
confidence · evidence_coverage · problem_severity · controllability · effort · strategic_fit`.
Below 0.5 covered weight-mass → `UNRANKED` + `INSUFFICIENT_PRIORITY_COVERAGE`. Bands
`P1..P4 / UNRANKED`. Always `is_analytical: true`, `triggers_action: false`, `autonomous:
false` — `validatePriority` enforces it. **Priority never launches, changes, or executes
anything** (W77).
