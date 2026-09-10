# COMPETITOR_GAP_OPPORTUNITY_CONTRACT — ASTRA-11E

Modules: `competitor/hypotheses.js`, `competitor/differentiation_gap.js`,
`competitor/opportunity.js`.

## Strength / Weakness hypotheses (§J)

```
{ hypothesis_id, kind: 'CompetitorStrengthHypothesis' | 'CompetitorWeaknessHypothesis',
  is_fact: false, competitor_ref, statement,
  supporting_evidence_refs[], contradicting_evidence_refs[], scope, confidence,
  validation_needed[], status: 'HYPOTHESIS', coverage_supports_absence, produced_by }
```

| rule | enforcement |
|---|---|
| strength/weakness are **hypotheses, not facts** | `is_fact: false`, `status: 'HYPOTHESIS'`; `validateHypothesis` (W18, W19) |
| **absence ≠ "competitor lacks X"** unless coverage supports it | a statement containing `lacks` / `missing` / `does not have` requires `coverage_supports_absence: true` — else `validateHypothesis` fails (W20). The engine only sets it true when the observed sample is large enough (`≥ 4` competitors). |
| deterministic confidence | ASTRA-11B `confidence.assess` |

Examples emitted deterministically: strong proof architecture, independently-verifiable
review signal, price transparency (strengths); weak differentiation, weak CTA clarity,
limited offer variety (weaknesses — only when coverage supports the absence).

## CompetitorDifferentiationGap (§N)

```
{ gap_id, kind: 'CompetitorDifferentiationGap', is_fact: false, gap_type, hypothesis,
  supporting_evidence_refs[], contradicting_evidence_refs[], sample_coverage,
  confidence, profitability: 'UNVALIDATED', validation_needed[], status: 'VALIDATION_NEEDED' }
```

**Gap types:** `message_gap · offer_gap · proof_gap · audience_gap · mechanism_gap ·
channel_gap · price_position_gap · service_gap · experience_gap`.

| rule | enforcement |
|---|---|
| a gap is a **hypothesis, never a fact** | `is_fact: false`; `validateGap` (W26) |
| **white space is never labeled profitable without validation** | `profitability` is the literal `'UNVALIDATED'`; `validateGap` rejects any other value (W27) |
| derived from saturation frequency `< 0.34` (rare across the observed sample) | `deriveDifferentiationGaps` — deterministic |
| carries a `sample_coverage` caveat | `{ competitors_observed, note }` |

## CompetitorOpportunityCandidate (§R)

```
{ opportunity_id, kind: 'CompetitorOpportunityCandidate', level: 'RECOMMENDATION',
  opportunity_type, opportunity, rationale, supporting_gap_refs[], supporting_evidence_refs[],
  confidence, uncertainty, recommended_validation[],
  expected_lift: 'NOT_ESTIMATED', requires_human_validation: true, autonomous: false, produced_by }
```

**Opportunity types:** `underused_message · missing_guarantee_pattern · under_addressed_problem ·
weak_proof_category · underserved_audience · offer_whitespace · channel_whitespace`.

| rule | enforcement |
|---|---|
| recommendation-level, **requires human validation before production action** | `requires_human_validation: true`, `autonomous: false`; `validateOpportunity` (W33) |
| **no fabricated revenue lift** | `expected_lift` is the literal `'NOT_ESTIMATED'`; `validateOpportunity` rejects a number (W34) |
| must reference a gap or evidence | `validateOpportunity` |
| tied to a differentiation gap (or a coverage-supported weakness) | `deriveOpportunities` |

Nothing in ASTRA-11E executes, schedules, or routes anything. The report references gaps
and opportunities by **id only**.
