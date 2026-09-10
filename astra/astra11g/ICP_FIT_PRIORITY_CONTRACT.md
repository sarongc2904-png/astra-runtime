# ICP_FIT_PRIORITY_CONTRACT — ASTRA-11G

Modules: `icp_fit.js`, `attractiveness.js`, `priority.js`, `disqualification.js`.

## ICP Fit (§Q)

See `ICP_CONTRACT.md`. Key rules: deterministic, configurable weights (W44), per-dimension
score is a real number or `null`, `total_score` is `null` and band `UNKNOWN` when covered
weight-mass < `MIN_COVERAGE_FOR_SCORE` (0.5) (W43, W45). `validateIcpFit` enforces the null
rule and the `[0,1]` range.

## SegmentAttractiveness (§R)

`assessAttractiveness` — deterministic weighted score, configurable weights
(`cm-attractiveness-w1`). Inputs and their controlled score maps:

| input | source |
|---|---|
| `problem_severity` | segment status → CRITICAL/HIGH/MODERATE/LOW score |
| `urgency` | urgency assessment level |
| `budget_signal` | budget assessment signal |
| `solution_fit`, `accessibility`, `retention_potential` | business-supplied `[0,1]` |
| `observed_demand` | saturating fn of the segment's deduped OBSERVED demand |
| `competitive_saturation` | business-supplied, or `1 − sophistication_stage/5` from ASTRA-11D |
| `sales_friction` | business-supplied, or derived from contradiction status |

`attractiveness_score` is `null` / band `UNKNOWN` below 0.5 covered weight-mass.

**ATTRACTIVENESS ≠ MARKET SIZE.** Every assessment carries a `market_size` block that repeats
*"ATTRACTIVENESS IS INDEPENDENT OF MARKET SIZE. Market size is not estimated here."* plus the
observed counts and any supplied external estimate (default `'UNKNOWN'`). `validateAttractiveness`
enforces the statement and rejects a fabricated `N% of the market` (W46, W47).

## SegmentPriority (§S)

`assessPriority` — deterministic weighted score (`cm-priority-w1`, configurable) over
`fit · attractiveness · confidence · evidence_coverage · strategic_relevance · accessibility`.

```
{ priority_id, segment_id, signals, weights, weights_version,
  priority_score|null, priority_band ∈ {P1,P2,P3,P4,UNRANKED},
  reason_codes[], uncertainty,
  is_analytical: true, triggers_action: false, autonomous_targeting: false, note }
```

- Score/band computed only when covered weight-mass ≥ 0.5; otherwise `UNRANKED` +
  `INSUFFICIENT_PRIORITY_COVERAGE`.
- `uncertainty = 1 − min(1, covered weight-mass)`.
- **Priority is analytical only** — `validatePriority` rejects `triggers_action !== false` or
  `autonomous_targeting !== false`. Priority never creates, targets, or launches a campaign
  (W48, W49).
- Deterministic: identical inputs ⇒ identical `priority_id` (W48).

## Disqualification / negative persona (§T) — `disqualification.js`

`DISQUALIFIER_TYPES` (commercial only): `NO_PROBLEM_FIT · OUTSIDE_SERVICE_GEOGRAPHY ·
CANNOT_IMPLEMENT · WRONG_USE_CASE · INCOMPATIBLE_BUDGET · REGULATORY_INCOMPATIBILITY ·
REQUIRED_FEATURE_UNAVAILABLE · NO_DECISION_AUTHORITY_AND_NO_PATH · EXPLICITLY_INCOMPATIBLE`.

Disqualifiers are **asserted by the business with evidence**; ASTRA validates, it does not
invent exclusion rules. A disqualifier is `rejected` when: the type is unrecognized, the
description/type matches `DEMOGRAPHIC_EXCLUSION_RE` (women/men/age/income/students/…), **or**
there is no supporting evidence. `validateDisqualifier` requires an accepted disqualifier to
have a recognised type, evidence, and no demographic wording (W50, W51). No insulting or
identity-based exclusion category is permitted.
