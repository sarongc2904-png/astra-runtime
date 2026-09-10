# HYPOTHESIS_VARIABLES — ASTRA-11K

Modules: `hypothesis.js`, `variables.js`.

## Hypothesis (§2)

```
{ hypothesis_id, opportunity_id,
  if_change (independent variable), for_population (segment/scope),
  then_expect { metric, direction ∈ {INCREASE,DECREASE,CHANGE,UNKNOWN}, observable_result },
  because_mechanism (hypothesised mechanism),
  mechanism_is_proven_causality: false,
  evidence_basis[], missing_fields[], status ∈ {DRAFT, WELL_FORMED, MALFORMED} }
```

- **The BECAUSE mechanism is never presented as proven causality.**
  `mechanism_is_proven_causality` is always `false`; `validateHypothesis` rejects a `because_`
  mechanism containing causal-certainty language (`proves / proven / causes / will definitely /
  guarantee / is the reason`) (W5, W6).
- A hypothesis missing any of `independent_variable`, `target_population`, `primary_metric`,
  `expected_direction`, `mechanism_hypothesis` is `MALFORMED` and lists its `missing_fields`.
  The engine throws on a malformed hypothesis (fail-closed, W6, benchmark
  `adv/malformed_hypothesis`).
- Deterministic `hypothesis_id` (content hash).

## VariableMap (§3)

```
{ variable_map_id,
  independent_variables[], dependent_variable, controlled_variables[], confounders[],
  external_factors[], also_changing[], relevant_changed_variables[],
  isolation_confirmed, isolation_note,
  contamination_status ∈ {ISOLATED, MULTI_VARIABLE_CONTAMINATION, UNKNOWN},
  causal_attribution }
```

- A **relevant changed variable** is an independent variable **or** a confounder the caller
  marks as `also_changing` during the window.
- **≥ 2 relevant changed variables without `isolation_confirmed` ⇒
  `MULTI_VARIABLE_CONTAMINATION`**, and `causal_attribution` becomes
  `CAUSAL_ATTRIBUTION_NOT_IDENTIFIABLE` (W13, W14). A Simpson-like segmentation shift supplied
  as an `also_changing` confounder triggers the same (W15, benchmark
  `adv/simpson_segmentation_conflict`).
- `validateVariableMap` enforces: multiple changed variables without isolation must be
  `MULTI_VARIABLE_CONTAMINATION`, and contamination must yield
  `CAUSAL_ATTRIBUTION_NOT_IDENTIFIABLE`.
- Deterministic `variable_map_id` (W16).
