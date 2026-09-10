# OFFER_ARCHITECTURE_CONTRACT — ASTRA-11I

Modules: `offer_architecture.js`, `offer_component.js`, `benefit_model.js`, `mechanism.js`,
`packaging.js`, `urgency_scarcity.js`.

## OfferComponent (§I)

```
{ component_id, component_type, label, detail, status, source_class, value_rationale,
  segment_relevance, segment_refs[], jtbd_refs[], evidence_refs[], constraints[],
  manufactured_block }
```

- **`component_type`** ∈ 20 controlled types (`CORE_OFFER · DELIVERABLE · FEATURE · CAPABILITY ·
  BENEFIT · OUTCOME_LINK · MECHANISM · ONBOARDING · SUPPORT · BONUS · GUARANTEE · PROOF · URGENCY ·
  SCARCITY · PRICING · PAYMENT_TERM · FINANCING · ELIGIBILITY · DISQUALIFIER · CONSTRAINT`).
- **`status`** ∈ `OBSERVED · USER_PROVIDED · COMPUTED · ANALYTICAL · UNKNOWN`.
- **`SUPPLIED_ONLY` = `BONUS · GUARANTEE · SCARCITY · URGENCY · FINANCING · PAYMENT_TERM`** —
  `makeOfferComponent` **force-downgrades** any such component whose status is not
  `USER_PROVIDED`/`UNKNOWN` to `UNKNOWN` with `manufactured_block: true`.
  `validateOfferComponent` rejects a supplied-only type not `USER_PROVIDED` (W25).

## OfferArchitecture (§H)

`buildOfferArchitecture` assembles components from `businessInput.supplied_offer` (all
USER_PROVIDED) + `businessInput.capabilities` + `businessInput.constraints` + the mechanism +
pricing + **real** urgency/scarcity elements + available proof.

- `manufactured_elements` is **always empty** — `validateOfferArchitecture` requires it and
  rejects any BONUS/GUARANTEE/URGENCY/SCARCITY/FINANCING/PAYMENT_TERM component that is not
  `USER_PROVIDED` (W23).
- `unknowns[]` lists the standard components not present (CORE_OFFER, PRICING, MECHANISM,
  PROOF, GUARANTEE, ONBOARDING).

## Benefit discipline (§J) — `benefit_model.js`

`BENEFIT_LEVELS` = `FEATURE · CAPABILITY · FUNCTIONAL_BENEFIT · EMOTIONAL_BENEFIT ·
SOCIAL_BENEFIT · OUTCOME`. Each `BenefitChain` links a supplied feature/capability →
functional benefit (ANALYTICAL, from evidenced desire concepts) → outcome (from the JTBD).

**`emotional_benefit` / `social_benefit` are `UNKNOWN` unless there is explicit customer
language** (emotional: `PAIN_FEAR / RESULTS_UNCERTAINTY / TRUST_CONCERN`; social: a
reputation/image phrase). `validateBenefitChain` requires `basis === 'OBSERVED'` + evidence
for either, and rejects transformation fiction (`transform your life / feel unstoppable /
conviértete en / new you`) (W26–W29).

## Mechanism (§K) — `mechanism.js`

`SUPPLIED_OBSERVED` (business-supplied statement) · `ANALYTICAL_FRAMING` (a framing of
supplied capabilities) · `UNSUPPORTED` · `UNKNOWN`. `invented_process: false` always;
`validateMechanism` rejects an `ANALYTICAL_FRAMING` that names a method
(`método / framework / the X method / 3-step system`) — **no proprietary process is invented**
(W30, W31).

## Packaging (§P) — `packaging.js`

`PACKAGING_TYPES` = `SINGLE_OFFER · TIERED · GOOD_BETTER_BEST · USAGE_BASED · SUBSCRIPTION ·
RETAINER · ONE_TIME · BUNDLE · MODULAR`. Every `PackagingCandidate` is `status: 'ANALYTICAL'`,
`autonomous: false`, cites a `rationale` and `cited_constraints`. `validatePackaging` enforces
all three (W47, W48).

## Urgency / scarcity (§Q) — `urgency_scarcity.js`

Per element (`URGENCY`, `SCARCITY`): `basis ∈ {REAL_OPERATIONAL, REAL_CAPACITY, REAL_DEADLINE,
USER_PROVIDED, UNSUPPORTED, UNKNOWN}`.

- A supplied element is `REAL_*` only when the business names that basis; `USER_PROVIDED` only
  when explicitly `basis: 'USER_PROVIDED'` **with** a detail; **a bare detail is
  `UNSUPPORTED`** (a marketing claim, not a real element).
- `manufactured_any: false`, per-element `manufactured: false` — `validateUrgencyScarcity`
  enforces both.
- Only `REAL_*` / `USER_PROVIDED` elements are added to the offer architecture; an
  `UNSUPPORTED` element never becomes a component (W49–W52).
- A customer-side deadline signal (ASTRA-11H) is recorded as
  `customer_deadline_signal_present` — informational only, it does not create an offer element.
