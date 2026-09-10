# POSITIONING_OFFER_REPORT_CONTRACT — ASTRA-11I

Module: `report.js`. Schema `ucdm-positioning-offer-1.0.0`.

## PositioningOfferReport (§AC) — the 31 sections

`executive_summary · scope · evidence_coverage · target_segments · jtbd_linkage ·
positioning_territories · positioning_comparison · value_propositions · differentiation ·
category_frame · competitive_overlap · offer_architecture · offer_components ·
feature_benefit_outcome_map · mechanism · pricing · packaging · proof_strategy · risk_reversal ·
objection_map · journey_stage_fit · segment_fit · competitive_comparison · offer_gaps ·
opportunities · message_foundation · claims · conflicts · unknowns · limitations ·
evidence_appendix`.

- Every section is **either populated or `{ status: 'UNKNOWN' }`** — never silently omitted;
  `section_names.length === 31` always.
- `positioning_fits` (top-level) sits alongside the sections.
- `pricing` section shows `willingness_to_pay` / `optimal_price` (both `NOT_ESTIMATED`),
  `fx_applied` (`false`), `price_conflict` status.
- `opportunities` section shows `autonomous` (`false`) and `expected_lift` (`NOT_ESTIMATED`).

## Evidence appendix + graph validity (W69)

`evidence_appendix` de-duplicates every `evidence_ref` cited by a positioning-evidence item, a
territory, or a value proposition, sorted. `evidence_graph_valid` is a **deterministic** check:
1. every territory's `evidence_refs` are in the appendix;
2. every non-INSUFFICIENT value proposition's `evidence_refs` are in the appendix;
3. every `ACCEPTED` claim's `evidence_refs` are in the appendix.

`evidence_graph_errors[]` names any break; a clean run → `evidence_graph_valid: true`, `[]`.

## Reproducibility

`report_id = 'por_' + sha256(canonical(report without report_id))`; `content_hash ===
report_id`. Constituent sets are sorted id arrays → identical inputs (any order) produce the
same hash (C8, W68).

## Caveats (always present)

- Positioning territories and value propositions are analytical, never market facts.
- No market-wide uniqueness is claimed from an incomplete competitor sample.
- Per-segment positioning is preserved; no single universal positioning is forced.
- Bonuses / guarantees / scarcity / urgency exist only when the business supplies them — never manufactured.
- Emotional / social benefits require explicit customer evidence; no transformation fiction.
- Pricing is observed-competitor / business-supplied only — no willingness-to-pay, no optimal price, no FX.
- Proof assets are USER_PROVIDED only; ASTRA never fabricates a testimonial or result.
- Offer gaps and opportunities are analytical and non-autonomous; expected lift is NOT_ESTIMATED.
- Message foundations are canonical fields, not ad copy.
- **No ASTRA-11I output may feed production routing or autonomous action.**

## Model-knowledge separation

`provenance_note`: *"Positioning/value/differentiation are analytical and evidence-linked;
offer elements are supplied or analytical; no market fact, price, WTP, proof or expected lift
is invented. No LLM. No production routing. No autonomous action."*
