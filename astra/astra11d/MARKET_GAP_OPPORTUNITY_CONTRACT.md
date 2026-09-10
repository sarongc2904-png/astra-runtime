# MARKET_GAP_OPPORTUNITY_CONTRACT — ASTRA-11D

Implemented by `research/gap_opportunity.js`. **A gap is a hypothesis, never a MarketFact.
An opportunity is recommendation-level but never autonomous and carries no fabricated
numbers.**

## MarketGapCandidate (§8)

```
{ gap_id, kind: 'MarketGapCandidate', is_market_fact: false,
  gap_type, hypothesis, supporting_evidence_refs[], contradicting_evidence_refs[],
  confidence (ConfidenceAssessment), potential_value (band/label — NEVER a number),
  validation_needed[], status ∈ {HYPOTHESIS, VALIDATION_NEEDED}, produced_by }
```

**Gap types:** `underserved_promise · missing_guarantee · weak_proof · unaddressed_segment ·
pricing_gap · channel_gap · service_speed_gap · message_saturation_opportunity`.

| rule | enforcement |
|---|---|
| never a fact | `is_market_fact: false`; `validateGapCandidate` rejects any other value (W24) |
| **never `CONFIRMED`** | `GAP_STATUS` = `{HYPOTHESIS, VALIDATION_NEEDED}` only — `validateGapCandidate` rejects `CONFIRMED` even if a heuristic/LLM proposes it (W24) |
| `supporting_evidence_refs` required, non-empty | `makeMarketGapCandidate` throws otherwise |
| `potential_value` is a band/label, never a number | `validateGapCandidate` |
| deterministic confidence | `validateGapCandidate` |

`deriveGapCandidates` runs conservative deterministic heuristics over the landscapes (e.g.
guarantee present in < 34% of competitors **and** customers voice fear/risk →
`missing_guarantee`; proof messaging < 34% → `weak_proof`; ≥2 speed complaints and few
competitors advertise speed → `service_speed_gap`; per-currency price spread ≥ 2x →
`pricing_gap`). Every candidate is emitted as `VALIDATION_NEEDED`.

## MarketOpportunity (§9)

```
{ opportunity_id, kind: 'MarketOpportunity', level: 'RECOMMENDATION',
  opportunity, problem, target_segment, supporting_claim_refs[] (required, non-empty), gap_refs[],
  expected_mechanism, uncertainty, recommended_validation[] (required, non-empty),
  priority_inputs{impact_hint, effort_hint, confidence_band}, confidence,
  expected_lift: 'NOT_ESTIMATED',            ← numeric business lift is NEVER fabricated
  requires_human_validation: true,
  autonomous: false,
  produced_by: 'deterministic:ucdm/research' }
```

| rule | enforcement |
|---|---|
| `supporting_claim_refs` required, non-empty | `makeMarketOpportunity` throws otherwise (W25) |
| no fabricated numeric lift | `expected_lift` is the literal `'NOT_ESTIMATED'`; `validateOpportunity` rejects a number (W25) |
| non-autonomous | `autonomous: false`, `requires_human_validation: true` — `validateOpportunity` enforces both (W25, benchmark `dim/recommendation grounding`) |
| carries validation guidance | `recommended_validation[]` required |
| `priority_inputs` are hints only | ASTRA-11B `recommendation.computePriority` (the deterministic scorer) is **not** invoked here — that is a later phase |

`deriveOpportunities` ties each gap candidate to `SUPPORTED` / `PARTIALLY_SUPPORTED` claims
about a related `fact_type` (`relatedFactType` map). An opportunity with no supporting
claim is not emitted.

## Boundary

- A gap/opportunity is a **proposal for a human**, not an action. Nothing in ASTRA-11D
  executes, schedules, or routes anything.
- The report references gaps and opportunities by **id only** (`sections.gaps`,
  `sections.opportunities`) — the full objects live in the engine result for a human to
  inspect.
