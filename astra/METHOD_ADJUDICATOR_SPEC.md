# METHOD_ADJUDICATOR_SPEC — framework selection & conflict resolution

The defining ASTRA capability. **RETRIEVAL ≠ METHOD SELECTION.** Given a task, its evidence, and registry candidates, the adjudicator decides which method governs — and records why. It never averages conflicting frameworks and never lets raw retrieval score decide.

## Inputs
```
{ task_brief, work_unit, retrieved_evidence[], registry_candidates[], constraints, upstream_decisions[] }
```

## Output (structured, provenance-bearing)
```json
{
  "work_unit_id": "...",
  "primary_method": "METHOD_ID",
  "secondary_methods": ["METHOD_ID", "..."],
  "rejected_methods": [{"method_id":"...","reason":"..."}],
  "hybrid_allowed": true,
  "hybrid_strategy": "how primary + secondary combine, or null",
  "selection_confidence": 0.0,
  "selection_reasons": ["evidence-grounded justifications"],
  "method_conflicts": [{"between":["A","B"],"nature":"...","resolution":"PRIMARY_WINS|SECONDARY_WINS|HYBRID|INSUFFICIENT_EVIDENCE"}],
  "missing_evidence": ["what would change the decision"],
  "fallback_strategy": "what to do if primary is infeasible or evidence is INSUFFICIENT",
  "scores": {"METHOD_ID": {"per_dimension": {}, "total": 0.0}}
}
```

## Scoring dimensions (weighted, task-relative)
1. problem fit
2. business-stage fit
3. funnel-stage fit
4. evidence strength (Agent V1 sufficiency + cosine + quality_status/warning_flags)
5. expected impact
6. implementation complexity (inverse)
7. user constraints (budget/time/channel/skill)
8. compatibility (with already-selected methods)
9. contradiction risk (inverse)

Weights come from the TASK_BRIEF (e.g. a low-budget launch upweights complexity/constraints). **Evidence strength is one dimension among nine — never the sole selector.** A method with the highest retrieval score but poor business/funnel fit does not win by that alone.

## Evidence-gating
- If Agent V1 sufficiency for a method's supporting query is `INSUFFICIENT`, that method cannot be `primary` unless justified by user-provided facts or research (recorded as such). 
- `PARTIAL` sufficiency caps `selection_confidence` and forces a `missing_evidence` note.
- Warning flags / low `quality_status` reduce evidence strength.

## Conflict resolution (mandatory)
When two candidates recommend opposing moves (e.g. *aggressive lead capture* vs *qualify-before-acquire*):
1. Set `CONFLICT_DETECTED = TRUE` and describe the conflict.
2. Adjudicate using: task objective → business economics → funnel stage → evidence → constraints (in that priority order).
3. Emit exactly one outcome per conflict: `PRIMARY_WINS | SECONDARY_WINS | HYBRID | INSUFFICIENT_EVIDENCE`.
4. **Never average contradictory recommendations without an explicit written resolution.** A `HYBRID` must state the decision boundary (when A applies vs when B applies), not a blended mush.
5. `INSUFFICIENT_EVIDENCE` → escalate to RESEARCH_ENGINE or surface an open question; do not guess.

## Determinism & auditability
The adjudication is a reasoning task (MODEL_ROUTER → HIGH_REASONING). To keep it reproducible and cheap, cache adjudications content-addressed on `hash(task_brief_slice + candidate_ids + evidence_hashes + adjudicator_version)` — reusing the Agent V1 decision-cache pattern (fail-closed integrity, versioned invalidation). A cache hit replays the exact prior adjudication with zero LLM calls. Cold adjudications are recorded with full `selection_reasons`.

## Anti-bias guarantees
- No method is pre-favored; `METHOD_VELOCITY` competes on the same dimensions as everything else.
- The registry provides candidates and metadata only; ranking is computed here, per task.
- Every rejection is recorded with a reason (auditability).
