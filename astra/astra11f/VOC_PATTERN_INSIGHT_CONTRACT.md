# VOC_PATTERN_INSIGHT_CONTRACT — ASTRA-11F

Module: `voc/pattern_insight.js`.

## Contradiction / polarization (§R)

**Per-cluster** (`classifyContradiction`): from the `polarity_mix`,
`status ∈ {CONSENSUS, MIXED, POLARIZED, INSUFFICIENT}`:
- `< 3` positive+negative observations → `INSUFFICIENT`
- one side is zero → `CONSENSUS`
- minority share ≥ 0.35 → `POLARIZED`, else `MIXED`

**Cross-concept** (`crossConceptContradictions`): opposing concept pairs that both appear in
the sample mean customers disagree about the *theme*:

| theme | pair |
|---|---|
| `price` | `PRICE_CONCERN` ↔ `PRICE_ACCEPTANCE` |
| `pain` | `PAIN_FEAR` ↔ `PAIN_EXPERIENCED` |
| `responsiveness` | `RESPONSIVENESS_COMPLAINT` ↔ `QUALITY_PRAISE` |

→ a `kind: 'CROSS_CONCEPT'` contradiction with `POLARIZED` / `MIXED` status, both cluster
refs, and merged evidence refs. **Contradictions are preserved, never collapsed** (W37, W38).

## VocPattern (§T)

```
{ pattern_id, pattern (human label from a fixed map), aspect, canonical_concept,
  cluster_refs[], supporting_observations[], contradicting_observations[],
  coverage{deduped_observation_count, unique_source_count, unique_speaker_count, denominator_note},
  frequency{observation_count, deduped_observation_count, unique_source_count},
  confidence, scope: 'SAMPLE', status }
```

`status ∈ {SUPPORTED, PARTIAL, MIXED, INSUFFICIENT}`:
- `deduped_observation_count < 3` or `unique_source_count < 2` → `INSUFFICIENT`
- cross/per-cluster contradiction `POLARIZED` → `MIXED`
- contradiction `MIXED` → `PARTIAL`
- else → `SUPPORTED`

Every non-`INSUFFICIENT` pattern has supporting observations that resolve to observations in
the report (W41). `scope` is always `SAMPLE` — no market-wide extrapolation.

## CustomerInsight (§U)

```
{ insight_id, statement, statement_source: 'deterministic:ucdm/voc',
  supporting_pattern_refs[], contradicting_refs[], scope, confidence, confidence_band,
  is_fact: false, is_recommendation: false }
```

- Derived only from `SUPPORTED` / `PARTIAL` / `MIXED` patterns.
- The `statement` is a **deterministic template** — no LLM. It explains *what customers
  repeatedly express*, with the explicit denominator (*"N observations across K sources"* /
  *"unique observed speaker"*).
- **`is_fact: false`** and **`is_recommendation: false`** — `validateInsight` rejects either
  being true (W42, W43). ASTRA-11F does not turn an insight into a recommendation.
