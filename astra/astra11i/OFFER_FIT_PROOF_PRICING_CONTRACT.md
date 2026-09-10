# OFFER_FIT_PROOF_PRICING_CONTRACT — ASTRA-11I

Modules: `proof_strategy.js`, `risk_reversal.js`, `objection_map.js`, `pricing.js`,
`offer_segment_fit.js`, `offer_journey_fit.js`, `competitor_comparison.js`, `offer_gap.js`,
`offer_opportunity.js`.

## Proof strategy (§L) — `proof_strategy.js`

`PROOF_TYPES` (10): `TESTIMONIAL · CASE_STUDY · QUANTIFIED_RESULT · DEMONSTRATION · CREDENTIAL ·
COMPARISON · GUARANTEE · SAMPLE_TRIAL · PROCESS_TRANSPARENCY · THIRD_PARTY_VALIDATION`.

Per item: `AVAILABLE_PROOF` (a `businessInput.proof_assets` entry, USER_PROVIDED) ·
`REQUIRED_PROOF` (an ASTRA-11H customer proof requirement) · `PROOF_GAP` (required, not
available) · `UNKNOWN`. Every item carries `fabricated: false`. `validateProofStrategy`
requires `AVAILABLE_PROOF` to have a business-supplied asset — **ASTRA never fabricates a
testimonial or result** (W32–W34).

## Risk reversal (§M) — `risk_reversal.js`

`REVERSAL_TYPES` = `GUARANTEE · TRIAL · STAGED_COMMITMENT · CANCELABILITY · MILESTONE_PAYMENT ·
TRANSPARENT_SCOPE · PROOF_BEFORE_PURCHASE`. Each `RiskReversalCandidate` is
`status: 'ANALYTICAL'`, `legal_financial_viability: 'NOT_ASSESSED'`, `is_recommendation: false`,
driven by an evidenced customer fear/friction (`evidence_refs` required).
`validateRiskReversal` enforces all of that — **ASTRA does not assert legal or financial
viability** (W35–W37).

## Objection-Offer map (§N) — `objection_map.js`

`HANDLING_STATUS` = `ADDRESSED · PARTIALLY_ADDRESSED · UNADDRESSED · UNKNOWN`. Per objection
concept (from ASTRA-11F OBJECTION/FEAR/BARRIER clusters), the controlled `OBJECTION_REMEDY`
map names the proof / component / risk-reversal that would fully address it. Status:
- `ADDRESSED` — every remedy element is present.
- `PARTIALLY_ADDRESSED` — some present.
- `UNADDRESSED` — none present and no risk-reversal candidate.
`validateObjectionMapping` rejects `ADDRESSED` while `remaining_gap` is non-empty — **an
objection is never marked solved when only partially addressed** (W38–W40).

## Pricing intelligence (§O) — `pricing.js`

- `observed_competitor_prices` + `observed_price_stats` from ASTRA-11D (per-currency; first
  currency block, deterministic).
- `own_supplied_price` / `price_range` / `payment_structure` / `financing` / `discount` —
  `USER_PROVIDED` or `{ status: 'UNKNOWN' }`.
- **`willingness_to_pay: 'NOT_ESTIMATED'`**, **`optimal_price: 'NOT_ESTIMATED'`**,
  **`fx_applied: false`** — `validatePricing` enforces all three and rejects a non-
  `USER_PROVIDED` own price (W41–W44).
- `price_conflict` flags a `WIDE_PRICE_SPREAD` (observed competitor prices vary ≥ 2×) —
  surfaced, **not reconciled** (W45); a missing price surfaces as `MISSING_PRICING` /
  `PRICING_AMBIGUITY` (W46).

## Offer-segment fit (§R) — `offer_segment_fit.js`

`FIT_DIMENSIONS` (9): `problem_severity · desired_outcome · urgency · budget_signal ·
solution_fit · implementation_fit · proof_fit · friction_resolution · jtbd_fit`.
Deterministic weighted score, `cm-offer-segment-fit-w1` (configurable). Below 0.5 covered
weight-mass → `total_score: null`, band `UNKNOWN` (`STRONG / GOOD / WEAK / POOR / UNKNOWN`).
Identical inputs ⇒ identical `fit_id` (W53, W54).

## Offer-journey fit (§S) — `offer_journey_fit.js`

Per journey stage: does the offer address that stage's evidenced frictions / questions / proof
needs? Status `ADDRESSED · PARTIALLY_ADDRESSED · NOT_ADDRESSED · NO_EVIDENCED_NEED_AT_STAGE`.
**`assumes_one_offer_fits_all_stages: false`** — `validateOfferJourneyFit` enforces it (W55,
W56).

## Competitor comparison (§T) — `competitor_comparison.js`

`COMPARISON_STATUS` = `SAME · STRONGER_EVIDENCE · WEAKER_EVIDENCE · DIFFERENTIATED ·
NOT_OBSERVED · UNKNOWN`. Only observed/supported dimensions are compared; `scoped_to_evidence:
true`; **`better_claims: []`** — `validateCompetitorComparison` rejects any populated
`better_claims` and any `DIFFERENTIATED` with an empty competitor sample (W57, W58).

## Offer gaps & opportunities (§U §V) — `offer_gap.js`, `offer_opportunity.js`

`GAP_TYPES` (10): `MISSING_PROOF · MISSING_RISK_REVERSAL · UNADDRESSED_OBJECTION ·
WEAK_JTBD_LINKAGE · UNCLEAR_MECHANISM · PRICING_AMBIGUITY · IMPLEMENTATION_FRICTION ·
SEGMENT_MISMATCH · JOURNEY_MISMATCH · COMPETITOR_PARITY`. Every gap is `status: 'ANALYTICAL'`,
`is_fact: false` (W59).

`OfferOpportunity` — `autonomous: false`, **`expected_lift: 'NOT_ESTIMATED'`**, `effort_complexity`
only when supplied. `validateOpportunity` enforces both (W60, W61).

## OfferModelCompletion (§AB) — `completion.js`

`COMPLETE_FOR_SCOPE · PARTIAL · INSUFFICIENT · BLOCKED`;
`generated_by: 'deterministic:ucdm/positioning_offer/completion'` — **an LLM can never mark
completion.** Reason codes: `LOW_MARKET_EVIDENCE · LOW_VOC_COVERAGE · LOW_SEGMENT_COVERAGE ·
LOW_JTBD_COVERAGE · MISSING_PROBLEM · MISSING_DESIRED_OUTCOME · MISSING_DIFFERENTIATOR ·
MISSING_PROOF · MISSING_PRICING · MISSING_BUSINESS_CAPABILITY · UNADDRESSED_CORE_OBJECTION ·
COMPETITOR_PARITY · POSITIONING_CONFLICT · OFFER_SEGMENT_MISMATCH · SOURCE_FAILURE` (W68).
Deterministic — identical inputs ⇒ identical `completion_id`.
