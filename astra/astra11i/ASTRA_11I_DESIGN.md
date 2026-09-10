# ASTRA-11I — Positioning + Offer Intelligence Engine — DESIGN

**Mode:** DESIGN + DETERMINISTIC IMPLEMENTATION + ISOLATED OFFLINE BENCHMARKING.
**Boundary:** No ASTRA-11I output may feed production routing or autonomous action.
Deterministic only — no LLM, no network, no DB, no clock (`referenceTime` caller-supplied).
Reuses ASTRA-11B/C/D/E/F/G/H; creates **no** parallel market, competitor, VoC, persona, ICP,
journey, JTBD, evidence or provenance system.

## Pipeline

```
MARKET (11D) + COMPETITION (11E) + VOC (11F) + ICP/PERSONA (11G) + JOURNEY/JTBD (11H)
  -> POSITIONING EVIDENCE            positioning_evidence.js
  -> DIFFERENTIATION + DISTINCTIVENESS   differentiation.js · distinctiveness.js
  -> CATEGORY FRAME                  category_frame.js
  -> POSITIONING TERRITORIES (per segment) + comparison   positioning_territory.js
  -> VALUE PROPOSITIONS + POSITIONING FIT   value_proposition.js · positioning_fit.js
  -> OFFER PRIMITIVES               mechanism.js · pricing.js · proof_strategy.js · risk_reversal.js · urgency_scarcity.js
  -> OFFER ARCHITECTURE + COMPONENTS + BENEFIT MAP   offer_architecture.js · offer_component.js · benefit_model.js
  -> OBJECTION MAP · PACKAGING       objection_map.js · packaging.js
  -> OFFER-SEGMENT FIT · OFFER-JOURNEY FIT · COMPETITOR COMPARISON
                                     offer_segment_fit.js · offer_journey_fit.js · competitor_comparison.js
  -> OFFER GAPS · OPPORTUNITIES      offer_gap.js · offer_opportunity.js
  -> MESSAGE FOUNDATIONS · CLAIMS · CONFLICTS   message_foundation.js · claim_validation.js · conflicts.js
  -> COMPLETION · REPORT             completion.js · report.js · engine.js
```

`engine.runPositioningOffer({ vocResult, customerModel?, journeyResult?, researchResult?, competitorResult?, businessInput?, referenceTime })`
is the single orchestrator. Every stage validates fail-closed.

## Modules (`astra/src/commercial/positioning_offer/` — 29 modules, ~2,104 LoC, `crypto` only)

