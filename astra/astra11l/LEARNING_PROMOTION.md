# ASTRA-11L — LEARNING PROMOTION

## HYPOTHESIS IS NOT FACT · INCONCLUSIVE IS NOT LEARNING

A `LEARNING` memory is only ever produced by `promotion.js`. A candidate cannot assert
`memory_type: 'LEARNING'` into existence — it must carry a `promotion_source` that names a
promotable upstream entity, and every gate below must pass.

## `evaluatePromotion({ candidate, evidenceBinding, source, scopeValidation, limitations })`

`PROMOTION_STATUS`: `LEARNING_PROMOTED` | `LEARNING_PROMOTION_NOT_PERMITTED`.

### Gates (any failing gate ⇒ NOT_PERMITTED, with a blocker code)

| # | blocker | rule |
|---|---|---|
| 0 | `SOURCE_TYPE_NOT_PROMOTABLE` | `fromType = (source.source_memory_type \|\| source.from_type \|\| 'RESULT')` must be `RESULT` or `EXPERIMENT` |
| 0b | `FORBIDDEN_AUTO_TRANSITION` | `isForbiddenAutoTransition(fromType, 'LEARNING')` must be false |
| 1 | `EVIDENCE_NOT_VALID` | `evidenceBinding.status === 'EVIDENCE_VALID'` |
| 2 | `EXPERIMENT_NOT_COMPLETE` | source experiment status ∈ {COMPLETE, CONCLUDED} |
| 3 | `EVALUATION_NOT_VALID` | ASTRA-11K evaluation status === `EVALUATION_VALID` |
| 4 | `DECISION_INCONCLUSIVE` | 11K decision ∈ {ADOPT, REJECT, ITERATE} — never INCONCLUSIVE / INSUFFICIENT_EVIDENCE |
| 5 | `SCOPE_NOT_EXPLICIT` | `scopeValidation` shows an explicit, bounded scope (period + at least one of cohort/channel/segment/offer) |
| 6 | `GUARDRAIL_BREACH` | no guardrail metric breached in the source result |
| 7 | `UNRESOLVED_CONTAMINATION` | source not flagged contaminated / SRM / tracking-broken |
| 8 | `PRIMARY_MOVEMENT_UNKNOWN` | primary metric movement is known (not UNKNOWN) |

### Preserved on a promoted LEARNING

- `preserved_causal_status` — copied verbatim from the 11K evaluation (`CAUSAL_SUPPORTED` /
  `ASSOCIATION_ONLY` / `CAUSAL_NOT_SUPPORTED`). ASTRA-11L never upgrades it.
- `preserved_statistical_status` — e.g. `SIGNIFICANT` / `NOT_SIGNIFICANT` /
  `NOT_ASSESSED`. Never fabricated.
- `preserved_limitations` — the source limitation list is carried forward.
- `is_positive_learning = permitted && decision === 'ADOPT'`. A REJECT/ITERATE learning is
  still a learning ("X did not move the primary metric for scope S"), just not positive.

### Scope on a LEARNING

The learning's scope **is** the source experiment's scope. It is never widened. A retrieval
for a broader context surfaces it only as `SCOPE_PARTIAL`.

## Result

`LEARNING_PROMOTION_NOT_PERMITTED` ⇒ the candidate is **rejected** as a memory with
`reject_reason: 'LEARNING_PROMOTION_NOT_PERMITTED'` and the blocker list. The upstream
EXPERIMENT_RESULT / DECISION memories still exist independently — nothing is lost, but no
unearned lesson is stored.
