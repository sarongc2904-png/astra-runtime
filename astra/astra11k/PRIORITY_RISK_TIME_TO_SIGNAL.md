# PRIORITY_RISK_TIME_TO_SIGNAL — ASTRA-11K

Modules: `priority.js`, `risk.js`, `time_to_signal.js`.

## Time-to-signal (§9) — `time_to_signal.js`

`SIGNAL_CLASSES` = `IMMEDIATE · SHORT · MEDIUM · LONG · TIME_TO_SIGNAL_UNKNOWN`.

`estimateTimeToSignal` uses **only** supplied inputs:
`primary_event_frequency_per_week`, `sales_cycle_days`, `outcome_delay_days`,
`min_events_for_signal`. `estimated_days = ceil(min_events / freq × 7) + sales_cycle_days +
outcome_delay_days`; classed `IMMEDIATE ≤ 7`, `SHORT ≤ 30`, `MEDIUM ≤ 90`, `LONG` above.

**No default window is assumed.** No inputs → `TIME_TO_SIGNAL_UNKNOWN` with
`estimated_days: null`. `fabricated_window: false` always; `validateTimeToSignal` enforces it
(W49–W52).

## Prioritization (§10) — `priority.js`

`FACTORS` = `expected_impact · evidence_strength · execution_cost · time_to_signal ·
reversibility · operational_risk · affected_funnel_value`. Default weights
`cm-experiment-priority-w1`, caller-configurable.

- **`mode: 'QUANTITATIVE'`** only when a **validly-calculated** economic impact
  (`status ∈ {OBSERVED, COMPUTED, MODELLED}`) is present **and** covered weight-mass ≥ 0.5 —
  then a `priority_score` and an `ordinal_priority` are produced (W53).
- **`mode: 'ORDINAL_PRIORITY'`** otherwise — qualitative inputs yield
  `PRIORITY_HIGH / MEDIUM / LOW` (or `ORDINAL_PRIORITY_UNRANKED`) with **no precise score**
  (`priority_score: null`) (W54, W56).
- **`fabricated_precision: false`** always — no "87.43%" is invented (W55).
- `is_analytical: true`, `triggers_action: false`, `autonomous: false` — `validatePriority`
  enforces the analytical/non-autonomous contract and the null-score rule for ordinal mode
  (W57).

## Risk model (§11) — `risk.js`

`RISK_DIMENSIONS` (7): `financial_risk · operational_risk · customer_experience_risk ·
measurement_risk · reversibility · contamination_risk · dependency_risk`. Each rated
`LOW / MEDIUM / HIGH / UNKNOWN` from explicit inputs, with a few deterministic derivations
where a signal exists (multi-variable contamination → `contamination_risk: HIGH`; controlled
design → `reversibility: LOW`; W60).

`overall_qualitative_risk` is a label (`HIGH / MEDIUM_HIGH / MEDIUM / LOW / UNKNOWN`).
**Qualitative risk is never converted into a probability** — `probability_estimated: false`,
`numeric_risk_score: null`; `validateRisk` enforces both (W58, W59).
