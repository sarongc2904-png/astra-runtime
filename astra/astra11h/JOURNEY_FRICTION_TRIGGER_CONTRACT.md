# JOURNEY_FRICTION_TRIGGER_CONTRACT — ASTRA-11H

Modules: `trigger.js`, `friction.js`, `question.js`, `proof_requirement.js`, `alternative.js`,
`retention_churn.js`.

## Triggers (§F) — `trigger.js`

`TRIGGER_CATEGORIES`: `PAIN_ESCALATION · DEADLINE · LIFE_EVENT · BUSINESS_EVENT ·
RECOMMENDATION · PROMOTION · FAILURE_OF_CURRENT_SOLUTION · NEW_INFORMATION · BUDGET_AVAILABLE ·
RISK_EVENT · SOCIAL_PROOF · UNKNOWN`.

Reuses the ASTRA-11F `VocTrigger` (no parallel system) via `VOC_TRIGGER_MAP`. Status
`OBSERVED` for an eligible speaker, else `ANALYTICAL`. `validateTrigger` requires a known
category to be evidence-backed; `UNKNOWN` is always allowed and a missing trigger surfaces as
the `MISSING_TRIGGER` completion reason (W11, W12).

## Friction (§G) — `friction.js`

`FRICTION_CATEGORIES`: `PRICE · TRUST · COMPLEXITY · TIME · RISK · PROOF · AVAILABILITY ·
IMPLEMENTATION · INTERNAL_APPROVAL · INFORMATION_GAP · CHANNEL_FRICTION · PAYMENT · ONBOARDING ·
PRODUCT_FIT · UNKNOWN`.

Derived from **OBSERVED, non-negated** ASTRA-11F observations via the controlled
`CONCEPT_FRICTION` map — each friction preserves its **exact verbatim span**, `polarity`, the
`stage` it is evidenced at, and its `evidence_refs`. `validateFriction` requires both the span
and the evidence (W13, W14).

## Questions / information needs (§H) — `question.js`

`QUESTION_STATUS`: `OBSERVED_QUESTION · ANALYTICAL_INFORMATION_NEED · UNKNOWN`.

- `OBSERVED_QUESTION` — a real ASTRA-11F customer question, carrying `verbatim_question` +
  `evidence_refs` + `question_type` + the stage where it bites (W15).
- `ANALYTICAL_INFORMATION_NEED` — reconstructed from a concern concept
  (`PROCESS_UNCLEAR / RESULTS_UNCERTAINTY / TRUST_CONCERN`); `verbatim_question` is `null`,
  the row is explicitly labelled analytical, and it still carries supporting `evidence_refs`
  (W16). `validateQuestion` rejects an analytical need that claims a verbatim question.
- **Marketer assumptions never become customer questions** — only ASTRA-11F questions and
  evidenced concept concerns produce rows.

## Proof requirements (§I) — `proof_requirement.js`

`PROOF_TYPES`: `TESTIMONIALS · CASE_RESULTS · PRICE_TRANSPARENCY · GUARANTEE ·
TECHNICAL_EXPLANATION · CREDENTIAL · DEMONSTRATION · COMPARISON · SAMPLE · TRIAL · UNKNOWN`.
`PROOF_STATUS`: `OBSERVED_REQUIRED` (customer explicitly asks) · `ANALYTICAL` (reconstructed
from a concern) · `UNKNOWN`. Every non-UNKNOWN requirement carries evidence (W17).

## Alternatives (§J) — `alternative.js`

`ALTERNATIVE_TYPES`: `COMPETITOR · DIY · DO_NOTHING · DELAY · INTERNAL_SOLUTION · OTHER_CATEGORY ·
UNKNOWN`. Reuses ASTRA-11F `VocAlternative` via `VOC_ALT_MAP`; `resolved_competitor_id` stays
`null` (inherited rule). `validateAlternative` requires a known alternative to be
evidence-backed — **competitor consideration is never assumed** without evidence, and a
missing alternative surfaces as `MISSING_ALTERNATIVE` (W18, W19).

## Retention / churn signals (§W) — `retention_churn.js`

`SIGNAL_TYPES`: `SATISFACTION · UNMET_EXPECTATION · REPEATED_FRICTION · VALUE_ACHIEVED ·
VALUE_NOT_ACHIEVED · SUPPORT_ISSUE · RENEWAL_INTENT · CANCELLATION_INTENT · EXPANSION_INTENT`.
Every signal is evidence-backed (`validateSignal`) and carries `is_prediction: false`.
**`churn_probability` is always `null`** — a probability would require a validated predictive
model, which ASTRA-11H does not build (W48, W49, W50).