| module | responsibility | § |
|---|---|---|
| `positioning_evidence.js` | `PositioningEvidence` — provenance-preserving projection over 11D/E/F/G/H + business input; no new evidence | A |
| `positioning_territory.js` | `PositioningTerritory` (SUPPORTED/PARTIAL/HYPOTHESIS/INSUFFICIENT), `is_market_fact:false`; per-segment; `comparePositioning` | B, Z |
| `category_frame.js` | controlled `FRAME_TYPES`; new/alternative category only USER_PROVIDED | C |
| `value_proposition.js` | `ValueProposition` from canonical supported slots only; deterministic render; UNKNOWN slots stay `[unknown]` | D |
| `differentiation.js` | `DifferentiationCandidate` — observed capability / market comparison / analytical hypothesis; no "unique"/"best" | E |
| `distinctiveness.js` | overlap / whitespace / contested vs observed competitor sample; `market_wide_uniqueness_claim: 'NOT_ASSERTED'` | F |
| `positioning_fit.js` | deterministic, configurable weights; band UNKNOWN below coverage | G |
| `offer_architecture.js` / `offer_component.js` | `OfferArchitecture` / `OfferComponent`; BONUS/GUARANTEE/SCARCITY/URGENCY/FINANCING/PAYMENT_TERM are USER_PROVIDED-only (gated) | H, I |
| `benefit_model.js` | feature→capability→functional→emotional→social→outcome; emotional/social need explicit evidence | J |
| `mechanism.js` | SUPPLIED_OBSERVED / ANALYTICAL_FRAMING / UNSUPPORTED; no invented proprietary process | K |
| `proof_strategy.js` | AVAILABLE_PROOF / REQUIRED_PROOF / PROOF_GAP; assets USER_PROVIDED only, never fabricated | L |
| `risk_reversal.js` | `RiskReversalCandidate` — ANALYTICAL; `legal_financial_viability: 'NOT_ASSESSED'` | M |
| `objection_map.js` | OBJECTION → component/proof/reversal; ADDRESSED only with no remedy gap | N |
| `pricing.js` | observed-competitor + business-supplied only; `willingness_to_pay`/`optimal_price` = `NOT_ESTIMATED`; `fx_applied:false` | O |
| `packaging.js` | `PackagingCandidate` — ANALYTICAL, non-autonomous, cites rationale | P |
| `urgency_scarcity.js` | REAL_OPERATIONAL/REAL_CAPACITY/REAL_DEADLINE/USER_PROVIDED/UNSUPPORTED/UNKNOWN; `manufactured_any:false` | Q |
| `offer_segment_fit.js` / `offer_journey_fit.js` | deterministic; `assumes_one_offer_fits_all_stages: false` | R, S |
| `competitor_comparison.js` | scoped to observed dimensions; `better_claims: []` | T |
| `offer_gap.js` / `offer_opportunity.js` | analytical gaps; opportunities `autonomous:false`, `expected_lift:'NOT_ESTIMATED'` | U, V |
| `message_foundation.js` | canonical fields only, `is_ad_copy:false`; buying language reuses 11F library | W |
| `claim_validation.js` | `OfferClaim` — FACTUAL/COMPARATIVE/OUTCOME require evidence → ACCEPTED / DOWNGRADED_TO_ANALYTICAL / REJECTED | X |
| `conflicts.js` | CONSISTENT/MIXED/POLARIZED/INSUFFICIENT; no universal positioning forced | Y |
| `completion.js` | deterministic `OfferModelCompletion`; LLM cannot mark complete | AB |
| `report.js` | 31-section `PositioningOfferReport`; evidence appendix + graph validity; caveats | AC |
| `engine.js` | orchestrator; `provenance_note` | — |

## Non-negotiable disciplines

- **Positioning territories and value propositions are analytical**, never market facts.
- **No market-wide uniqueness** is claimed from an incomplete competitor sample; a differentiation
  is at most `DISTINCT_IN_SAMPLE`, and only with a non-empty competitor sample.
- **Per-segment positioning is preserved** — `comparePositioning` reports differences;
  `universal_positioning_forced: false`.
- **Bonuses / guarantees / scarcity / urgency / financing / payment terms exist only when the
  business supplies them** — `offer_component.js` force-downgrades any other status to UNKNOWN.
- **Emotional / social benefits require explicit customer language** — otherwise UNKNOWN;
  no transformation fiction.
- **Pricing** is observed-competitor / business-supplied only — no willingness-to-pay, no
  optimal price, no FX conversion.
- **Proof assets are USER_PROVIDED only** — ASTRA never fabricates a testimonial or result;
  required-but-unavailable proof is a `PROOF_GAP`.
- **Objections** are never marked ADDRESSED while a remedy gap remains.
- **Gaps and opportunities are analytical and non-autonomous**; `expected_lift: 'NOT_ESTIMATED'`.
- **Message foundations are canonical fields, not ad copy** — copy generation is a later layer.
- **Claims**: every FACTUAL / COMPARATIVE / OUTCOME claim needs evidence, else downgraded or rejected.
- **Determinism**: same inputs ⇒ identical `report_id`.

## Model-knowledge separation

`engine.runPositioningOffer` reads only ASTRA-11D/E/F/G/H evidence objects and explicit
business input. It invents no market fact, customer motivation, competitor claim, price,
willingness-to-pay, proof asset, expected lift, or commercial outcome. Absent evidence →
`UNKNOWN` / `HYPOTHESIS` / `INSUFFICIENT`.
