# EXPERIMENT_OPPORTUNITY — ASTRA-11K

Module: `opportunity.js`. Schema `ucdm-experiment-1.0.0`.

## ExperimentOpportunity (§1)

```
{ opportunity_id, schema_version, kind: 'ExperimentOpportunity',
  opportunity_kind ∈ {BOTTLENECK, LEAKAGE, OPPORTUNITY, DIAGNOSIS, MANUAL},
  source_ref, source_module, title,
  affected_transition{from,to}|null, impacted_metric, impacted_dimension, business_priority,
  evidence_quality ∈ {STRONG, MODERATE, WEAK, INSUFFICIENT, UNKNOWN},
  baseline_available, baseline_ref,
  economic_impact: { amount, currency, status, methodology, input_refs }
              | { status: 'NOT_VALIDLY_CALCULATED', note },
  scope{ period, cohort_basis, channel, segment, offer, geography, currency },
  evidence_refs[], reason_codes[] }
```

## Intake

- `extractOpportunities(funnelRevenueResult)` deterministically projects every ASTRA-11J
  `bottleneck` and `leakage` into an `ExperimentOpportunity`, carrying its `evidence_refs`,
  `reason_codes`, `business_priority` (from the matching ASTRA-11J priority band), and the
  scope of the first funnel observation.
- **No monetary opportunity is assumed unless ASTRA-11J calculated it validly.** An ASTRA-11J
  economic-impact entry with `status ∈ {OBSERVED, COMPUTED, MODELLED}` and a non-null amount
  is carried through with its `methodology` and `input_refs`; anything else becomes
  `economic_impact: { status: 'NOT_VALIDLY_CALCULATED', note }` (W2, benchmark `dim/opportunity
  intake`).

## Validation

`validateOpportunity` checks the controlled `opportunity_kind` and `evidence_quality`, and
rejects a `{OBSERVED|COMPUTED|MODELLED}` economic impact with no amount. A
`NOT_VALIDLY_CALCULATED` impact is always acceptable — it is the honest default.

## Scope carried forward

The opportunity's `scope` (period, cohort basis, channel, segment, offer, geography, currency)
is the default `treatment_scope` for the whole downstream pipeline and is what every
baseline-compatibility check is run against.
