# EXPERIMENT_DESIGN — ASTRA-11K

Modules: `design.js`, `evaluation.js`, `decision.js`, `registry.js`.

## ExperimentDesign (§7) — `design.js`

`DESIGN_TYPES` and what each **explicitly** permits:

| design_type | descriptive comparison | causal evaluation |
|---|---|---|
| `CONTROL_VS_TREATMENT` | ✅ | possible **only if** scope, allocation, contamination and measurement are all valid |
| `HOLDOUT` | ✅ | same conditions as CONTROL_VS_TREATMENT |
| `BEFORE_AFTER_DESCRIPTIVE` | ✅ | ❌ not permitted by default |
| `SEQUENTIAL_TEST` | ✅ | ❌ (confounded by time) |
| `COHORT_COMPARISON` | ✅ | ❌ (cohorts differ in more than the treatment) |
| `OPERATIONAL_PROCESS_TEST` | ✅ | ❌ (needs an isolated control) |

`conclusion_permitted.causal_evaluation` is `true` **only** for a controlled design with an
empty `causal_blockers[]`. Blockers: `DESIGN_NOT_CONTROLLED`,
`ALLOCATION_NOT_RANDOM_OR_DETERMINISTIC`, `MULTI_VARIABLE_CONTAMINATION`, `MEASUREMENT_INVALID`,
`POPULATIONS_NOT_COMPARABLE`, `CONTROL_CONTAMINATED`, `TREATMENT_LEAKAGE` (W35–W40).
`validateDesign` rejects a non-controlled design that permits causal evaluation, and any
`causal_evaluation: true` with blockers present.

## Evaluation (§13-prep) — `evaluation.js`

`EVAL_STATUS` = `EVALUATION_VALID · OUTCOME_INCOMPLETE · EVALUATION_NOT_PERMITTED ·
EVIDENCE_INSUFFICIENT`. `PRIMARY_MOVEMENT` = `IMPROVED · WORSENED · NO_MATERIAL_CHANGE ·
UNKNOWN` (material-change threshold default 2%).

- Reads a **supplied** outcome (`before`/`after` for the primary metric + guardrails). No
  outcome data → `OUTCOME_INCOMPLETE`. Sample/events below the supplied minimum →
  `EVIDENCE_INSUFFICIENT` (W66, W67).
- **`difference_type` is always `DESCRIPTIVE_DIFFERENCE`.** `causal_interpretation_permitted`
  is `true` only for an `EVALUATION_VALID` outcome under a `CAUSAL_CLAIM_PERMITTED` policy;
  otherwise `descriptive_only: true` (W65, W69).
- `fabricated_result: false` on every return — `validateEvaluation` enforces it (W68).

## Decision (§13) — `decision.js`

`DECISIONS` = `ADOPT · REJECT · ITERATE · RETEST · HOLD · INSUFFICIENT_EVIDENCE · INCONCLUSIVE`.

| situation | decision |
|---|---|
| no valid evaluation / incomplete outcome / insufficient evidence | `INSUFFICIENT_EVIDENCE` |
| primary metric shows no material change | `INCONCLUSIVE` |
| primary metric worsened | `REJECT` |
| primary improved **+ guardrail breach** | `HOLD` |
| primary improved **+ multi-variable contamination** | `ITERATE` |
| primary improved **+ invalid required baseline** | `RETEST` |
| primary improved, descriptive-only design | `ITERATE` |
| primary improved, no breach, causal basis permitted | `ADOPT` (with an explicit `causal_claim_basis`) |

**`winner_forced: false`** always; `INCONCLUSIVE` and `INSUFFICIENT_EVIDENCE` are valid
results. `triggers_action: false`, `autonomous: false`. A `causal_claim_made: true` requires a
non-null `causal_claim_basis` (W70–W74).

## ExperimentRegistryEntry (§12) — `registry.js`

`REGISTRY_STATUS` = `DRAFT · READY · RUNNING · INSUFFICIENT_DATA · COMPLETED · STOPPED ·
INVALIDATED · INCONCLUSIVE`, derived deterministically from what exists in the pipeline.

`experiment_id` is **content-addressed** (`exp_<sha256>`) — a supplied id is kept only as a
label (`supplied_experiment_id`). `detectDuplicateIds` reports both canonical and supplied-id
duplicates (W75–W77). `validateRegistryEntry` requires an `ADOPT` decision to be on a
`COMPLETED` experiment.
