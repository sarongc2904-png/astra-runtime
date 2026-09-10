# ASTRA-11L — CONFLICT & SUPERSESSION

## NO SILENT OVERWRITE

New evidence about the same semantic target never overwrites a prior memory. One of four
things happens, explicitly and recorded:
1. **Coexist** — different scope → both kept (`SCOPE_CONDITIONAL_DIFFERENCE`).
2. **Supersede** — same target, newer, compatible scope → link, prior retained as `SUPERSEDED`.
3. **Invalidate** — an explicit invalidation event → prior retained as `INVALIDATED`.
4. **Conflict** — same scope, opposed claims, no time separation → `DIRECT_CONFLICT`, both
   kept, resolution refuses to pick.

## Conflict detection (`conflicts.js`)

`parseComparison(claim)` — regex extracts `{ a, b, direction }` from patterns like "A supera a
B", "A > B", "A beats B", "A mejor que B", "A worse than B", plus bare direction words
(up/down, subió/bajó, increased/decreased).

`detectConflict(a, b)` →

| result | condition |
|---|---|
| `DIRECT_CONFLICT` | opposed direction **and** `SCOPE_MATCH` **and** metric comparable **and** ≤ 90 days apart |
| `TEMPORAL_CHANGE` | opposed direction, `SCOPE_MATCH`, metric comparable, **> 90 days apart** |
| `SCOPE_CONDITIONAL_DIFFERENCE` | opposed direction but `SCOPE_MISMATCH`/`SCOPE_PARTIAL` — `global_conflict_declared: false` |
| `UNRESOLVED_CONFLICT` | opposed, scope undecidable |
| `NO_CONFLICT` | same direction, or unrelated claims |

`detectAllConflicts(memories)` runs pairwise over the final accepted set and returns the list
plus a `conflict_status` per memory.

A scope-conditional difference is **not** a contradiction: "offer A wins for cohort X" and
"offer B wins for cohort Y" both stand.

## Supersession (`supersession.js`)

`resolveSupersession(newMem, existing)` links when: same `business_id`, same semantic target
(`semantic_key` or explicit `replaces` / `semantic_target`), and newer `observed_at` (or
`replaces` names it). Coverage:

- `SUPERSEDED` (full) when scope comparison is `SCOPE_MATCH`.
- `PARTIALLY_SUPERSEDED` when `SCOPE_PARTIAL` — only the overlapping scope is superseded; the
  non-overlapping part of the old memory stays `ACTIVE`.
- `NOT_SUPERSEDED` otherwise.

`prior_memories_deleted: false`. The superseded memory keeps its id, moves to
`temporal_status: 'SUPERSEDED'`, and appears in `snapshot.superseded_history` with a link to
the successor.

## Invalidation (`invalidation.js`)

`applyInvalidations(memories, invalidations)` — an invalidation targets by `memory_id`,
`memory_ids[]`, or `evidence_ref` (invalidates every memory citing it). `INVALIDATION_REASONS`
(6): `EVIDENCE_RETRACTED`, `EVIDENCE_SUPERSEDED`, `MEASUREMENT_ERROR`, `SCOPE_CONTAMINATION`,
`POLICY_CHANGE`, `MANUAL_REVIEW`. Result carries `invalidated_at`, `invalidated_by`,
`reason`, `physically_deleted: false`. Invalidated memories are excluded from retrieval
default results and kept in `invalidated_history`.
