# JOURNEY_STAGE_TRANSITION_CONTRACT — ASTRA-11H

Modules: `transition.js`, `journey_metrics.js`, `bottleneck.js`, `touchpoint.js`,
`segment_journey.js`, `buying_committee_journey.js`, `post_purchase.js`, `conflicts.js`.

## JourneyTransition (§E)

```
{ transition_id, subject_ref, from_state, to_state, relation ∈ {FORWARD, REGRESSION, REPEAT, UNKNOWN},
  from_observation, to_observation, evidence_refs[], trigger_refs[], friction_refs[],
  temporal_basis ∈ {TIMESTAMP_ORDERED, CLAUSE_ORDERED, UNORDERED_SEQUENCE},
  transition_status ∈ {OBSERVED, SUPPORTED_ANALYTICAL, UNKNOWN}, confidence }
```

- A transition is built **only** from the SAME customer (`subject_ref`) evidenced at two
  different stages, in an order established by: explicit timestamp → clause offset within
  one utterance → stable observation id.
- **`transition_status`**: `OBSERVED` only when both endpoints are grounded EVENT
  observations with ≥ 2 distinct timestamps (`validateTransition` enforces
  `temporal_basis === 'TIMESTAMP_ORDERED'`); otherwise `SUPPORTED_ANALYTICAL`.
- **A generic funnel never creates a transition** — an unattributed observation cannot
  anchor one; `validateTransition` rejects a transition with no `evidence_refs` (W9, W10).
- **Non-linear journeys are first-class.** No constraint forces `to_state` after `from_state`;
  `relation()` labels FORWARD / REGRESSION / REPEAT. `detectStalls` surfaces repeated-stage
  instances and regression instances — preserved, not smoothed (W4–W7).

## Journey metrics discipline (§L) — `journey_metrics.js`

Deterministic counts only: `observed_transition_count`, `observed_event_count`,
`observed_stall_count`, `observed_regression_count`, `repeated_stage_count`,
`observed_stage_coverage`, `elapsed_durations` (only for subjects with ≥ 2 timestamped
observations).

**Explicitly `null`**: `conversion_rate`, `drop_off_rate`, `attribution_percentages` — a
review/VoC sample has no valid funnel denominator. `average_time_to_purchase` is `null`
unless computed from observed timestamps (`basis: 'OBSERVED_TIMESTAMPS'`).
`validateMetrics` rejects any non-null fabricated rate (W21–W24).

## JourneyBottleneckCandidate (§M) — `bottleneck.js`

Analytical only. Reason codes: `REPEATED_FRICTION · STAGE_STALL · REGRESSION ·
ABANDONMENT_EVENT · HIGH_OBJECTION_FREQUENCY · LONG_DURATION · TRANSITION_FAILURE_EVIDENCE`.
Output carries `candidate_location`, `evidence_refs[]`, `coverage`, `confidence`,
`reason_codes[]`, `sufficiency ∈ {SUFFICIENT_FOR_HYPOTHESIS, WEAK_HINT}`, and always
`is_fact: false`, `is_recommendation: false`, `causal_claim: 'NONE'`. `validateBottleneck`
enforces all three and requires evidence for a `SUFFICIENT_FOR_HYPOTHESIS` candidate — **no
causal bottleneck is claimed** (W25, W26).

## Touchpoints (§K) — `touchpoint.js`

`TOUCHPOINTS` (18) provider-neutral. Derived from ASTRA-11C source types + explicit events.
Every touchpoint carries `implies_attribution: false` and the note *"a channel appearing in
evidence does NOT imply it influenced or caused the decision"*. `validateTouchpoint` rejects
`implies_attribution !== false` (W20).

## Segment journeys (§U) — `segment_journey.js`

One `SegmentJourney` per ASTRA-11G segment (stages / transitions / frictions / triggers /
proof requirements restricted to that segment's confirmed members). A `differences[]` report
lists per-pair friction/proof/trigger symmetric differences; `segments_differ` is true iff
`differences` is non-empty. **The global journey map does not overwrite these** (W45, W46).

## Buying-committee journeys (§T) — `buying_committee_journey.js`

B2C → `NOT_APPLICABLE`. B2B → one `RoleJourney` per ASTRA-11G buying role, reconstructed
**only** from evidence attributed to that role (`member.evidence_refs` +
`businessInput.role_journey_evidence[ROLE]`). A role with no attributed evidence →
`status: 'UNKNOWN'` — its journey is **not assumed to match** other roles. `roles_differ` is
set when evidenced roles diverge on friction / proof (W43, W44).

## Pre / post-purchase (§V) — `post_purchase.js`

Explicit `PrePurchaseJourney`, `PurchaseMoment`, `PostPurchaseJourney` (by `phaseOf`).
Post-purchase stages are only `EVIDENCED` where evidence exists; otherwise `UNKNOWN` (not
fabricated). The engine does not stop at purchase (W47).

## Journey conflicts (§X) — `conflicts.js`

`CONSISTENT / MIXED / POLARIZED / INSUFFICIENT` over dimensions `PURCHASE_PATH_LENGTH`
(immediate buyers vs long comparers), `ENTRY_PATH` (referral vs self-directed), plus
persona-level conflicts carried from ASTRA-11G. A `MIXED`/`POLARIZED` conflict is preserved
and flagged `likely_separate_segment_journeys: true` (W51, W52).
