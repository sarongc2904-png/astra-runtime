# COMPETITIVE_MATRIX_CONTRACT — ASTRA-11E

Modules: `competitor/competitive_matrix.js`, `competitor/saturation.js`,
`competitor/threat_assessment.js`, `competitor/coverage.js`.

## CompetitiveMatrix (§K)

```
{ matrix_id, columns: [competitor_ref], row_names: [...11 dimensions...],
  rows: [ { row, dimension_expressible: bool,
            cells: { <competitor_ref>: { status, value, evidence_refs[] } } } ],
  legend, generated_by: 'deterministic:ucdm/competitor' }
```

**Rows:** `positioning · promise · price · offer · mechanism · guarantee · proof · cta ·
channel · customer_problem · creative_angle`.

**Cell status:**
| status | meaning |
|---|---|
| `OBSERVED` | seen in the sample for this competitor |
| `NOT_OBSERVED_IN_SAMPLE` | not seen for this competitor, **but seen for a peer** — this is **NOT proof of absence** |
| `UNKNOWN` | not seen for anyone / the dimension is not expressible from the sample |
| `CONFLICTED` | sources disagree for this competitor on this dimension |

`NOT_OBSERVED_IN_SAMPLE` is **never equated with `ABSENT`** — the legend says so explicitly
and `validateMatrix` + tests enforce the 4-value enum (W21). A dimension only becomes
`NOT_OBSERVED_IN_SAMPLE` for a blank cell when at least one competitor expressed it
(`dimension_expressible: true`); otherwise a blank is `UNKNOWN`.

## Market saturation (§L)

`buildMarketSaturation` → per pattern:
```
{ pattern, competitor_count, sample_size, frequency, evidence_refs[], coverage_caveat }
```
**Patterns:** `price_messaging · free_consultation · financing · guarantee ·
same_day_messaging · testimonial_use · before_after_use · whatsapp_cta · discount_led ·
technology_led`. Each detector is deterministic over a competitor's models.
`extrapolation: 'NONE_BEYOND_SAMPLE'`; every pattern carries a `coverage_caveat`
("N/M observed competitors — sample only, not a market-wide rate"). **No semantic
market-wide extrapolation** (W22, W23).

## Message saturation (§M)

`buildMessageSaturation` → counts of the **controlled** `ucdm-competitor-message-v1`
taxonomy labels across competitors. `UNKNOWN` permitted. No uncontrolled LLM taxonomy in
canonical statistics (W25).

## CompetitorThreatAssessment (§Q)

```
{ threat_id, competitor_ref, level ∈ {LOW, MEDIUM, HIGH, UNKNOWN}, score, known_signal_count,
  signals: { audience_overlap, offer_overlap, geographic_overlap, price_overlap, proof_strength,
             channel_overlap, review_signal, differentiation_overlap },
  weights_version, weights, produced_by: 'deterministic:ucdm/competitor/threat' }
```

- **Deterministic** weighted sum over 8 overlap/strength signals, normalized by the weight
  of the *known* signals only. `DEFAULT_WEIGHTS` documented; `weights` is **configurable**
  per call (`weights_version: 'custom'` — W31).
- `< 3` known signals → `level: 'UNKNOWN'` (`validateThreat` enforces — W30).
- **Competitor size is not automatically threat** — there is no size input; the `note`
  states this (W32).

## Coverage + completion (§S)

`computeCoverage` →
```
{ competitors_observed, competitors_resolved, competitors_ambiguous,
  attribute_coverage, pricing_coverage, offer_coverage, message_coverage, proof_coverage,
  funnel_coverage, creative_coverage, geographic_coverage, time_coverage{latest, newest_age_days, stale, stale_competitors} }
```

`assessCompletion` → `status ∈ {COMPLETE_FOR_SCOPE, PARTIAL, INSUFFICIENT, BLOCKED}` with
**reason codes**: `LOW_COMPETITOR_COUNT · LOW_ATTRIBUTE_COVERAGE · STALE_DATA ·
IDENTITY_AMBIGUITY · MISSING_PRICING · MISSING_OFFER_DATA · MISSING_MESSAGE_DATA ·
MISSING_PROOF_DATA · SOURCE_FAILURE · CONFLICTED_DATA`.

- `BLOCKED` — zero competitors / zero normalized source records.
- `INSUFFICIENT` — `< 2` competitors, or both message and pricing missing.
- `PARTIAL` — any reason code.
- `COMPLETE_FOR_SCOPE` — none.

**An LLM may never mark competitor research complete** — `generated_by:
'deterministic:ucdm/competitor/completion'` (W35, W36, W37).
