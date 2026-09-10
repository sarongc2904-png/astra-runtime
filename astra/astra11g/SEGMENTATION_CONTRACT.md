# SEGMENTATION_CONTRACT — ASTRA-11G

Modules: `segment_taxonomy.js`, `segment_candidate.js`, `segment_membership.js`,
`segment_metrics.js`, `attractiveness.js`, `priority.js`.

## SegmentDimension taxonomy (§C) — `cm-segment-dimension-v1`

`SEGMENT_DIMENSIONS` (18, incl. `UNKNOWN`): `problem · desired_outcome · urgency · awareness ·
solution_usage · alternative_used · budget_signal · purchase_readiness · decision_criterion ·
customer_lifecycle · business_maturity · industry · company_size · role · geography · channel ·
offer_fit · UNKNOWN`.

Closed dimensions carry a controlled value set (`DIMENSION_VALUE_SETS`); open dimensions carry
evidence-grounded free values but the **dimension name is always controlled**. An uncontrolled
dimension normalises to `UNKNOWN` (W8, W9). No LLM-created canonical dimension.

## SegmentCandidate (§D)

```
{ segment_id, schema_version, label, primary_dimension, primary_concept,
  dimension_values[{dimension, value, scope, evidence_refs}],
  supporting_evidence_refs[], contradicting_evidence_refs[],
  observed_sample{ observation_count, deduped_observation_count, unique_source_count,
                   known_customer_count|null, source_refs[], speaker_pseudonyms[] },
  contradiction_status, scope, status, confidence }
```

- Grouped deterministically by `(problem|desired_outcome, canonical_concept)` over **OBSERVED**
  VoC observations; secondary dimensions (urgency/awareness/budget) computed from the same subset.
- **`status`**: `INSUFFICIENT` (< 2 deduped obs) · `HYPOTHESIS` (no identified speakers) ·
  `PARTIAL` (concept under a MIXED/POLARIZED contradiction) · `SUPPORTED` (≥ 2 sources, ≥ 1
  identified speaker, consistent). A `SUPPORTED`/`PARTIAL` segment must carry evidence (W10).
- **Label discipline**: descriptive only; `validateSegmentCandidate` rejects a label matching
  `DEMOGRAPHIC_LABEL_RE` (women/men/age/married/income/…). Business-declared segments are kept
  verbatim with `scope: 'BUSINESS_DECLARED'`.

## Membership (§E)

`assignMembership` — rule-based only. `CONFIRMED` (identified speaker with an OBSERVED
concept-matching observation), `LIKELY_ANALYTICAL` (sample-wide concept, no identified speaker),
`UNKNOWN` (concept match but speaker not identifiable). **Overlap is supported** — the same
speaker is a CONFIRMED member of every matching segment; `overlapReport` lists speakers in ≥ 2
segments (W11, W12). Customers are never force-assigned.

## Size discipline (§F)

`SegmentMetrics`: `observed_sample_count`, `observed_source_count`, `known_customer_count` (or
null), `estimated_external_market_size { value, source, basis }`. `basis` is `UNKNOWN` unless
the business supplies an estimate **with a source**. `share_of_sample` is null unless a
meaningful sample denominator is given, and is labelled "fraction of the SUPPLIED sample — not
a market share". `validateSegmentMetrics` rejects any `N% of the market` string and requires
`fabricated_market_share === false` (W14).

## SegmentAttractiveness (§R)

Deterministic weighted score over 9 inputs (`problem_severity, urgency, budget_signal,
solution_fit, accessibility, observed_demand, competitive_saturation, sales_friction,
retention_potential`), configurable weights (`cm-attractiveness-w1`). Score is `null` / band
`UNKNOWN` when covered weight-mass < 0.5. Carries an explicit `market_size` block stating
**"ATTRACTIVENESS IS INDEPENDENT OF MARKET SIZE"**; `validateAttractiveness` enforces that
statement and rejects any fabricated market-share figure (W46, W47).

## SegmentPriority (§S)

Deterministic weighted score over `fit, attractiveness, confidence, evidence_coverage,
strategic_relevance, accessibility` (`cm-priority-w1`, configurable). Output: `priority_score`
(or null), `priority_band ∈ {P1,P2,P3,P4,UNRANKED}`, `reason_codes[]`, `uncertainty`. Always
`is_analytical: true`, `triggers_action: false`, `autonomous_targeting: false` — priority
never targets a production campaign (W48, W49).
