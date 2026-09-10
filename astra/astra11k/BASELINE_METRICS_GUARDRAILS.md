# BASELINE_METRICS_GUARDRAILS — ASTRA-11K

Modules: `baseline.js`, `metrics.js`, `guardrails.js`, `measurement.js`.

## Baseline validation (§4) — `baseline.js`

`BASELINE_STATUS` = `BASELINE_VALID · BASELINE_MISSING · BASELINE_SCOPE_MISMATCH ·
BASELINE_PERIOD_MISMATCH · BASELINE_COHORT_MISMATCH · BASELINE_METRIC_MISMATCH`.

`validateBaseline({ baseline, treatmentScope, metricDefinition, required })` — a baseline is
compatible only when its `metric_definition` matches, its period is `samePeriod` (reusing the
ASTRA-11J primitive), its cohort basis is `cohortComparable`, and its channel / segment /
offer / geography / currency match the treatment scope. **A null/absent baseline is never
synthesised** — when the design requires one and it is missing/incompatible,
`comparison_permitted` is `false` and no comparative claim (or `ADOPT`) is possible (W17–W24).
`validateBaselineValidation` rejects a required non-VALID baseline that still permits comparison.

## Metric contract (§5) — `metrics.js`

`METRIC_CONTRACT_STATUS` = `METRIC_CONTRACT_VALID · PRIMARY_METRIC_REQUIRED ·
PRIMARY_METRIC_NOT_OPERATIONAL · DUPLICATE_METRIC_ROLE`.

- **Exactly one primary metric.** A vague goal (`vender más`, `mejorar resultados`, `improve
  performance`, `grow`, `sell more`) is rejected — it is not an operational, measurable
  quantity (`PRIMARY_METRIC_REQUIRED` / `PRIMARY_METRIC_NOT_OPERATIONAL`, W26, W27).
- Secondary metrics and guardrails are optional lists; a metric appearing in more than one
  role → `DUPLICATE_METRIC_ROLE` (W28).
- `validateMetricContract` requires a `METRIC_CONTRACT_VALID` contract to have one operational
  primary metric and distinct roles.

## Guardrail evaluation (§6) — `guardrails.js`

`GUARDRAIL_STATUS` = `GUARDRAILS_OK · PRIMARY_METRIC_IMPROVED_GUARDRAIL_BREACH ·
GUARDRAIL_DATA_MISSING · NO_GUARDRAILS_DEFINED`.

Per guardrail metric, the before/after direction is checked against a family map
(`cac/cpl/cost/refund/cancellation/churn/…` — higher is worse; `margin/retention/roas/ltv/…` —
lower is worse) with a relative threshold (default 2%). **Any guardrail breach blocks an
automatic winner** — `status` becomes `PRIMARY_METRIC_IMPROVED_GUARDRAIL_BREACH` and
`automatic_winner_declared` is always `false` (W29–W33). Margin degradation is a breach (W31).

## Measurement contract (§15) — `measurement.js`

`MEASUREMENT_STATUS` = `MEASUREMENT_CONTRACT_VALID · MEASUREMENT_CONTRACT_INCOMPLETE ·
MEASUREMENT_DENOMINATOR_INVALID`.

Specifies how the primary metric is read: `primary_metric_definition`, `denominator_definition`
(required for a rate), `denominator_state` (from the ASTRA-11J `denominatorState` — an invalid
denominator ⇒ `MEASUREMENT_DENOMINATOR_INVALID`, W62), `observation_window`, `unit_of_analysis`,
and a controlled `invalidation_conditions[]` list (`TREATMENT_LEAKAGE`, `CONTROL_CONTAMINATION`,
`SCOPE_CHANGE_MID_EXPERIMENT`, `DENOMINATOR_DEFINITION_CHANGE`, `EARLY_STOPPING_WITHOUT_RULE`,
plus any caller additions) (W63, W64).
