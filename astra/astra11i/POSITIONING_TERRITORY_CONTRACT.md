# POSITIONING_TERRITORY_CONTRACT — ASTRA-11I

Modules: `positioning_territory.js`, `category_frame.js`, `distinctiveness.js`,
`positioning_fit.js`, `conflicts.js`.

## PositioningTerritory (§B)

```
{ territory_id, schema_version, kind: 'PositioningTerritory',
  target_segment_refs[], persona_refs[], jtbd_refs[],
  problem_context, desired_progress, category_frame_ref, frame_type, reference_points[],
  differentiation_basis[], differentiation_refs[], evidence_refs[], contradiction_refs[],
  competitor_overlap[], whitespace[], distinctiveness_ref, distinctiveness_signal,
  relevance, defensibility, is_market_fact: false, scope: 'SEGMENT', status, unknowns[], confidence }
```

- **One territory per ASTRA-11G segment** — territories are NEVER collapsed into a generic
  average (§Z). `comparePositioning` returns per-pair `differences[]`, `territories_differ`,
  and always `universal_positioning_forced: false` (W7, W8, W34).
- **`status`** ∈ `SUPPORTED / PARTIAL / HYPOTHESIS / INSUFFICIENT`:
  - `INSUFFICIENT` — segment INSUFFICIENT or no evidence.
  - `HYPOTHESIS` — no persona or unknown problem.
  - `PARTIAL` — segment PARTIAL, no evidenced differentiation, or unknown desired progress.
  - `SUPPORTED` — segment SUPPORTED + persona + evidenced problem + differentiation + progress.
- **`is_market_fact` is always `false`** — a positioning territory is analytical.
  `validateTerritory` rejects `is_market_fact !== false` and any `unique / only provider /
  market leader` string (W3, W5).
- A `SUPPORTED`/`PARTIAL` territory must carry `evidence_refs` (W2).

## Category / frame of reference (§C) — `category_frame.js`

`FRAME_TYPES` = `EXISTING_CATEGORY · SUBCATEGORY · ALTERNATIVE_CATEGORY · PROBLEM_BASED_FRAME ·
OUTCOME_BASED_FRAME · UNKNOWN`.

- A **new / alternative category** is only used when the business explicitly supplies it
  (`businessInput.category.new_category === true`) → `basis: 'USER_PROVIDED'`.
  `validateFrame` rejects `ALTERNATIVE_CATEGORY` with any other basis — **no category is
  invented for novelty** (`invented_for_novelty: false`, W10, W11).
- Otherwise the frame is the evidenced desired-outcome (`OUTCOME_BASED_FRAME`) or primary
  problem (`PROBLEM_BASED_FRAME`), with `basis: 'ANALYTICAL'` and `evidence_refs` (W12), or
  `UNKNOWN`.
- `reference_points` are the alternatives the customer actually weighs (ASTRA-11H).

## Distinctiveness (§F) — `distinctiveness.js`

Deterministic comparison of the territory's `differentiation_basis` against **observed**
competitor messages/offers (`researchResult.message_observations` + `offer_items`), classified
by the shared `classifyType` keyword set:

- `whitespace` — differentiation type not seen in the competitor sample.
- `overlap` — seen once.
- `contested` — seen ≥ 2 times.
- `unknown_coverage` — `NO_COMPETITOR_SAMPLE` / `PARTIAL_SAMPLE`.

**`market_wide_uniqueness_claim` is always `'NOT_ASSERTED'`** — `validateDistinctiveness`
rejects any other value and rejects overlap/contested output with an empty sample (W5, W19).

## Positioning fit (§G) — `positioning_fit.js`

`FIT_DIMENSIONS` (9): `segment_relevance · problem_fit · jtbd_fit · desired_outcome_fit ·
objection_compatibility · proof_availability · business_capability_fit ·
competitive_distinctiveness · evidence_coverage`. Default weights `cm-positioning-fit-w1`,
caller-configurable (`weights_version: 'custom'`, W21). Per-dimension score is `[0,1]` or
`null`; **when covered weight-mass < 0.5, `total_score` is `null` and `fit_band` is
`UNKNOWN`** (`STRONG / GOOD / WEAK / POOR / UNKNOWN`) (W20). Deterministic — identical inputs
⇒ identical `fit_id`.

## Positioning / offer conflicts (§Y) — `conflicts.js`

`CONSISTENT / MIXED / POLARIZED / INSUFFICIENT` over dimensions `SEGMENT_DISAGREEMENT`,
`DIFFERENT_JOURNEYS`, `MULTIPLE_POSITIONING_TERRITORIES`, `PRICING_CONFLICT`, `PROOF_CONFLICT`,
`COMPETITOR_AMBIGUITY`. Carried from ASTRA-11F/G/H contradiction signals (no parallel system).
A material positioning conflict is flagged `likely_separate_positioning: true` — **ASTRA does
not force one universal positioning** (W66).
