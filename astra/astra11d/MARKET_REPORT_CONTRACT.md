# MARKET_REPORT_CONTRACT — ASTRA-11D

Implemented by `research/report.js` (`makeMarketResearchReport`). Reproducible from
identical inputs (order-independent `content_hash`). `generated_by:
'deterministic:ucdm/research'` — an LLM never authors or completes a report.

## Top-level shape

```
{ report_id / content_hash, schema_version, downstream_schema_versions{ucdm, ingest},
  request_id, plan_id, reference_time, scope, generated_by,
  counts{...}, coverage_by_objective{...}, objectives_met, objectives_total,
  confidence_band_histogram{...},
  observation_hashes[] (sorted), fact_ids[] (sorted), conflict_ids[], claim_ids[], insight_ids[],
  excluded_inferred_refs[] (sorted),
  sections{ ...18 sections... }, section_names[],
  evidence_graph_valid: bool, evidence_graph_errors[],
  research_completion,
  caveats[] }
```

## The 18 sections (`report.sections`) — §11

Every section is **either populated or explicitly `{ status: 'UNKNOWN' }`** — a missing
section is never silently omitted (W33). `section_names.length === 18` always.

| section | content |
|---|---|
| `executive_overview` | research status + reason codes + scope + objectives met |
| `research_scope` | scope, objectives, requested scope |
| `evidence_coverage` | the full `MarketCoverage` object |
| `category` | requested vs observed product category |
| `market_observations` | fact ids for `PRODUCT_CATEGORY` / `RATING` / `LOCATION_SERVED` |
| `customer_problem_signals` | `{signal_type, verbatim_hash, evidence_refs}` per signal |
| `competitor_landscape` | `{competitor_count}` |
| `pricing_landscape` | the per-currency `PricingStats` |
| `messaging_landscape` | message-field frequencies |
| `offer_landscape` | offer-component frequencies |
| `demand_signals` | the demand set (`market_size: 'NOT_ESTIMATED'`) |
| `market_sophistication` | the `SophisticationAssessment` (often `UNKNOWN`) |
| `conflicts` | conflict ids (sorted) |
| `gaps` | gap-candidate ids (sorted) |
| `opportunities` | opportunity ids (sorted) |
| `unknowns` | list of sections that are UNKNOWN this run |
| `research_limitations` | completion reason codes |
| `evidence_appendix` | `{count, entries:[{evidence_ref, source_ref}]}` (sorted, deduped) |

## Material-claim evidence linkage — W32 / W9

`evidence_graph_valid` is a **deterministic** check:

1. every `claim.supporting_fact_refs[]` resolves to a fact id present in the report, and
2. every `fact.evidence_refs[]` appears in `sections.evidence_appendix.entries`.

`evidence_graph_errors[]` lists any break. A clean run → `evidence_graph_valid: true`,
`evidence_graph_errors: []` (W32). A dangling claim reference → `false` with the offending
edge named (W9).

## Reproducibility — W34

`report_id = 'mrr_' + sha256(canonical(report without report_id))`. All constituent sets
are stored as **sorted** id/hash arrays, so the same inputs in any provider order produce
the same `content_hash` (benchmark `I:` and `vertical/*` checks).

## Caveats (always present)

- MarketFacts are OBSERVED/COMPUTED only — model knowledge is never a market fact.
- Claims broader than SAMPLE scope require corroboration; thin evidence is downgraded, not asserted.
- Open conflicts are surfaced, never auto-resolved.
- **No ASTRA-11D output may feed production routing or autonomous action.**
