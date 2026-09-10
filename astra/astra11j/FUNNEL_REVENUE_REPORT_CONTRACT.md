# FUNNEL_REVENUE_REPORT_CONTRACT — ASTRA-11J

Modules: `completion.js`, `report.js`. Schema `ucdm-funnel-revenue-1.0.0`.

## FunnelRevenueCompletion (§AF) — `completion.js`

`COMPLETE_FOR_SCOPE · PARTIAL · INSUFFICIENT · BLOCKED`;
`generated_by: 'deterministic:ucdm/funnel_revenue/completion'` — **an LLM can never mark
completion.**

Reason codes: `LOW_FUNNEL_COVERAGE · MISSING_DENOMINATOR · TIME_WINDOW_MISMATCH ·
COHORT_MISMATCH · CHANNEL_SCOPE_MISMATCH · MISSING_COST_DATA · MISSING_REVENUE_DATA ·
MISSING_MARGIN_DATA · MISSING_CUSTOMER_COUNT · UNKNOWN_ATTRIBUTION · LOW_RETENTION_COVERAGE ·
MISSING_LTV_BASIS · MISSING_PAYBACK_BASIS · DATA_CONFLICT · SOURCE_FAILURE`.

- `BLOCKED` — no funnel or no counts.
- `INSUFFICIENT` — no valid transitions and < 2 stages observed.
- `PARTIAL` — any reason code.
- `COMPLETE_FOR_SCOPE` — none.

Deterministic — identical inputs ⇒ identical `completion_id` (W78).

## FunnelRevenueReport (§AE) — the 35 sections

`executive_summary · scope · data_coverage · funnel_definition · stage_counts · transition_rates ·
drop_offs · volume_vs_efficiency · channel_views · segment_views · offer_views · cohort_views ·
acquisition_costs · unit_economics · revenue · aov_arpu_arpa · margins · roas_mer · ltv ·
payback · break_even · sales_pipeline · booking_funnel · commerce_funnel · retention · expansion ·
bottleneck_candidates · revenue_leakage_candidates · opportunity_value · diagnoses · priorities ·
conflicts_data_mismatches · unknowns · limitations · evidence_appendix`.

- Every section is **either populated or `{ status: 'UNKNOWN' }` / `{ status: 'NOT_APPLICABLE' }`**
  — never silently omitted; `section_names.length === 35` always.
- `sales_pipeline` / `booking_funnel` / `commerce_funnel` show `{ status: 'NOT_APPLICABLE' }`
  when that shape does not apply.
- `channel_views` / `segment_views` / `offer_views` / `cohort_views` are `UNKNOWN` unless the
  observations carry those filter fields.
- `baseline_comparisons` (top-level) carry `comparable` + the three delta forms.

## Evidence appendix + graph validity (W79)

`evidence_appendix` de-duplicates every `evidence_ref` from observations, costs and revenue,
sorted. `evidence_graph_valid` is a **deterministic** check:
1. every `VALID` transition's `evidence_refs` are in the appendix;
2. every bottleneck's `evidence_refs` are in the appendix.

`evidence_graph_errors[]` names any break; a clean run → `evidence_graph_valid: true`, `[]`.

## Reproducibility

`report_id = 'frr_' + sha256(canonical(report without report_id))`; `content_hash ===
report_id`. Every constituent is a sorted id/number array → identical inputs (any order)
produce the same hash (C2, W79).

## Caveats (always present)

- Metrics are computed only from scope-compatible counts with a positive denominator; otherwise UNKNOWN.
- Volume and efficiency are reported separately — a weak result can be a volume problem.
- Different time periods and cohort bases are never silently compared.
- Attribution is reported/positional, never causal; multi-touch attribution is never fabricated.
- CPL, CPA and CAC are distinct; CAC is a lower bound when declared acquisition cost types are missing.
- Net revenue is never derived without its components; AOV/ARPU/ARPA use their own denominators.
- Gross margin and contribution margin are distinct; no cost of goods or variable cost is assumed.
- LTV methodology is explicit; a modelled LTV is labelled MODELLED, never observed.
- ROAS and MER are not interchangeable; ROAS carries its attribution basis.
- Bottlenecks and leakage figures are analytical, non-causal; no "$X lost" is fabricated.
- No statistical significance is claimed.
- **No ASTRA-11J output may feed production routing or autonomous action.**

## Model-knowledge separation

`provenance_note`: *"Metrics computed only from scope-compatible counts with valid
denominators. Attribution is not causal. No metric, cost, revenue, margin, LTV, or
lost-revenue figure is fabricated. No LLM. No production routing. No autonomous action."*
