# COMPETITOR_REPORT_CONTRACT — ASTRA-11E

Module: `competitor/report.js` (`buildReport`). Reproducible from identical inputs
(order-independent `content_hash`). `generated_by: 'deterministic:ucdm/competitor'`.

## Top-level shape

```
{ report_id / content_hash, schema_version: 'ucdm-competitor-1.0.0',
  downstream_schema_versions: { ucdm: 'ucdm-1.0.0', ingest: 'ucdm-ingest-1.0.0', research: 'ucdm-research-1.0.0' },
  request_ref, reference_time, generated_by, counts{...},
  sections{ ...22 sections... }, section_names[],
  clusters, evidence_graph_valid: bool, evidence_graph_errors[],
  research_completion, caveats[] }
```

## The 22 sections (§T)

Every section is **either populated or explicitly `{ status: 'UNKNOWN' }`** — a missing
section is never silently omitted (W39). `section_names.length === 22` always.

| section | content |
|---|---|
| `executive_summary` | research status + reason codes + competitor count |
| `scope` | objectives, scope |
| `coverage` | the full `CompetitorCoverage` object |
| `competitor_roster` | `[{competitor_id, name, identity_status, ambiguous_with, source_refs, evidence_refs}]` |
| `category_map` | distinct observed categories |
| `positioning_matrix` | the `PositioningMap` (placements + axes) |
| `offer_matrix` | the competitive-matrix `offer` row |
| `pricing_matrix` | the competitive-matrix `price` row |
| `message_landscape` | message-saturation counts |
| `proof_landscape` | proof-profile ids (UNKNOWN when no competitor has proof) |
| `funnel_cta_landscape` | `[{competitor, touchpoints}]` (UNKNOWN when none observed) |
| `creative_patterns` | distinct observed angles |
| `saturation` | the full market-saturation object |
| `strength_hypotheses` | hypothesis ids (sorted) |
| `weakness_hypotheses` | hypothesis ids (sorted) |
| `threat_assessments` | `[{competitor_ref, level}]` |
| `differentiation_gaps` | gap ids (sorted) |
| `opportunity_candidates` | opportunity ids (sorted) |
| `conflicts` | conflict ids (sorted) |
| `unknowns` | list of sections that are UNKNOWN this run |
| `limitations` | completion reason codes |
| `evidence_appendix` | `{count, entries:[{evidence_ref, source_ref}]}` (sorted, deduped) |

## Evidence-graph validity — W38

`evidence_graph_valid` is a **deterministic** check: every strength/weakness/gap's
`supporting_evidence_refs` must resolve into `sections.evidence_appendix` (two symbolic
placeholders — `MESSAGE_LANDSCAPE`, `PRICING_STATS` — are exempt as landscape-level
citations). `evidence_graph_errors[]` names any break. A clean run →
`evidence_graph_valid: true`, `evidence_graph_errors: []`.

## Reproducibility — W40

`report_id = 'cmr_' + sha256(canonical(report without report_id))`. All constituent sets
are stored as **sorted** id arrays, so the same inputs in any provider/competitor order
produce the same `content_hash`.

## Caveats (always present)

- Competitor facts are OBSERVED/COMPUTED only — model knowledge is never observed competitor evidence.
- `NOT_OBSERVED_IN_SAMPLE` is never equated with `ABSENT`.
- Strength / weakness / gap / opportunity are hypotheses requiring validation.
- Proof presence is observed; proof truth is not asserted.
- **No ASTRA-11E output may feed production routing or autonomous action.**

## Model-knowledge separation — §U / W41, W47, W48

The engine reads only ASTRA-11D evidence objects. It invents no competitor, price, offer,
review count, rating, claim, CTA, proof, funnel, ad, or market share. Provider-specific
ids never appear in any output (W41). No output is a production-routing input or an action
directive (`provenance_note`: *"No production routing. No autonomous action."*).
