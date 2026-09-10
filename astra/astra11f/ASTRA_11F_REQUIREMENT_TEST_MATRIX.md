# ASTRA_11F_REQUIREMENT_TEST_MATRIX

Requirement → module → test → status. Harness: `node astra/tests/astra11f.test.js`
→ `ASTRA11F_TEST_RESULT pass=60 fail=0`. Every W1..W50 has explicit test evidence
(asserted by "W-matrix completeness"). Benchmark: `node astra/benchmarks/astra11f/run_voc_benchmark.js`
→ `ASTRA11F_BENCHMARK_RESULT pass=34 fail=0`.

| Req | Spec § | Module(s) | Test | Status |
|---|---|---|---|---|
| W1 customer-authored evidence accepted | A/B | `speaker_validation.js`, `engine.js` | W1 | PASS |
| W2 business marketing copy rejected as VOC | B | `speaker_validation.js` | W2 | PASS |
| W3 competitor copy rejected as VOC | B | `speaker_validation.js` | W3 | PASS |
| W4 unknown speaker preserved | B | `speaker_validation.js` | W4 | PASS |
| W5 verbatim immutable | C | `utterance.js` | W5 | PASS |
| W6 normalized text additive | C/L | `utterance.js` | W6 | PASS |
| W7 controlled aspect taxonomy | C | `taxonomy.js`, `observation.js` | W7 | PASS |
| W8 UNKNOWN aspect allowed | C | `taxonomy.js`, `span_grounding.js` | W8 | PASS |
| W9 observation evidence required | D | `observation.js` | W9 | PASS |
| W10 exact span grounded | E/F | `span_grounding.js`, `observation.js` | W10 | PASS |
| W11 multi-aspect statement preserved | F | `span_grounding.js` | W11 | PASS |
| W12 separate evidence spans preserved | F | `span_grounding.js`, `observation.js` | W12 | PASS |
| W13 negation preserved | G | `span_grounding.js` | W13 | PASS |
| W14 "not expensive" not mapped to price objection | G | `taxonomy.js` (flip rules), `span_grounding.js` | W14 | PASS |
| W15 prior fear vs actual experience distinguished | G | `span_grounding.js` (`PRIOR_RE`), `observation.js` | W15 | PASS |
| W16 customer question preserved verbatim | H | `questions.js` | W16 | PASS |
| W17 question taxonomy controlled | H | `taxonomy.js`, `questions.js` | W17 | PASS |
| W18 alternative observed with evidence | I | `alternatives_triggers_criteria.js` | W18 | PASS |
| W19 unresolved competitor mention stays unresolved | I | `alternatives_triggers_criteria.js` | W19 | PASS |
| W20 purchase trigger requires evidence | J | `alternatives_triggers_criteria.js` | W20 | PASS |
| W21 decision criterion requires evidence | K | `alternatives_triggers_criteria.js` | W21 | PASS |
| W22 no demographic inference | P | `coverage.js` (`compareSegments`) | W22 | PASS |
| W23 controlled normalization versioned | L | `taxonomy.js`, `observation.js` | W23 | PASS |
| W24 linguistic variants preserved | L | `clustering.js`, `buying_language.js` | W24 | PASS |
| W25 deterministic cluster | M | `clustering.js` | W25 | PASS |
| W26 cluster evidence refs valid | M | `clustering.js` | W26 | PASS |
| W27 duplicate evidence does not inflate frequency | N | `clustering.js` | W27 | PASS |
| W28 unique speaker count separated from observation count | N | `clustering.js` | W28 | PASS |
| W29 repeated speaker does not imply independent prevalence | N | `clustering.js` | W29 | PASS |
| W30 denominator discipline enforced | N | `clustering.js`, `pattern_insight.js` | W30 | PASS |
| W31 coverage deterministic | O | `coverage.js` | W31 | PASS |
| W32 source diversity represented | O | `coverage.js` | W32 | PASS |
| W33 segment UNKNOWN allowed | P | `observation.js`, `coverage.js` | W33 | PASS |
| W34 segment comparison only on explicit refs | P | `coverage.js` | W34 | PASS |
| W35 journey stage not silently inferred | Q | `coverage.js`, `observation.js` | W35 | PASS |
| W36 journey UNKNOWN allowed | Q | `coverage.js` | W36 | PASS |
| W37 contradiction preserved | R | `pattern_insight.js` | W37 | PASS |
| W38 polarization represented | R | `pattern_insight.js` | W38 | PASS |
| W39 representative quote is actual verbatim | S | `clustering.js` | W39 | PASS |
| W40 paraphrase cannot masquerade as quote | S | `clustering.js` | W40 | PASS |
| W41 pattern evidence valid | T | `pattern_insight.js` | W41 | PASS |
| W42 customer insight marked analytical | U | `pattern_insight.js` | W42 | PASS |
| W43 insight cannot become fact | U | `pattern_insight.js` | W43 | PASS |
| W44 buying language contains exact customer phrases | V | `buying_language.js` | W44 | PASS |
| W45 no generated marketing copy in buying library | V | `buying_language.js` | W45 | PASS |
| W46 completion deterministic | W | `coverage.js` (`assessCompletion`) | W46 | PASS |
| W47 low speaker coverage produces reason | W | `coverage.js` | W47 | PASS |
| W48 duplicate-heavy evidence produces reason | W | `coverage.js` | W48 | PASS |
| W49 report evidence graph valid | X | `report.js` | W49 | PASS |
| W50 no production routing / autonomous action | Y | `report.js`, `engine.js` | W50 | PASS |
| C1 ASTRA-11B compatibility | AA | `observation.js` / UCDM provenance reuse | C1 | PASS |
| C2 ASTRA-11C compatibility | AA | ingestion/redaction reuse | C2 | PASS |
| C3 ASTRA-11D compatibility | AA | `engine.js` (consumes research result) | C3 | PASS |
| C4 ASTRA-11E compatibility | AA | shared taxonomy/provenance conventions | C4 | PASS |
| C5 privacy: redacted_display_text separate from immutable verbatim | AB | `utterance.js` | C5 | PASS |
| C6 no network dependency | Y | all `voc/*` (source scan) | C6 | PASS |
| C7 no production DB dependency | Y | all `voc/*` (source scan) | C7 | PASS |
| C8 ASTRA-10 freeze unchanged | Y | `benchmarks/astra10ah/freeze.json` | C8 | PASS |
| C9 stable hashes | X | `report.js`, `engine.js` | C9 | PASS |
| C10 benchmark isolation | AC | `benchmarks/astra11f/` | C10 | PASS |
