# ASTRA-11K — Experiment Intelligence Engine — DESIGN

**Authorization:** `HUMAN_AUTHORIZATION_ASTRA_11K_EXPERIMENT_INTELLIGENCE_ENGINE_2026_09_09`.
**Mode:** DESIGN + DETERMINISTIC IMPLEMENTATION + ISOLATED OFFLINE BENCHMARKING.

**ASTRA-11K executes nothing.** It does not run experiments, modify campaigns, spend budget,
deploy, or write to production. Its responsibility ends at:
**diagnosis → hypothesis → design → prioritization → evaluation → structured decision.**
No ASTRA-11K output may feed production routing or autonomous action.

Deterministic-first — Node.js, small modules, `crypto` only, no LLM in the core logic, no
network, no DB, no clock (`referenceTime` caller-supplied). Same valid input ⇒ same
`report_id`.

## Pipeline

```
Validated Funnel/Revenue Evidence (ASTRA-11J)
  -> ExperimentOpportunity        opportunity.js
  -> Hypothesis (IF/FOR/THEN/BECAUSE)   hypothesis.js
  -> Variable Classification + contamination   variables.js
  -> Baseline Validation           baseline.js   (reuses 11J time_window / cohort / channel)
  -> Metric Contract               metrics.js
  -> Experiment Design             design.js
  -> Guardrails                    guardrails.js
  -> Risk Assessment               risk.js
  -> Time-to-Signal                time_to_signal.js
  -> Priority                      priority.js
  -> Measurement Contract          measurement.js
  -> Statistical Discipline        statistics.js
  -> Causal Claim Policy           causality.js
  -> Evaluation                    evaluation.js
  -> Decision                      decision.js
  -> Registry Entry                registry.js
  -> Integrity Attestation         integrity.js
  -> ExperimentIntelligenceReport  report.js · engine.js
```

`engine.runExperimentIntelligence({ opportunity | funnelRevenueResult, experimentSpec,
referenceTime })` is the single orchestrator. Every stage validates fail-closed.

## Modules (`astra/src/commercial/experiment_intelligence/` — 20 modules, ~1,408 LoC, `crypto` only)

| module | responsibility | § |
|---|---|---|
| `opportunity.js` | `ExperimentOpportunity` intake; `extractOpportunities(11J result)`; no monetary impact assumed unless 11J calculated it | 1 |
| `hypothesis.js` | IF/FOR/THEN/BECAUSE; `mechanism_is_proven_causality: false`; MALFORMED when incomplete | 2 |
| `variables.js` | independent/dependent/controlled/confounders/external; `MULTI_VARIABLE_CONTAMINATION` → `CAUSAL_ATTRIBUTION_NOT_IDENTIFIABLE` | 3 |
| `baseline.js` | `BASELINE_VALID / MISSING / SCOPE_MISMATCH / PERIOD_MISMATCH / COHORT_MISMATCH / METRIC_MISMATCH` | 4 |
| `metrics.js` | exactly one operational primary metric; `PRIMARY_METRIC_REQUIRED`; vague goals rejected | 5 |
| `guardrails.js` | `PRIMARY_METRIC_IMPROVED_GUARDRAIL_BREACH`; `automatic_winner_declared: false` | 6 |
| `design.js` | 6 design types, each declaring what conclusion it permits; causal blockers | 7 |
| `statistics.js` | `DESCRIPTIVE_DIFFERENCE / STATISTICAL_TEST_NOT_AVAILABLE / EVIDENCE_INSUFFICIENT / CLAIM_NOT_PERMITTED / EVALUATION_VALID`; never fabricates p/CI/power/n/MDE | 8 |
| `causality.js` | `CAUSAL_CLAIM_PERMITTED / NOT_PERMITTED / ATTRIBUTION_NOT_IDENTIFIABLE` | 14 |
| `time_to_signal.js` | `IMMEDIATE / SHORT / MEDIUM / LONG / TIME_TO_SIGNAL_UNKNOWN`; only from supplied inputs; `fabricated_window: false` | 9 |
| `priority.js` | quantitative only with a validly-calculated impact; otherwise `ORDINAL_PRIORITY`; `fabricated_precision: false` | 10 |
| `risk.js` | 7 qualitative dimensions; `probability_estimated: false`, `numeric_risk_score: null` | 11 |
| `measurement.js` | `MeasurementContract` — metric definition, denominator, window, unit, invalidation conditions | 5/15 |
| `evaluation.js` | reads a supplied outcome; `difference_type: 'DESCRIPTIVE_DIFFERENCE'` always; `fabricated_result: false` | 13-prep |
| `decision.js` | `ADOPT / REJECT / ITERATE / RETEST / HOLD / INSUFFICIENT_EVIDENCE / INCONCLUSIVE`; `winner_forced: false` | 13 |
| `registry.js` | `ExperimentRegistryEntry` (8 lifecycle statuses); content-addressed `experiment_id`; duplicate-id detection | 12 |
| `integrity.js` | self-scan attestation — network/llm/db/deploy = 0, executes nothing | integrity |
| `report.js` | 34-section `ExperimentIntelligenceReport`; deterministic `report_id`; boundary section | 15 |
| `engine.js` | orchestrator; `provenance_note` | — |

## Never fabricated

Expected lift · statistical significance · causality · sample size · benchmarks · conversions ·
results · revenue · margin · probabilistic confidence score · p-values · confidence intervals ·
power · MDE · a time-to-signal window · a "$X" opportunity figure not validly calculated by
ASTRA-11J.

## Fail-closed conditions

Invalid metrics · scope / cohort / period mismatch · absent required baseline · absent primary
metric · invalid denominators · experiment contamination · multiple variables changed without
isolation · insufficient evidence · incomplete outcome · malformed hypothesis contract.
