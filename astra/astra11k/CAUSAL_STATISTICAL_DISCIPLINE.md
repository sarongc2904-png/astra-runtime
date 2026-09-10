# CAUSAL_STATISTICAL_DISCIPLINE — ASTRA-11K

Modules: `statistics.js`, `causality.js`.

## Statistical discipline (§8) — `statistics.js`

`STAT_STATUS` = `DESCRIPTIVE_DIFFERENCE · STATISTICAL_TEST_NOT_AVAILABLE ·
STATISTICAL_EVIDENCE_INSUFFICIENT · STATISTICAL_CLAIM_NOT_PERMITTED · STATISTICAL_EVALUATION_VALID`.

- **ASTRA-11K never computes or declares statistical significance.** `assessStatistics`:
  - no primary-metric outcome → `STATISTICAL_TEST_NOT_AVAILABLE`.
  - design does not permit a causal/inferential claim → `STATISTICAL_CLAIM_NOT_PERMITTED`.
  - outcome exists, causal-capable design, **no** externally supplied test →
    `DESCRIPTIVE_DIFFERENCE` (a difference is observed; ASTRA does not test it).
  - externally supplied statistics → **structurally validated only** (`test_name`,
    `computed_by`, `p_value ∈ [0,1]`, `alpha ∈ (0,1)`, positive sample sizes, CI bounds
    ordered). Structurally valid **and** causal-capable design →
    `STATISTICAL_EVALUATION_VALID`; structurally valid but design not causal-capable →
    `STATISTICAL_CLAIM_NOT_PERMITTED`; structural issues → `STATISTICAL_EVIDENCE_INSUFFICIENT`.
- **Never fabricated:** `fabricated_p_value`, `fabricated_confidence_interval`,
  `fabricated_power`, `fabricated_sample_size`, `fabricated_mde` are all `null` on every
  return; `significance_declared_by_astra: false`. `validateStatistics` enforces all of these
  (W41–W45).

## Causal claim policy (§14) — `causality.js`

`CAUSAL_POLICY` = `CAUSAL_CLAIM_PERMITTED · CAUSAL_CLAIM_NOT_PERMITTED ·
CAUSAL_ATTRIBUTION_NOT_IDENTIFIABLE`.

`assessCausality` collects blockers from the variable map (contamination), the design
(not controlled, bad allocation, contaminated control, treatment leakage, incomparable
populations, invalid measurement), the baseline (required and not `BASELINE_VALID`), and the
statistical status (`STATISTICAL_CLAIM_NOT_PERMITTED`).

- `MULTI_VARIABLE_CONTAMINATION` present → `CAUSAL_ATTRIBUTION_NOT_IDENTIFIABLE`.
- no blockers **and** the design permits causal evaluation → `CAUSAL_CLAIM_PERMITTED`.
- otherwise → `CAUSAL_CLAIM_NOT_PERMITTED`.

`inferred_from_correlation`, `inferred_from_before_after`, `inferred_from_attribution_report`
are all `false` on every return — **causality is never inferred from correlation, simple
before/after, simultaneous multi-variable changes, different cohorts, incompatible periods,
attribution reports, or incomplete data**. `validateCausality` enforces the contamination rule
and the no-inference flags (W46–W48).
