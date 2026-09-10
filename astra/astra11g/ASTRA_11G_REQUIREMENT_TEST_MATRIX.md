# ASTRA_11G_REQUIREMENT_TEST_MATRIX

Requirement → module → test → status. Harness: `node astra/tests/astra11g.test.js`
→ `ASTRA11G_TEST_RESULT pass=70 fail=0` (W1..W60 + C1..C10 + W-matrix completeness).
Benchmark: `node astra/benchmarks/astra11g/run_customer_model_benchmark.js`
→ `ASTRA11G_BENCHMARK_RESULT pass=39 fail=0` (6 verticals + 18 adversarial + 15 dimensions).

| Req | § | Module(s) | Test | Status |
|---|---|---|---|---|
| W1 observed customer attribute accepted | A | `attribute_evidence.js` | W1 | PASS |
| W2 analytical attribute marked analytical | A | `attribute_evidence.js` | W2 | PASS |
| W3 unsupported demographic remains UNKNOWN | B | `attribute_evidence.js` | W3 | PASS |
| W4 age not invented | B | `attribute_evidence.js` | W4 | PASS |
| W5 gender not invented | B | `attribute_evidence.js` | W5 | PASS |
| W6 income not invented | B, M | `attribute_evidence.js`, `budget_signal.js` | W6 | PASS |
| W7 hobbies not invented | B | `attribute_evidence.js` | W7 | PASS |
| W8 controlled segment dimensions | C | `segment_taxonomy.js`, `segment_candidate.js` | W8 | PASS |
| W9 unknown dimension allowed | C | `segment_taxonomy.js` | W9 | PASS |
| W10 segment requires evidence | D | `segment_candidate.js` | W10 | PASS |
| W11 segment overlap allowed | E | `segment_membership.js` | W11 | PASS |
| W12 customer not forced into one segment | E | `segment_membership.js` | W12 | PASS |
| W13 observed sample size deterministic | F | `segment_candidate.js`, `segment_metrics.js` | W13 | PASS |
| W14 market segment size not fabricated | F | `segment_metrics.js` | W14 | PASS |
| W15 BuyerPersona allows UNKNOWN fields | G | `buyer_persona.js` | W15 | PASS |
| W16 primary problem evidence-backed | G | `buyer_persona.js` | W16 | PASS |
| W17 desired outcome evidence-backed | G | `buyer_persona.js` | W17 | PASS |
| W18 emotional pain evidence-backed | G | `buyer_persona.js` | W18 | PASS |
| W19 fear evidence-backed | G | `buyer_persona.js` | W19 | PASS |
| W20 objection evidence-backed | G | `buyer_persona.js` | W20 | PASS |
| W21 trigger evidence-backed | G, A | `attribute_evidence.js` | W21 | PASS |
| W22 alternative evidence-backed | G, A | `attribute_evidence.js` | W22 | PASS |
| W23 decision criterion evidence-backed | G, A | `attribute_evidence.js` | W23 | PASS |
| W24 reason_to_buy evidence-backed | G | `buyer_persona.js` | W24 | PASS |
| W25 reason_not_to_buy evidence-backed | G, A | `attribute_evidence.js` | W25 | PASS |
| W26 buying language references exact VOC | J | `buyer_persona.js` | W26 | PASS |
| W27 generated copy cannot become buying language | J | `buyer_persona.js` | W27 | PASS |
| W28 Persona narrative adds no new facts | H | `buyer_persona.js` (`renderNarrative`/`validateNarrative`) | W28 | PASS |
| W29 Persona evidence graph valid | I | `persona_evidence.js` | W29 | PASS |
| W30 awareness UNKNOWN allowed | K | `awareness.js` | W30 | PASS |
| W31 awareness mixed preserved | K | `awareness.js` | W31 | PASS |
| W32 urgency evidence required | L | `urgency.js` | W32 | PASS |
| W33 engagement frequency does not imply urgency | L | `urgency.js` | W33 | PASS |
| W34 personal income not inferred | M | `budget_signal.js` | W34 | PASS |
| W35 budget signal taxonomy controlled | M | `budget_signal.js` | W35 | PASS |
| W36 financing need represented without income inference | M | `budget_signal.js` | W36 | PASS |
| W37 ICP distinct from Persona | N, O | `icp.js`, `buyer_persona.js` | W37 | PASS |
| W38 ICP allows unknown revenue | N | `icp.js` | W38 | PASS |
| W39 ICP allows unknown employee count | N | `icp.js` | W39 | PASS |
| W40 B2C may omit ICP | O | `icp.js`, `buying_roles.js` | W40 | PASS |
| W41 buying committee supports multiple roles | P | `buying_roles.js` | W41 | PASS |
| W42 job title alone does not prove authority | P | `buying_roles.js` | W42 | PASS |
| W43 ICP fit deterministic | Q | `icp_fit.js` | W43 | PASS |
| W44 configurable fit weights | Q | `icp_fit.js` | W44 | PASS |
| W45 insufficient fit coverage → UNKNOWN | Q | `icp_fit.js` | W45 | PASS |
| W46 attractiveness distinct from market size | R | `attractiveness.js` | W46 | PASS |
| W47 attractiveness deterministic | R | `attractiveness.js` | W47 | PASS |
| W48 priority deterministic | S | `priority.js` | W48 | PASS |
| W49 priority does not trigger action | S | `priority.js` | W49 | PASS |
| W50 disqualification evidence-backed | T | `disqualification.js` | W50 | PASS |
| W51 demographic disqualification rejected | T | `disqualification.js` | W51 | PASS |
| W52 Persona conflicts preserved | U | `conflicts.js`, `segment_candidate.js` | W52 | PASS |
| W53 conflict may produce separate segments | U | `conflicts.js` | W53 | PASS |
| W54 Persona merge not based on label similarity | V | `merge_split.js` | W54 | PASS |
| W55 merge conflict → REVIEW_REQUIRED | V | `merge_split.js` | W55 | PASS |
| W56 completion deterministic | W | `completion.js` | W56 | PASS |
| W57 low VOC coverage reason | W | `completion.js`, `coverage.js` | W57 | PASS |
| W58 missing desired outcome reason | W | `completion.js` | W58 | PASS |
| W59 report evidence graph valid | X | `report.js` | W59 | PASS |
| W60 no production routing / autonomous action | X, S | `report.js`, `priority.js`, `engine.js` | W60 | PASS |
| C1 ASTRA-11B compatibility | AA | provenance / schema reuse | C1 | PASS |
| C2 ASTRA-11C compatibility | AA | ingestion envelopes via ASTRA-11D | C2 | PASS |
| C3 ASTRA-11D compatibility | AA | `coverage.js` (market facts) | C3 | PASS |
| C4 ASTRA-11E compatibility | AA | shared schema-version conventions | C4 | PASS |
| C5 ASTRA-11F compatibility | AA | `engine.js` consumes VoC result unchanged | C5 | PASS |
| C6 no network | Z | all `customer_model/*` (source scan) | C6 | PASS |
| C7 no production DB | Z | all `customer_model/*` (source scan) | C7 | PASS |
| C8 ASTRA-10 freeze unchanged | Z | `benchmarks/astra10ah/freeze.json` | C8 | PASS |
| C9 stable hashes | X | `report.js`, `engine.js` | C9 | PASS |
| C10 benchmark isolation | AB | `benchmarks/astra11g/` | C10 | PASS |
