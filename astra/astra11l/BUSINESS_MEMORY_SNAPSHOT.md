# ASTRA-11L — BUSINESS MEMORY SNAPSHOT

`buildSnapshot({ businessId, memories, conflicts, supersessions, invalidatedIds,
referenceTime })` → `BusinessMemorySnapshot`.

A snapshot is a **deterministic projection of the current accepted memory set at
`referenceTime`**. It is not the truth — `is_absolute_truth: false` — it is "what the memory
engine currently holds, with evidence, scope and age attached".

## Structure

```
{
  schema_version, kind: 'BusinessMemorySnapshot',
  business_id, reference_time,
  current_facts:        [FACT, ACTIVE, evidence VALID],
  current_diagnoses:    [DIAGNOSIS, ACTIVE],
  constraints:          [CONSTRAINT, ACTIVE],
  current_unit_economics:[UNIT_ECONOMICS, ACTIVE, by scope],
  active_offers / active_segments / active_channels / active_funnel_states,
  active_learnings:     [LEARNING, ACTIVE, with preserved_causal_status],
  unresolved_hypotheses:[HYPOTHESIS not promoted, not invalidated],
  active_experiments:   [EXPERIMENT_RESULT with source experiment still running],
  recent_decisions:     [DECISION ordered by observed_at desc],
  active_priorities / risks / assumptions,
  stale_memories:       [temporal_status STALE or staleness POTENTIALLY_STALE/STALE],
  conflicts:            [unresolved DIRECT_CONFLICT / UNRESOLVED_CONFLICT pairs],
  scope_conditional_differences: [SCOPE_CONDITIONAL_DIFFERENCE pairs],
  superseded_history:   [{ superseded_id, successor_id, coverage }],
  invalidated_history:  [{ memory_id, reason, invalidated_at }],
  counts: { total, accepted, rejected, active, stale, superseded, invalidated,
            conflicts, learnings, hypotheses },
  is_absolute_truth: false,
  caveats: [...],
  generated_by: 'deterministic:ucdm/business_memory/snapshot'
}
snapshot_id = 'bms_' + sha256Hex(canonicalize({ ...without id }))
```

## Rules

- A memory in `DIRECT_CONFLICT` appears in `conflicts`, **not** in `current_facts` — the
  snapshot does not present a contested claim as settled.
- A `HYPOTHESIS` never appears under `current_facts` or `active_learnings`.
- A `STALE` memory still appears in its category **and** in `stale_memories`, flagged.
- Superseded / invalidated memories appear only in their history lists.
- Every list entry carries `memory_id`, `scope`, `evidence_status`, `temporal_status`,
  `source_engine` — the snapshot is auditable back to evidence.
- `counts` are derived, not asserted.
