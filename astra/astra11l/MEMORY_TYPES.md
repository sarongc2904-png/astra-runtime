# ASTRA-11L — MEMORY TYPES

`MEMORY_TYPES` (16, controlled — `types.js`):

| type | meaning | evidence bar | causal? |
|---|---|---|---|
| `FACT` | verified commercial fact bound to a scope | EVIDENCE_VALID | no |
| `DIAGNOSIS` | diagnosed problem/root-cause from a validated engine (11J/11I) | EVIDENCE_VALID/PARTIAL | inherited only |
| `HYPOTHESIS` | proposed but unproven belief | ≥1 ref | never |
| `LEARNING` | validated causal/decisional lesson from a completed experiment | promotion-gated | inherited from 11K eval only |
| `CONSTRAINT` | hard business limit (budget, guardrail, capacity, policy) | EVIDENCE_VALID | no |
| `UNIT_ECONOMICS` | CAC / LTV / margin / payback bound to scope+period | EVIDENCE_VALID | no |
| `FUNNEL_STATE` | a funnel transition state / bottleneck (11J) | VALID or PARTIAL denominator | no |
| `SEGMENT_INSIGHT` | insight about a segment/persona (11G/11H) | ≥1 ref | no |
| `OFFER_INSIGHT` | insight about an offer/positioning (11I) | ≥1 ref | no |
| `CHANNEL_INSIGHT` | insight about a channel | ≥1 ref | no |
| `EXPERIMENT_RESULT` | recorded outcome of an experiment (11K) | as reported by 11K | as 11K permitted |
| `DECISION` | a commercial decision taken (ADOPT/REJECT/ITERATE/INCONCLUSIVE) | ≥1 ref | no |
| `PRIORITY` | an active priority / focus | ≥1 ref | no |
| `RISK` | an identified risk | ≥1 ref | no |
| `ASSUMPTION` | an explicit working assumption | ≥1 ref | never |
| `CONTEXT_NOTE` | non-assertive contextual annotation | ≥1 ref | no |

`ASSERTIVE_TYPES = ['FACT','LEARNING','CONSTRAINT','UNIT_ECONOMICS','FUNNEL_STATE']` — require
`EVIDENCE_VALID` (FUNNEL_STATE may carry a PARTIAL denominator state).

`PROMOTION_GATED = ['LEARNING']` — only produced via `promotion.js`, never directly from a
candidate whose `memory_type` is asserted as LEARNING without a valid promotion source.

`NON_CAUSAL_TYPES` — FACT, UNIT_ECONOMICS, FUNNEL_STATE, SEGMENT_INSIGHT, OFFER_INSIGHT,
CHANNEL_INSIGHT, PRIORITY, RISK, ASSUMPTION, CONTEXT_NOTE, CONSTRAINT: a causal verb in the
claim is stripped/flagged unless it is a preserved 11K interpretation.

`FORBIDDEN_AUTO_TRANSITIONS` — pairs `[from,to]` that the engine will never perform silently:
`['HYPOTHESIS','FACT']`, `['HYPOTHESIS','LEARNING']`, `['ASSUMPTION','FACT']`,
`['ASSUMPTION','LEARNING']`, `['HYPOTHESIS','DIAGNOSIS']`, `['EXPERIMENT_RESULT','FACT']` (a
result is scope-bound, not a global fact), `['DECISION','LEARNING']` (a decision alone is not a
validated lesson).

`isType(t)`, `isForbiddenAutoTransition(from,to)` are the guards.
