# CUSTOMER_MODEL_REPORT_CONTRACT — ASTRA-11G

Modules: `coverage.js`, `completion.js`, `report.js`. Schema `ucdm-customer-model-1.0.0`.

## CustomerModelCoverage (§7)

`computeCustomerModelCoverage` — deterministic. Exposes VoC source/utterance/speaker/observation
counts, `market_evidence_present` + `market_fact_count` (ASTRA-11D), attribute-evidence totals,
`attribute_types_observed[]`, `segment_count` / `supported_segment_count`, `has_problem_signal`,
`has_desired_outcome`, `has_decision_criteria`, `duplicate_ratio`, and explicit `limitations[]`.

## CustomerModelCompletion (§W)

`assessCompletion` — deterministic; `generated_by: 'deterministic:ucdm/customer_model/completion'`.
**An LLM can never mark completion.**

`status ∈ {COMPLETE_FOR_SCOPE, PARTIAL, INSUFFICIENT, BLOCKED}`:
- `BLOCKED` — no utterances or no segments.
- `INSUFFICIENT` — 0 observed attribute evidence, or < 2 VoC sources.
- `PARTIAL` — any reason code.
- `COMPLETE_FOR_SCOPE` — none.

`REASON_CODES`: `LOW_CUSTOMER_EVIDENCE · LOW_VOC_COVERAGE · LOW_UNIQUE_SPEAKER_COUNT ·
MISSING_PROBLEM_SIGNAL · MISSING_DESIRED_OUTCOME · MISSING_DECISION_CRITERIA · UNKNOWN_AWARENESS ·
UNKNOWN_BUDGET_SIGNAL · SEGMENT_CONFLICT · LOW_ICP_COVERAGE · IDENTITY_AMBIGUITY · SOURCE_FAILURE`
(W56, W57, W58). Deterministic — identical inputs ⇒ identical `completion_id`.

## CustomerModelReport (§X) — the 28 sections

`executive_summary · research_scope · evidence_coverage · customer_segments · segment_comparison ·
priority_segments · buyer_personas · persona_evidence_maps · buying_language · pains ·
desired_outcomes · fears · objections · triggers · alternatives · decision_criteria · questions ·
awareness · urgency · budget_signals · icp · icp_fit · buying_roles · disqualifiers · conflicts ·
unknowns · limitations · evidence_appendix`.

- Every section is **either populated or `{ status: 'UNKNOWN' }`** — never silently omitted;
  `section_names.length === 28` always.
- `top`-style sections rank VoC clusters by `deduped_observation_count` and carry each cluster's
  `denominator_note` (no "% of customers").
- `icp` shows `{ status: 'NOT_APPLICABLE', reason: 'B2C' }` in B2C.
- `unknowns` aggregates persona UNKNOWN fields, ICP unknowns, and missing awareness/urgency/budget.

## Evidence appendix + graph validity (W59)

`evidence_appendix` de-duplicates `{ evidence_ref, source_ref }` from VoC observations and
attribute evidence, sorted by `evidence_ref`. `evidence_graph_valid` is a **deterministic**
check:
1. every persona evidence map resolves (no dangling refs), and
2. every segment's and persona's `evidence_refs` appear in the appendix.

`evidence_graph_errors[]` names any break. A clean run → `evidence_graph_valid: true`, `[]`.

## Reproducibility

`report_id = 'cmr_' + sha256(canonical(report without report_id))`; `content_hash === report_id`.
All constituent sets are sorted id arrays → identical inputs (in any order) produce the same
hash (C9).

## Caveats (always present)

- Only evidence-backed attributes are represented; unsupported demographics/psychographics/lifestyle stay UNKNOWN.
- No plausible-but-unsupported persona filler.
- Market/segment size is never fabricated; external size is UNKNOWN unless supplied.
- Overlapping segments are supported; contradictions are preserved and may indicate multiple segments.
- ICP (account fit) is separate from BuyerPersona; priority is analytical only.
- **No ASTRA-11G output may feed production routing or autonomous action.**

## Model-knowledge separation (§Y)

`engine.runCustomerModel` reads only ASTRA-11D / ASTRA-11F evidence objects and explicit
business input. `provenance_note`: *"Attributes are evidence-backed or UNKNOWN. No demographic
or psychographic invention. No LLM. No production routing. No autonomous action."*
