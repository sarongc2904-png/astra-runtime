# COMPETITOR_POSITIONING_CONTRACT — ASTRA-11E

Modules: `competitor/positioning.js`, `competitor/positioning_map.js`. Also covers §P clusters.

## CompetitorPositioning (§D)

```
{ positioning_id, competitor_ref,
  observed_elements: {
    target_customer, category_frame, primary_promise, value_proposition, mechanism,
    differentiation_claim, identity, proof_basis, price_position
  },   // each: { value, evidence_refs[], source_class: 'OBSERVED'|'COMPUTED' } OR { status: 'UNKNOWN' }
  positioning_statement: {
    value, source_class: 'INFERRED', analytical: true, observed: false,
    derived_from_evidence_refs[], produced_by: 'deterministic:ucdm/competitor'
  },
  evidence_refs[], confidence }
```

| rule | enforcement |
|---|---|
| observed elements may be facts | each carries `evidence_refs` + `source_class: 'OBSERVED'` (or `COMPUTED` for `price_position`) |
| the synthesized `positioning_statement` is **analytical** | `analytical: true`, `observed: false`, `source_class: 'INFERRED'` |
| **synthesis is never stamped observed** | `validatePositioning` rejects `positioning_statement.source_class === 'OBSERVED'` (W8) |
| `positioning_statement` is a **deterministic template** — no LLM | `produced_by: 'deterministic:ucdm/competitor'` |
| `price_position ∈ {PREMIUM, MID, ECONOMY, UNKNOWN}` from this competitor's median price vs the sample median (per currency): `≥1.25x` PREMIUM, `≤0.8x` ECONOMY, else MID; no data → UNKNOWN | deterministic |

## PositioningMap (§O)

```
{ map_id, axes: [{ id, axis_definition: "<left> <-> <right>", rubric }],
  placements: [{ competitor_ref, name, axis_positions: { <axis_id>: { position, score?, reason?, axis } }, evidence_refs[] }] }
```

- **Requires explicitly-defined axes.** `buildPositioningMap({ axes: [] })` returns
  `{ status: 'NO_AXES_DEFINED' }` — the engine never invents an axis and treats it as
  canonical (W28).
- `DEFAULT_AXES` are *offered* (price economical↔premium, generalist↔specialist,
  speed↔customization, self-service↔high-touch) each with a `rubric`; a caller must pass
  them explicitly.
- If data is insufficient for a competitor on an axis, `position: 'UNKNOWN'` with a `reason`
  — **unknown placement is preserved** (W29).
- Placement is deterministic per rubric (e.g. price axis = median ratio; specialization =
  observed category count).

## Competitor clusters (§P)

`buildClusters` — deterministic taxonomy assignment:
`price_led · technology_led · premium_service · specialist · convenience_led · results_led`
(+ `UNCLASSIFIED`). Marked `method: 'deterministic-taxonomy'`, `analytical: true`. No LLM
clustering in this gate; if a future gate adds LLM clustering it must stay analytical and
schema-constrained.
