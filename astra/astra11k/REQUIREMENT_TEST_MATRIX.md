# ASTRA_11K — REQUIREMENT_TEST_MATRIX

Harness: node astra/tests/astra11k.test.js -> ASTRA11K_TEST_RESULT pass=88 fail=0 (W1..W80 + C1..C8 + W-matrix completeness).
Benchmark: node astra/benchmarks/astra11k/run_experiment_intelligence_benchmark.js -> ASTRA11K_BENCHMARK_RESULT pass=51 fail=0 (8 scenarios + 26 adversarial + 16 dimensions).

| Req | § | Module(s) | Test | Status |
|---|---|---|---|---|
| W1 opportunity intake from an ASTRA-11J result | 1 | `opportunity.js` | W1 | PASS |
| W2 no monetary opportunity assumed unless 11J calculated it validly | 1 | `opportunity.js` | W2 | PASS |
| W3 opportunity contract validates | 1 | `opportunity.js` | W3 | PASS |
| W4 hypothesis IF/FOR/THEN/BECAUSE structure | 2 | `hypothesis.js` | W4 | PASS |
| W5 hypothesis BECAUSE is never proven causality | 2 | `hypothesis.js` | W5 | PASS |
| W6 malformed hypothesis rejected (missing fields OR causal language) | 2 | `hypothesis.js` | W6 | PASS |
| W7 well-formed hypothesis has no missing fields | 2 | `hypothesis.js` | W7 | PASS |
| W8 hypothesis references its opportunity | 2 | `hypothesis.js` | W8 | PASS |
| W9 deterministic hypothesis id | 2 | `hypothesis.js` | W9 | PASS |
| W10 expected_direction is controlled | 2 | `hypothesis.js` | W10 | PASS |
| W11 variable classification: independent/dependent/controlled/confounders/external | 3 | `variables.js` | W11 | PASS |
| W12 single isolated variable -> ISOLATED | 3 | `variables.js` | W12 | PASS |
| W13 two+ relevant variables without isolation -> MULTI_VARIABLE_CONTAMINATION | 3 | `variables.js` | W13 | PASS |
| W14 contamination -> CAUSAL_ATTRIBUTION_NOT_IDENTIFIABLE | 3/14 | `variables.js,causality.js` | W14 | PASS |
| W15 a confounder that also changes triggers contamination (Simpson-like) | 3 | `variables.js` | W15 | PASS |
| W16 variable map deterministic + valid | 3 | `variables.js` | W16 | PASS |
| W17 valid compatible baseline -> BASELINE_VALID | 4 | `baseline.js` | W17 | PASS |
| W18 missing required baseline -> BASELINE_MISSING, comparison not permitted | 4 | `baseline.js` | W18 | PASS |
| W19 baseline scope mismatch -> BASELINE_SCOPE_MISMATCH | 4 | `baseline.js` | W19 | PASS |
| W20 baseline period mismatch -> BASELINE_PERIOD_MISMATCH | 4 | `baseline.js` | W20 | PASS |
| W21 baseline cohort mismatch -> BASELINE_COHORT_MISMATCH | 4 | `baseline.js` | W21 | PASS |
| W22 baseline metric-definition mismatch -> BASELINE_METRIC_MISMATCH | 4 | `baseline.js` | W22 | PASS |
| W23 a non-valid required baseline blocks ADOPT | 4/13 | `baseline.js,decision.js` | W23 | PASS |
| W24 baseline validation is deterministic + valid | 4 | `baseline.js` | W24 | PASS |
| W25 exactly one primary metric | 5 | `metrics.js` | W25 | PASS |
| W26 missing primary metric -> PRIMARY_METRIC_REQUIRED | 5 | `metrics.js` | W26 | PASS |
| W27 vague goal is not an operational primary metric | 5 | `metrics.js` | W27 | PASS |
| W28 a metric cannot hold two roles | 5 | `metrics.js` | W28 | PASS |
| W29 guardrails defined -> evaluated | 6 | `guardrails.js` | W29 | PASS |
| W30 guardrail breach -> PRIMARY_METRIC_IMPROVED_GUARDRAIL_BREACH | 6 | `guardrails.js` | W30 | PASS |
| W31 margin degradation is a guardrail breach | 6 | `guardrails.js` | W31 | PASS |
| W32 no automatic winner on guardrail breach | 6 | `guardrails.js` | W32 | PASS |
| W33 guardrail breach -> decision HOLD | 6/13 | `guardrails.js,decision.js` | W33 | PASS |
| W34 metric + guardrail evaluation deterministic + valid | 5/6 | `metrics.js,guardrails.js` | W34 | PASS |
| W35 design declares what conclusion it permits | 7 | `design.js` | W35 | PASS |
| W36 BEFORE_AFTER_DESCRIPTIVE -> no causal by default | 7 | `design.js` | W36 | PASS |
| W37 CONTROL_VS_TREATMENT -> causal possible only if all conditions valid | 7 | `design.js` | W37 | PASS |
| W38 contaminated control blocks causal evaluation | 7 | `design.js` | W38 | PASS |
| W39 treatment leakage blocks causal evaluation | 7 | `design.js` | W39 | PASS |
| W40 incomparable treatment population blocks causal evaluation | 7 | `design.js` | W40 | PASS |
| W41 ASTRA never declares statistical significance | 8 | `statistics.js` | W41 | PASS |
| W42 ASTRA never fabricates p-value / CI / power / sample size / MDE | 8 | `statistics.js` | W42 | PASS |
| W43 no valid test data -> DESCRIPTIVE_DIFFERENCE / STATISTICAL_TEST_NOT_AVAILABLE / NOT_PERMITTED | 8 | `statistics.js` | W43 | PASS |
| W44 supplied statistics validated structurally only | 8 | `statistics.js` | W44 | PASS |
| W45 malformed supplied statistics -> not valid, no significance | 8 | `statistics.js` | W45 | PASS |
| W46 causal policy: correlation / before-after / attribution never yield causality | 14 | `causality.js` | W46 | PASS |
| W47 causal claim permitted only for a clean controlled design | 14 | `causality.js` | W47 | PASS |
| W48 attribution-report basis does not create causality | 14 | `causality.js` | W48 | PASS |
| W49 time to signal only from supplied inputs | 9 | `time_to_signal.js` | W49 | PASS |
| W50 no inputs -> TIME_TO_SIGNAL_UNKNOWN, no estimate | 9 | `time_to_signal.js` | W50 | PASS |
| W51 delayed outcome -> MEDIUM/LONG signal class | 9 | `time_to_signal.js` | W51 | PASS |
| W52 time to signal deterministic + valid | 9 | `time_to_signal.js` | W52 | PASS |
| W53 quantitative priority only with a validly-calculated economic impact | 10 | `priority.js` | W53 | PASS |
| W54 qualitative inputs -> ORDINAL_PRIORITY, no precise score | 10 | `priority.js` | W54 | PASS |
| W55 no fabricated precision like 87.43% | 10 | `priority.js` | W55 | PASS |
| W56 ordinal priority is one of the controlled values | 10 | `priority.js` | W56 | PASS |
| W57 priority is analytical, non-autonomous | 10 | `priority.js` | W57 | PASS |
| W58 risk: 7 dimensions, qualitative only | 11 | `risk.js` | W58 | PASS |
| W59 risk classification is deterministic + valid | 11 | `risk.js` | W59 | PASS |
| W60 contamination drives contamination_risk HIGH | 11 | `risk.js` | W60 | PASS |
| W61 measurement contract: primary metric read fully specified | 15 | `measurement.js` | W61 | PASS |
| W62 zero/invalid denominator -> MEASUREMENT_DENOMINATOR_INVALID | 15 | `measurement.js` | W62 | PASS |
| W63 measurement contract lists invalidation conditions | 15 | `measurement.js` | W63 | PASS |
| W64 early stopping recorded as an invalidation condition | 15 | `measurement.js` | W64 | PASS |
| W65 evaluation: a difference is always DESCRIPTIVE_DIFFERENCE | 13 | `evaluation.js` | W65 | PASS |
| W66 incomplete outcome -> OUTCOME_INCOMPLETE | 13 | `evaluation.js` | W66 | PASS |
| W67 insufficient sample/events -> EVIDENCE_INSUFFICIENT | 13 | `evaluation.js` | W67 | PASS |
| W68 no fabricated result | 13 | `evaluation.js` | W68 | PASS |
| W69 descriptive design -> evaluation descriptive_only, no causal interpretation | 13 | `evaluation.js` | W69 | PASS |
| W70 decision never forces a winner; INCONCLUSIVE is valid | 13 | `decision.js` | W70 | PASS |
| W71 incomplete/insufficient -> INSUFFICIENT_EVIDENCE | 13 | `decision.js` | W71 | PASS |
| W72 contamination + primary improved -> ITERATE (not ADOPT) | 13 | `decision.js` | W72 | PASS |
| W73 decision is analytical, non-autonomous; a causal claim needs a basis | 13 | `decision.js` | W73 | PASS |
| W74 clean controlled experiment, primary up, guardrails ok -> ADOPT possible with causal basis | 13 | `decision.js` | W74 | PASS |
| W75 registry entry: deterministic content-addressed experiment_id | 12 | `registry.js` | W75 | PASS |
| W76 registry lifecycle status is one of the controlled values | 12 | `registry.js` | W76 | PASS |
| W77 duplicate supplied experiment id detected | 12 | `registry.js` | W77 | PASS |
| W78 report: 34 sections, deterministic report_id, evidence graph valid | 15 | `report.js` | W78 | PASS |
| W79 report boundary section asserts no execution / no deploy / no prod write / no autonomy | 15 | `report.js` | W79 | PASS |
| W80 integrity attestation clean: network/llm/db/deploy = 0, cost $0 | integrity | `integrity.js` | W80 | PASS |
| C1 ASTRA-11B compatibility | compat | schema reuse | C1 | PASS |
| C2 ASTRA-11J compatibility (consumes a funnel/revenue result unchanged) | compat | engine.js (consumes 11J result) | C2 | PASS |
| C3 ASTRA-11F/H/I schema-version constants exported | compat | index.js schema constants | C3 | PASS |
| C4 reuses ASTRA-11J scope/period/cohort primitives (no parallel system) | compat | baseline.js (11J primitives) | C4 | PASS |
| C5 no network dependency | compat | all experiment_intelligence/* scan | C5 | PASS |
| C6 no production DB / no experiment execution constructs | compat | all experiment_intelligence/* scan | C6 | PASS |
| C7 ASTRA-10 freeze unchanged | compat | benchmarks/astra10ah/freeze.json | C7 | PASS |
| C8 benchmark isolation + stable hashes | compat | benchmarks/astra11k/ + report.js | C8 | PASS |
