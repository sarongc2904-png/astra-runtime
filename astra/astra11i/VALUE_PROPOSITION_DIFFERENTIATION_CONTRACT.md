# VALUE_PROPOSITION_DIFFERENTIATION_CONTRACT — ASTRA-11I

Modules: `value_proposition.js`, `differentiation.js`, `message_foundation.js`,
`claim_validation.js`.

## ValueProposition (§D)

```
{ value_proposition_id, segment_ref, frame_ref, jtbd_ref,
  slots: { target, problem, desired_outcome, mechanism, differentiation,
           reason_to_believe, proof, constraints },
  status ∈ {SUPPORTED, PARTIAL, HYPOTHESIS, INSUFFICIENT},
  known_slots[], unknown_slots[], evidence_refs[], rendered, confidence }
```

- Each slot is populated **only from a canonical supported field** of ASTRA-11F/G/H or
  business input, or `{ status: 'UNKNOWN' }`.
- **`status`**: `SUPPORTED` needs target + problem + desired_outcome plus ≥ 5 known slots;
  `PARTIAL` needs ≥ 2 of the core three; `HYPOTHESIS` ≥ 1 known; else `INSUFFICIENT` (W13, W14).
- `rendered` is a **pure deterministic template**: *"For [target] facing [problem], we help
  achieve [outcome] via [mechanism]."* — unknown slots render literally as `[unknown ...]`;
  `is_analytical: true`, `adds_no_new_facts: true`. `validateValueProposition` rejects a
  present non-USER_PROVIDED slot with no evidence, and rejects hype
  (`guaranteed results / the only / world-class / revolucionari / transformar tu vida`) (W15).

## DifferentiationCandidate (§E)

```
{ differentiation_id, differentiation_type, observed_capability, market_comparison,
  analytical_hypothesis, uniqueness_status, customer_relevance, confidence }
```

- **`differentiation_type`** ∈ `PRODUCT · SERVICE · PROCESS · SPEED · CONVENIENCE · EXPERTISE ·
  PROOF · RISK_REVERSAL · PRICING_MODEL · PACKAGING · ACCESS · EXPERIENCE · SPECIALIZATION ·
  OUTCOME_FOCUS · UNKNOWN`.
- **Every candidate distinguishes three things** (W17):
  - `observed_capability` — a business-supplied (USER_PROVIDED) or evidenced capability;
  - `market_comparison` — `NO_COMPETITOR_SAMPLE` / `ALSO_OBSERVED_IN_COMPETITOR_SAMPLE` /
    `NOT_OBSERVED_IN_COMPETITOR_SAMPLE`, with the competitor sample size;
  - `analytical_hypothesis` — whether customer evidence shows the differentiation matters.
- **`uniqueness_status`** ∈ `NOT_ASSERTED · DISTINCT_IN_SAMPLE · PARITY_IN_SAMPLE · UNKNOWN`.
  `DISTINCT_IN_SAMPLE` is impossible with an empty competitor sample (`validateDifferentiation`,
  W18). **No `unique` / `the best` / `#1` / `market-leading` language** survives validation
  (W6, W16).
- `customer_relevance` is `EVIDENCED` only when a VoC concept supports the type.

## MessageFoundation (§W) — `message_foundation.js`

Canonical fields only — `primary_problem`, `desired_progress`, `differentiator`,
`reason_to_believe`, `objection`, `proof`, `cta_intent`, `buying_language_refs`. Each present
non-UNKNOWN field carries `evidence_refs` (`validateMessageFoundation`). `is_ad_copy: false`;
`buying_language_refs` reuses the ASTRA-11F library (`contains_generated_copy: false`).
**Ad-copy generation is explicitly deferred to a later controlled runtime layer** (W62, W63).

## OfferClaim (§X) — `claim_validation.js`

`CLAIM_TYPES` = `FACTUAL · COMPARATIVE · OUTCOME · PROCESS · PROOF · ANALYTICAL`.
`REQUIRE_EVIDENCE` = `FACTUAL · COMPARATIVE · OUTCOME`.

`makeOfferClaim` verdict:
- `REJECTED` — a `COMPARATIVE` claim with no defined dimension, or any hype/superlative
  (`guaranteed / the best / #1 / único / revolutionary / change your life`).
- `DOWNGRADED_TO_ANALYTICAL` — a FACTUAL/COMPARATIVE/OUTCOME claim with no `evidence_refs`.
- `ACCEPTED` — otherwise.

`deriveClaims` produces claims deterministically from the assembled territories,
differentiation, proof strategy and competitor comparison; `validateClaim` re-checks that an
`ACCEPTED` factual/comparative/outcome claim carries evidence and no hype (W64, W65).
