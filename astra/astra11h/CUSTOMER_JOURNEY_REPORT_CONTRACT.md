# CUSTOMER_JOURNEY_REPORT_CONTRACT — ASTRA-11H

Modules: `coverage.js`, `completion.js`, `report.js`. Schema `ucdm-journey-1.0.0`.

## JourneyModelCoverage

`computeJourneyCoverage` — deterministic. VoC source/speaker counts; journey-observation and
OBSERVED counts; event / transition / OBSERVED-transition counts; `stage_coverage`; trigger /
friction / proof / alternative / JTBD counts; `has_pre_purchase` / `has_purchase_evidence` /
`has_post_purchase`; `temporal { current, historical, unknown }`; explicit `limitations[]`.

## JourneyModelCompletion (§Z)

`assessCompletion` — deterministic; `generated_by: 'deterministic:ucdm/journey/completion'`.
**An LLM can never mark completion.**

`status ∈ {COMPLETE_FOR_SCOPE, PARTIAL, INSUFFICIENT, BLOCKED}`:
- `BLOCKED` — zero journey observations.
- `INSUFFICIENT` — zero OBSERVED observations, or < 2 VoC sources.
- `PARTIAL` — any reason code.
- `COMPLETE_FOR_SCOPE` — none.

`REASON_CODES`: `LOW_JOURNEY_EVIDENCE · LOW_UNIQUE_SPEAKER_COUNT · MISSING_TRIGGER ·
MISSING_TRANSITION_EVIDENCE · MISSING_PURCHASE_EVIDENCE · MISSING_POST_PURCHASE_EVIDENCE ·
MISSING_OUTCOME · MISSING_ALTERNATIVE · MISSING_PROOF_REQUIREMENT · LOW_JTBD_COVERAGE ·
SEGMENT_CONFLICT · TEMPORAL_AMBIGUITY · SOURCE_FAILURE` (W55–W58). Deterministic — identical
inputs ⇒ identical `completion_id`.

## CustomerJourneyReport (§AA) — the 26 sections

`executive_summary · scope · evidence_coverage · journey_map · stages · events · transitions ·
triggers · frictions · questions · proof_requirements · alternatives · touchpoints ·
segment_differences · buying_role_differences · pre_purchase_journey · post_purchase_journey ·
bottleneck_candidates · jobs_to_be_done · forces_of_progress · job_outcomes ·
retention_churn_signals · conflicts · unknowns · limitations · evidence_appendix`.

- Every section is **either populated or `{ status: 'UNKNOWN' }`** — never silently omitted;
  `section_names.length === 26` always.
- `journey_map` carries `non_linear` (true when any transition relation ≠ FORWARD).
- `buying_role_differences` is `{ status: 'NOT_APPLICABLE' }` in B2C.
- `journey_metrics` (top-level) and `temporal_separation { current, historical, unknown,
  merged: false }` sit alongside the sections.

## Evidence appendix + graph validity (W59)

`evidence_appendix` de-duplicates `{ evidence_ref, source_ref }` from journey observations and
events, sorted by `evidence_ref`. `evidence_graph_valid` is a **deterministic** check:
1. every transition's `from_observation` / `to_observation` resolves to a journey observation
   in the report, and its `evidence_refs` are in the appendix;
2. every journey observation's `evidence_refs` are in the appendix;
3. every JTBD's `evidence_refs` are in the appendix.

`evidence_graph_errors[]` names any break; a clean run → `evidence_graph_valid: true`, `[]`.

## Reproducibility

`report_id = 'jmr_' + sha256(canonical(report without report_id))`; `content_hash ===
report_id`. All constituent sets are sorted id arrays → identical inputs (any order) produce
the same hash (C9).

## Caveats (always present)

- Journey stages are never invented because they are conventional; missing evidence is UNKNOWN.
- The journey is not forced linear — loops, regressions, skipped stages and re-entry are preserved.
- A transition exists only from same-customer evidence at two stages, never from a generic funnel.
- A channel appearing in evidence does not imply attribution or causality.
- Conversion / drop-off / time-to-purchase / attribution percentages are NULL without a valid denominator.
- Bottleneck candidates are analytical (`is_fact:false`); no causal bottleneck is claimed.
- Emotional / social jobs require explicit customer evidence; otherwise UNKNOWN. Job statements add no facts.
- Historical and current journeys are separated, never silently merged.
- No churn probability is produced.
- **No ASTRA-11H output may feed production routing or autonomous action.**

## Model-knowledge separation

`provenance_note`: *"Journeys are reconstructed from evidence; missing evidence is UNKNOWN;
stages are never invented. No LLM. No production routing. No autonomous action."*
