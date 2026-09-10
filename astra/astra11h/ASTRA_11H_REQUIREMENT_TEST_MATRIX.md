# ASTRA_11H_REQUIREMENT_TEST_MATRIX

Requirement → module → test → status. Harness: `node astra/tests/astra11h.test.js`
→ `ASTRA11H_TEST_RESULT pass=71 fail=0` (W1..W60 + C1..C11 + W-matrix completeness).
Benchmark: `node astra/benchmarks/astra11h/run_journey_benchmark.js`
→ `ASTRA11H_BENCHMARK_RESULT pass=40 fail=0` (6 verticals + 18 adversarial + 16 dimensions).

| Req | § | Module(s) | Test | Status |
|---|---|---|---|---|
| W1 observed journey evidence accepted | A, D | `journey_event.js`, `journey_observation.js` | W1 | PASS |
| W2 analytical journey marked analytical | A | `journey_observation.js` | W2 | PASS |
| W3 unsupported journey stage remains UNKNOWN | B | `journey_observation.js`, `stage_taxonomy.js` | W3 | PASS |
| W4 journey not forced linear | C | `transition.js`, `report.js` | W4 | PASS |
| W5 skipped stages allowed | C | `transition.js` | W5 | PASS |
| W6 loops allowed | C | `transition.js` (`detectStalls`) | W6 | PASS |
| W7 regressions allowed | C | `transition.js` (`relation`) | W7 | PASS |
| W8 journey event requires evidence | D | `journey_event.js` | W8 | PASS |
| W9 transition requires evidence | E | `transition.js` | W9 | PASS |
| W10 generic funnel does not create transition | E | `transition.js` | W10 | PASS |
| W11 trigger evidence-backed | F | `trigger.js` | W11 | PASS |
| W12 unknown trigger allowed | F | `trigger.js` | W12 | PASS |
| W13 friction evidence-backed | G | `friction.js` | W13 | PASS |
| W14 controlled friction taxonomy | G | `friction.js` | W14 | PASS |
| W15 observed question grounded | H | `question.js` | W15 | PASS |
| W16 analytical information need marked analytical | H | `question.js` | W16 | PASS |
| W17 proof requirement grounded | I | `proof_requirement.js` | W17 | PASS |
| W18 alternative grounded | J | `alternative.js` | W18 | PASS |
| W19 do-nothing alternative supported | J | `alternative.js` | W19 | PASS |
| W20 channel does not imply attribution | K | `touchpoint.js` | W20 | PASS |
| W21 deterministic observed counts | L | `journey_metrics.js` | W21 | PASS |
| W22 no fabricated conversion rate | L | `journey_metrics.js` | W22 | PASS |
| W23 no fabricated drop-off rate | L | `journey_metrics.js` | W23 | PASS |
| W24 no fabricated time-to-purchase | L | `journey_metrics.js` | W24 | PASS |
| W25 bottleneck is analytical | M | `bottleneck.js` | W25 | PASS |
| W26 bottleneck requires evidence | M | `bottleneck.js` | W26 | PASS |
| W27 JTBD requires evidence | N | `jtbd.js` | W27 | PASS |
| W28 functional job supported | N | `jtbd.js` | W28 | PASS |
| W29 unsupported emotional job UNKNOWN | Q | `jtbd.js` | W29 | PASS |
| W30 unsupported social job UNKNOWN | Q | `jtbd.js` | W30 | PASS |
| W31 job statement adds no facts | O | `job_statement.js` | W31 | PASS |
| W32 push force grounded | P | `forces.js` | W32 | PASS |
| W33 pull force grounded | P | `forces.js` | W33 | PASS |
| W34 anxiety force grounded | P | `forces.js` | W34 | PASS |
| W35 habit force grounded | P | `forces.js` | W35 | PASS |
| W36 missing force remains UNKNOWN | P | `forces.js` | W36 | PASS |
| W37 outcome evidence-backed | R | `job_outcome.js` | W37 | PASS |
| W38 no fake ODI score | R | `job_outcome.js` | W38 | PASS |
| W39 buying job separate from usage job | S | `jtbd.js`, `engine.js` | W39 | PASS |
| W40 retention job separate | S | `jtbd.js`, `engine.js` | W40 | PASS |
| W41 expansion job separate | S | `jtbd.js`, `engine.js` | W41 | PASS |
| W42 multiple jobs supported | S | `engine.js` | W42 | PASS |
| W43 B2B roles may have different journeys | T | `buying_committee_journey.js` | W43 | PASS |
| W44 role journey evidence required | T | `buying_committee_journey.js` | W44 | PASS |
| W45 segment-specific journeys preserved | U | `segment_journey.js` | W45 | PASS |
| W46 global journey does not erase differences | U | `segment_journey.js`, `conflicts.js` | W46 | PASS |
| W47 post-purchase supported | V | `post_purchase.js` | W47 | PASS |
| W48 retention signal grounded | W | `retention_churn.js` | W48 | PASS |
| W49 churn signal grounded | W | `retention_churn.js` | W49 | PASS |
| W50 no churn probability invention | W | `retention_churn.js` | W50 | PASS |
| W51 conflicts preserved | X | `conflicts.js` | W51 | PASS |
| W52 polarized journey supported | X | `conflicts.js` | W52 | PASS |
| W53 temporal status preserved | Y | `journey_observation.js`, `temporal.js` | W53 | PASS |
| W54 historical/current not silently merged | Y | `temporal.js`, `report.js` | W54 | PASS |
| W55 completion deterministic | Z | `completion.js` | W55 | PASS |
| W56 low journey evidence reason | Z | `completion.js` | W56 | PASS |
| W57 missing post-purchase reason | Z | `completion.js` | W57 | PASS |
| W58 low JTBD coverage reason | Z | `completion.js` | W58 | PASS |
| W59 report evidence graph valid | AA | `report.js` | W59 | PASS |
| W60 no production routing / autonomous action | AA | `report.js`, `engine.js` | W60 | PASS |
| C1 ASTRA-11B compatibility | AC | provenance / schema reuse | C1 | PASS |
| C2 ASTRA-11C compatibility | AC | ingestion envelopes via ASTRA-11D | C2 | PASS |
| C3 ASTRA-11D compatibility | AC | `coverage.js` | C3 | PASS |
| C4 ASTRA-11E compatibility | AC | shared schema-version conventions | C4 | PASS |
| C5 ASTRA-11F compatibility | AC | `engine.js` consumes VoC result unchanged | C5 | PASS |
| C6 ASTRA-11G compatibility | AC | `engine.js` consumes customer model unchanged | C6 | PASS |
| C7 no network | AB | all `journey/*` (source scan) | C7 | PASS |
| C8 no production DB | AB | all `journey/*` (source scan) | C8 | PASS |
| C9 stable hashes | AA | `report.js`, `engine.js` | C9 | PASS |
| C10 ASTRA-10 freeze unchanged | AB | `benchmarks/astra10ah/freeze.json` | C10 | PASS |
| C11 benchmark isolation | AD | `benchmarks/astra11h/` | C11 | PASS |
