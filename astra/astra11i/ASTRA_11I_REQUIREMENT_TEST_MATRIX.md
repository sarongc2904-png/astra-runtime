# ASTRA_11I_REQUIREMENT_TEST_MATRIX

Requirement → module → test → status. Harness: `node astra/tests/astra11i.test.js`
→ `ASTRA11I_TEST_RESULT pass=78 fail=0` (W1..W70 + C1..C8 + W-matrix completeness).
Benchmark: `node astra/benchmarks/astra11i/run_positioning_offer_benchmark.js`
→ `ASTRA11I_BENCHMARK_RESULT pass=44 fail=0` (6 verticals + 20 adversarial + 17 dimensions).

| Req | § | Module(s) | Test | Status |
|---|---|---|---|---|
| W1 positioning evidence preserves provenance | A | `positioning_evidence.js` | W1 | PASS |
| W2 evidence-backed positioning territory | B | `positioning_territory.js` | W2 | PASS |
| W3 territory analytical, never market fact | B | `positioning_territory.js` | W3 | PASS |
| W4 unsupported positioning stays HYPOTHESIS/INSUFFICIENT | B | `positioning_territory.js` | W4 | PASS |
| W5 no market-wide uniqueness claim | F | `distinctiveness.js` | W5 | PASS |
| W6 no "unique"/"best" language survives | E | `differentiation.js`, `claim_validation.js` | W6 | PASS |
| W7 segment-specific positioning | B, Z | `positioning_territory.js` | W7 | PASS |
| W8 multi-segment positions preserved | Z | `positioning_territory.js` (`comparePositioning`) | W8 | PASS |
| W9 positioning comparison deterministic | Z | `positioning_territory.js` | W9 | PASS |
| W10 no category invented for novelty | C | `category_frame.js` | W10 | PASS |
| W11 new category only USER_PROVIDED | C | `category_frame.js` | W11 | PASS |
| W12 analytical frame carries evidence | C | `category_frame.js` | W12 | PASS |
| W13 value proposition from canonical supported fields | D | `value_proposition.js` | W13 | PASS |
| W14 VP missing support → PARTIAL/HYPOTHESIS/INSUFFICIENT | D | `value_proposition.js` | W14 | PASS |
| W15 VP render adds no facts / no hype | D | `value_proposition.js` | W15 | PASS |
| W16 differentiation evidence discipline | E | `differentiation.js` | W16 | PASS |
| W17 differentiation distinguishes capability/comparison/hypothesis | E | `differentiation.js` | W17 | PASS |
| W18 DISTINCT_IN_SAMPLE impossible w/o competitor sample | E | `differentiation.js` | W18 | PASS |
| W19 distinctiveness only with a sample | F | `distinctiveness.js` | W19 | PASS |
| W20 positioning fit deterministic + null band | G | `positioning_fit.js` | W20 | PASS |
| W21 configurable positioning fit weights | G | `positioning_fit.js` | W21 | PASS |
| W22 frame reference points from journey alternatives | C | `category_frame.js` | W22 | PASS |
| W23 offer architecture: no manufactured elements | H | `offer_architecture.js` | W23 | PASS |
| W24 every offer component declares source/status | I | `offer_component.js` | W24 | PASS |
| W25 bonus/guarantee/scarcity/urgency only USER_PROVIDED | I | `offer_component.js` | W25 | PASS |
| W26 feature/benefit/outcome separation | J | `benefit_model.js` | W26 | PASS |
| W27 no emotional-benefit fiction | J | `benefit_model.js` | W27 | PASS |
| W28 no social-benefit fiction | J | `benefit_model.js` | W28 | PASS |
| W29 no transformation language | J | `benefit_model.js` | W29 | PASS |
| W30 mechanism: no invented proprietary process | K | `mechanism.js` | W30 | PASS |
| W31 analytical mechanism framing names no method | K | `mechanism.js` | W31 | PASS |
| W32 proof strategy available/required/gap | L | `proof_strategy.js` | W32 | PASS |
| W33 no fabricated proof | L | `proof_strategy.js` | W33 | PASS |
| W34 available proof requires a supplied asset | L | `proof_strategy.js` | W34 | PASS |
| W35 risk reversal analytical only | M | `risk_reversal.js` | W35 | PASS |
| W36 risk reversal no legal/financial viability | M | `risk_reversal.js` | W36 | PASS |
| W37 risk reversal driven by evidenced fear/friction | M | `risk_reversal.js` | W37 | PASS |
| W38 objections grounded in evidence | N | `objection_map.js` | W38 | PASS |
| W39 ADDRESSED only when no remedy gap | N | `objection_map.js` | W39 | PASS |
| W40 partial objection handling preserved | N | `objection_map.js` | W40 | PASS |
| W41 pricing observed/supplied only | O | `pricing.js` | W41 | PASS |
| W42 no willingness-to-pay invention | O | `pricing.js` | W42 | PASS |
| W43 no optimal-price invention | O | `pricing.js` | W43 | PASS |
| W44 no FX conversion unless supplied | O | `pricing.js` | W44 | PASS |
| W45 competitor price conflict surfaced, not reconciled | O, U | `pricing.js`, `offer_gap.js` | W45 | PASS |
| W46 price unknown → UNKNOWN + gap/reason | O, AB | `pricing.js`, `completion.js` | W46 | PASS |
| W47 packaging analytical + non-autonomous | P | `packaging.js` | W47 | PASS |
| W48 packaging cites a rationale | P | `packaging.js` | W48 | PASS |
| W49 no fake urgency | Q | `urgency_scarcity.js` | W49 | PASS |
| W50 no fake scarcity | Q | `urgency_scarcity.js` | W50 | PASS |
| W51 real capacity scarcity accepted as USER_PROVIDED | Q, H | `urgency_scarcity.js`, `offer_architecture.js` | W51 | PASS |
| W52 manufactured_any is false | Q | `urgency_scarcity.js` | W52 | PASS |
| W53 offer-segment fit deterministic | R | `offer_segment_fit.js` | W53 | PASS |
| W54 offer-segment fit null score when insufficient | R | `offer_segment_fit.js` | W54 | PASS |
| W55 offer-journey fit ≠ one offer fits all stages | S | `offer_journey_fit.js` | W55 | PASS |
| W56 journey-stage mismatch surfaced | S, U | `offer_journey_fit.js`, `offer_gap.js` | W56 | PASS |
| W57 competitor comparison scoped to evidence; no "better" | T | `competitor_comparison.js` | W57 | PASS |
| W58 competitor comparison UNKNOWN with no sample | T | `competitor_comparison.js` | W58 | PASS |
| W59 gaps are analytical | U | `offer_gap.js` | W59 | PASS |
| W60 opportunity non-autonomous | V | `offer_opportunity.js` | W60 | PASS |
| W61 expected lift NOT_ESTIMATED | V | `offer_opportunity.js` | W61 | PASS |
| W62 message foundation grounded, not ad copy | W | `message_foundation.js` | W62 | PASS |
| W63 message foundation reuses ASTRA-11F buying language | W | `message_foundation.js` | W63 | PASS |
| W64 factual/comparative/outcome claims require evidence | X | `claim_validation.js` | W64 | PASS |
| W65 unsupported claim downgraded/rejected | X | `claim_validation.js` | W65 | PASS |
| W66 conflicts preserved | Y | `conflicts.js` | W66 | PASS |
| W67 business constraints preserved | A, AA | `positioning_evidence.js`, `offer_architecture.js` | W67 | PASS |
| W68 deterministic completion | AB | `completion.js` | W68 | PASS |
| W69 valid evidence graph + 31 sections | AC | `report.js` | W69 | PASS |
| W70 no production routing / autonomous action | AC | `report.js`, `engine.js`, `offer_opportunity.js` | W70 | PASS |
| C1 ASTRA-11B compatibility | AE | provenance / schema reuse | C1 | PASS |
| C2 ASTRA-11C compatibility | AE | ingestion envelopes via ASTRA-11D | C2 | PASS |
| C3 ASTRA-11D compatibility | AE | `positioning_evidence.js`, `pricing.js` | C3 | PASS |
| C4 ASTRA-11E compatibility | AE | shared schema-version conventions | C4 | PASS |
| C5 ASTRA-11F/G/H consumed unchanged | AE | `engine.js` | C5 | PASS |
| C6 no network | AD | all `positioning_offer/*` (source scan) | C6 | PASS |
| C7 no production DB | AD | all `positioning_offer/*` (source scan) | C7 | PASS |
| C8 ASTRA-10 freeze unchanged + stable hashes + benchmark isolation | AD, AF | `benchmarks/astra10ah/freeze.json`, `report.js`, `benchmarks/astra11i/` | C8 | PASS |
