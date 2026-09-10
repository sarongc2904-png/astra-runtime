# ASTRA-11H — Customer Journey + Jobs To Be Done Engine — DESIGN

**Mode:** DESIGN + DETERMINISTIC IMPLEMENTATION + ISOLATED OFFLINE BENCHMARKING.
**Boundary:** No ASTRA-11H output may feed production routing or autonomous action.
Deterministic only — no LLM, no network, no DB, no clock (`referenceTime` caller-supplied).
Reuses ASTRA-11B/C/D/E/F/G; creates **no** parallel evidence, provenance, VoC,
customer-model, market or competitor system.

## Pipeline

```
EVIDENCE + VOC (11F) + CUSTOMER MODEL (11G)
   -> JOURNEY OBSERVATIONS (states = analytical, events = grounded)   journey_observation.js · journey_event.js
   -> EVENTS / STATES / TRANSITIONS                                   transition.js
   -> FRICTION / TRIGGERS / QUESTIONS / PROOF / ALTERNATIVES / TOUCHPOINTS
                                     friction.js · trigger.js · question.js · proof_requirement.js · alternative.js · touchpoint.js
   -> METRICS / BOTTLENECKS                                           journey_metrics.js · bottleneck.js
   -> PRE / POST PURCHASE · SEGMENT · COMMITTEE JOURNEYS              post_purchase.js · segment_journey.js · buying_committee_journey.js
   -> JTBD · JOB STATEMENT · FORCES · JOB OUTCOMES                    jtbd.js · job_statement.js · forces.js · job_outcome.js
   -> RETENTION / CHURN · CONFLICTS                                   retention_churn.js · conflicts.js
   -> COVERAGE · COMPLETION · JOURNEY REPORT                          coverage.js · completion.js · report.js · engine.js
```

`engine.runCustomerJourney({ vocResult, customerModel?, researchResult?, businessInput?, referenceTime })`
is the single orchestrator. Every stage validates fail-closed.

## Modules (`astra/src/commercial/journey/` — 27 modules, ~1,849 LoC, `crypto` only)

| module | responsibility | § |
|---|---|---|
| `stage_taxonomy.js` | controlled `JOURNEY_STAGES` (20, incl. UNKNOWN); `cm-journey-stage-v1`; phase grouping; `relation()` FORWARD/REGRESSION/REPEAT | B, C |
| `temporal.js` | `CURRENT / HISTORICAL / UNKNOWN_CURRENT`; `splitByTemporal` — never merged | Y |
| `journey_observation.js` | canonical `JourneyObservation`; controlled concept→stage map; stage reconstruction is ANALYTICAL, never OBSERVED | A |
| `journey_event.js` | `JourneyEvent`; controlled Spanish regex set; events require evidence | D |
| `transition.js` | deterministic `JourneyTransition` from same-customer ordered stages; `detectStalls`; a generic funnel never creates one | E |
| `trigger.js` | reuses ASTRA-11F `VocTrigger` → controlled categories; evidence-backed / UNKNOWN | F |
| `friction.js` | canonical `JourneyFriction`; exact span + stage preserved | G |
| `question.js` | `OBSERVED_QUESTION` vs `ANALYTICAL_INFORMATION_NEED`; marketer assumptions never become questions | H |
| `proof_requirement.js` | `OBSERVED_REQUIRED / ANALYTICAL / UNKNOWN` | I |
| `alternative.js` | reuses ASTRA-11F alternatives; competitor consideration never assumed | J |
| `touchpoint.js` | provider-neutral; `implies_attribution: false` always | K |
| `journey_metrics.js` | counts only; conversion/drop-off/time/attribution are NULL without a denominator | L |
| `bottleneck.js` | `JourneyBottleneckCandidate` — analytical, `is_fact:false`, no causal claim | M |
| `jtbd.js` | canonical `JobToBeDone`; emotional/social jobs need explicit evidence; multiple job kinds | N, Q, S |
| `job_statement.js` | deterministic "When…, I want to…, so I can…"; unknown components stay `[unknown]` | O |
| `forces.js` | four forces; each PRESENT or UNKNOWN; no padded four-force model | P |
| `job_outcome.js` | `JobOutcome`; no fabricated numeric ODI score | R |
| `buying_committee_journey.js` | reuses ASTRA-11G roles; per-role journey only where evidence attributes to it | T |
| `segment_journey.js` | per-segment journeys + difference report; global journey does not erase differences | U |
| `post_purchase.js` | explicit pre / purchase / post journeys | V |
| `retention_churn.js` | evidence-backed signals; `churn_probability: null` | W |
| `conflicts.js` | `CONSISTENT/MIXED/POLARIZED/INSUFFICIENT`; conflict ⇒ likely separate segment journeys | X |
| `coverage.js` / `completion.js` | deterministic `JourneyModelCompletion`; LLM cannot mark complete | Z |
| `report.js` | 26-section `CustomerJourneyReport`; evidence appendix + graph validity; caveats | AA |
| `engine.js` | orchestrator; `provenance_note` | — |

## Non-negotiable disciplines

- **Stages are never invented because they are conventional.** A concept with no stage
  mapping, or an UNKNOWN VoC concept, yields stage `UNKNOWN`.
- **The journey is not forced linear.** Loops, regressions, skipped stages, repeated
  evaluation, stalled states, re-entry and simultaneous journeys are all valid;
  `relation()` labels FORWARD / REGRESSION / REPEAT without constraining them.
- **A transition exists only from same-customer evidence at two stages in an establishable
  order** (timestamp → clause offset → stable id). A generic funnel is not evidence — it
  creates zero transitions.
- **Stage reconstruction is ANALYTICAL** and is never upgraded to OBSERVED. Only an explicit
  event phrase (`journey_event.js`) is OBSERVED.
- **No attribution invention.** A channel in the evidence carries `implies_attribution: false`.
- **No fabricated journey metrics.** `conversion_rate`, `drop_off_rate`,
  `attribution_percentages` are `null`; `average_time_to_purchase` is only from observed
  timestamps.
- **Bottlenecks are analytical only** — `is_fact:false`, `causal_claim:'NONE'`.
- **No psychographic fiction.** Emotional / social jobs require explicit customer language;
  otherwise `UNKNOWN`. Job statements are pure renders of canonical fields.
- **Temporal discipline.** Historical and current journeys are split, never merged.
- **No churn probability.**
- **Determinism.** Same inputs ⇒ identical `report_id`.

## Model-knowledge separation

`engine.runCustomerJourney` reads only ASTRA-11D / 11F / 11G evidence objects and explicit
business input. It invents no stage, event, transition, trigger, friction, question, job, or
metric. Absent evidence → `UNKNOWN` / `INSUFFICIENT`.
