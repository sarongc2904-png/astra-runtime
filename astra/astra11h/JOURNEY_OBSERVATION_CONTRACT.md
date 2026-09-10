# JOURNEY_OBSERVATION_CONTRACT — ASTRA-11H

Modules: `journey_observation.js`, `journey_event.js`, `temporal.js`. Schema `ucdm-journey-1.0.0`.

## JourneyObservation (§A)

```
{ observation_id, schema_version, kind: 'JourneyObservation',
  element ∈ {EVENT, STATE, TRANSITION_HINT, TRIGGER, FRICTION, QUESTION, ALTERNATIVE,
            PROOF_NEED, OUTCOME, CHANNEL, UNKNOWN},
  stage, stage_basis ∈ {OBSERVED, ANALYTICAL, UNKNOWN}, phase, detail, span,
  channel, timestamp, temporal_status, temporal_age_days,
  subject_ref, segment_refs[], persona_refs[], speaker_role, speaker_pseudonym,
  source_ref, evidence_refs[], source_class, utterance_ref, negated, prior_experience,
  status ∈ {OBSERVED, COMPUTED, ANALYTICAL, UNKNOWN}, confidence, generated_by }
```

### Status discipline

- A **STATE** observation carries a stage reconstructed from the controlled
  `CONCEPT_STAGE` map — `stage_basis: 'ANALYTICAL'`, and `status` is **`ANALYTICAL`** (or
  `UNKNOWN` when the concept has no mapping). `validateJourneyObservation` rejects an
  analytically-reconstructed STATE stage marked `OBSERVED` (W2).
- An **EVENT** observation is produced only from an explicit customer phrasing
  (`journey_event.js`); `stage_basis: 'OBSERVED'` and `status: 'OBSERVED'` for an eligible
  speaker, `ANALYTICAL` otherwise (W1).
- Every non-`UNKNOWN` observation carries `evidence_refs`. An `INFERRED` source class can
  never be `OBSERVED`.
- The stage is always one of the 20 controlled `JOURNEY_STAGES`; an unmapped / UNKNOWN VoC
  concept → `stage: 'UNKNOWN'` (W3).

## JourneyEvent (§D)

`EVENT_TYPES` (17): `PAIN_BECAME_URGENT · RECOMMENDATION_RECEIVED · AD_SEEN · SEARCH_PERFORMED ·
WEBSITE_VISIT · INQUIRY_SENT · QUOTE_REQUESTED · COMPETITOR_EVALUATED · OBJECTION_RAISED ·
PAYMENT_ATTEMPTED · PURCHASE_COMPLETED · ONBOARDING_STARTED · PRODUCT_FIRST_USED ·
RESULT_ACHIEVED · RENEWAL_CONSIDERED · CANCELLATION_REQUESTED · UNKNOWN`.

Detection is a **controlled Spanish regex set** (`EVENT_RULES`) over verbatim utterance text;
each rule maps a phrasing to an event + the stage it evidences. `validateEvent` fails closed
without `grounded_in_evidence` + `evidence_refs`. **An event is never inferred because it is
typical** (W8).

## Stage taxonomy (§B) — `cm-journey-stage-v1`

`PROBLEM_EMERGENCE · PROBLEM_RECOGNITION · INFORMATION_SEEKING · SOLUTION_EXPLORATION ·
ALTERNATIVE_COMPARISON · VENDOR_EVALUATION · PURCHASE_INTENT · PURCHASE_DECISION · PURCHASE ·
ONBOARDING · ACTIVATION · ADOPTION · VALUE_REALIZATION · RETENTION · EXPANSION · ADVOCACY ·
CHURN_RISK · CHURN · WIN_BACK · UNKNOWN`.

No journey is required to contain every stage; no linear order is imposed (§C). `phaseOf`
groups stages into `PRE_PURCHASE / PURCHASE / POST_PURCHASE / UNKNOWN` for reporting only —
never to fabricate a missing stage.

## Temporal discipline (§Y) — `temporal.js`

`TEMPORAL_STATUS` = `CURRENT · HISTORICAL · UNKNOWN_CURRENT`. `classifyTemporal(timestamp,
referenceTime)` — no implicit clock; records older than 365 days vs `referenceTime` are
`HISTORICAL`. `splitByTemporal` returns `{ current, historical, unknown }` — the report
carries `temporal_separation.merged: false`; historical and current journeys are **never
silently merged** (W53, W54).
