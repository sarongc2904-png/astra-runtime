# ASTRA_11D_REQUIREMENT_TEST_MATRIX — W1..W40

Every original ASTRA-11D behavior W1–W40 mapped to its implementation module and its
explicit test. Primary test: `astra/tests/astra11d_completion.test.js` (test id = `W<n>`).
Supporting coverage also in `astra/tests/astra11d.test.js` and
`astra/benchmarks/astra11d/run_research_benchmark.js`.

Run: `node astra/tests/astra11d_completion.test.js` → `ASTRA11D_COMPLETION_TEST_RESULT pass=40 fail=0`
(+ a `W-matrix completeness` assertion that all of W1..W40 have explicit test evidence).

| W | behavior | implementation module | test | status |
|---|---|---|---|---|
| W1 | valid research request | `research/request.js` | `W1` | PASS |
| W2 | invalid scope rejected | `research/plan.js` (`makeResearchPlan`) | `W2` | PASS |
| W3 | research plan deterministic | `research/plan.js` + `benchmarks/astra11d/llm_planner.js` `mockPlanner` | `W3` | PASS |
| W4 | normalized observation accepted | `ingestion/pipeline.js` (11C, reused) via `research/engine.js` | `W4` | PASS |
| W5 | provider payload rejected | `ingestion/provider_neutrality.js` (11C) + `research/research_source_adapter.js` | `W5` | PASS |
| W6 | MarketFact requires evidence | `research/market_fact.js` (`validateMarketFact`) | `W6` | PASS |
| W7 | INFERRED cannot become MarketFact | `research/market_fact.js` (`extractFacts` → `excluded_inferred`) | `W7` | PASS |
| W8 | claim supporting refs valid | `research/market_claim.js` + `research/aggregate.js` | `W8` | PASS |
| W9 | dangling claim evidence fails | `research/report.js` (`evidence_graph_valid`) | `W9` | PASS |
| W10 | contradictions preserved | `research/conflict.js` (`status:'OPEN'`, `resolution:null`) | `W10` | PASS |
| W11 | sample coverage deterministic | `research/coverage.js` (`coverage_id` content hash) | `W11` | PASS |
| W12 | scoped language enforced | `research/coverage.js` (`assessGlobalExtrapolation`) + `research/market_claim.js` scope gate | `W12` | PASS |
| W13 | observed price accepted | `research/pricing.js` (`extractPricingObservations`) | `W13` | PASS |
| W14 | inferred price rejected | `research/pricing.js` (`INFERRED` → `excluded_inferred`) | `W14` | PASS |
| W15 | pricing statistics deterministic | `research/pricing.js` (`computePricingStats`) | `W15` | PASS |
| W16 | currency remains explicit | `research/pricing.js` (per-currency only, `mixed_currency`, no FX) | `W16` | PASS |
| W17 | offer frequency deterministic | `research/landscapes.js` (`computeComponentFrequencies`) | `W17` | PASS |
| W18 | exact advertising language traceable | `research/landscapes.js` (`extractMessageObservations` — `verbatim_hash`) + `normalization/verbatim.js` (11C) | `W18` | PASS |
| W19 | customer signal traceable | `research/landscapes.js` (`extractCustomerSignals` — `verbatim_hash`, `evidence_refs`) | `W19` | PASS |
| W20 | demand proxy labeled proxy | `research/landscapes.js` (`DEMAND_KIND_CLASS`, `demand_class`) | `W20` | PASS |
| W21 | market size not invented | `research/landscapes.js` (`market_size:'NOT_ESTIMATED'`) | `W21` | PASS |
| W22 | sophistication UNKNOWN allowed | `research/sophistication.js` (`assessSophistication` default UNKNOWN) | `W22` | PASS |
| W23 | sophistication evidence required | `research/sophistication.js` (`makeSophisticationAssessment` throws on empty refs) | `W23` | PASS |
| W24 | gap represented as hypothesis | `research/gap_opportunity.js` (`is_market_fact:false`, no `CONFIRMED`) | `W24` | PASS |
| W25 | opportunity not represented as fact | `research/gap_opportunity.js` (`expected_lift:'NOT_ESTIMATED'`, `autonomous:false`) | `W25` | PASS |
| W26 | low evidence → PARTIAL/INSUFFICIENT | `research/completion.js` (`assessCompletion`) | `W26` | PASS |
| W27 | conflict → appropriate completion reason | `research/completion.js` (`CONFLICTED_EVIDENCE`) | `W27` | PASS |
| W28 | stale evidence detected deterministically | `research/coverage.js` (`time_coverage.stale`) + `research/completion.js` (`STALE_EVIDENCE`) | `W28` | PASS |
| W29 | duplicate observations do not inflate counts | `research/coverage.js` (`distinct_observation_count`) + `evidence/dedup.js` (11C) | `W29` | PASS |
| W30 | exact duplicate sources do not inflate coverage | `research/coverage.js` (distinct `source_id`) + `ingestion/pipeline.js` (11C `ALREADY_INGESTED`) | `W30` | PASS |
| W31 | model-authored number rejected | `normalization/numeric_observation.js` (11C) + `research/pricing.js` (`validatePricingObservation`) | `W31` | PASS |
| W32 | report evidence graph valid | `research/report.js` (`evidence_graph_valid`, `evidence_appendix`) | `W32` | PASS |
| W33 | missing sections remain UNKNOWN | `research/report.js` (`sec()` helper, 18 sections) | `W33` | PASS |
| W34 | identical input produces stable result | `research/report.js` (sorted id sets, content hash) | `W34` | PASS |
| W35 | no network dependency | (static source scan — no `http`/`https`/`net`/`dns`/`tls`/`fetch`) | `W35` | PASS |
| W36 | no production DB dependency | (static source scan — no `supabase`/`pg`/`mysql`/`mongodb`) | `W36` | PASS |
| W37 | ASTRA-11B compatibility | reuse of `validation/confidence.js`, `validation/canonical.js`, `provenance/provenance.js` (ucdm-1.0.0) | `W37` | PASS |
| W38 | ASTRA-11C compatibility | observations from `ingestion/pipeline.js` (ucdm-ingest-1.0.0); no second ingestion system | `W38` | PASS |
| W39 | no ASTRA-10 frozen artifact modified | `benchmarks/astra10ah/freeze.json` hash unchanged; all 11D writes are new paths | `W39` | PASS |
| W40 | benchmark isolated from production | `benchmarks/astra11d/` (not `astra10ah`); `llm_planner.js` `llmPlannerStub` throws | `W40` | PASS |

## Additional coverage (`astra/tests/astra11d.test.js`, 21 tests) — preserved from the pre-remediation gate

Sections A–I of the original authorization: request, plan + `enforceAuthorizedScope`,
evidence-collection boundary + LIVE-provider refusal, MarketFact OBSERVED/COMPUTED-only,
MarketClaim 4 statuses + no-global-from-thin + deterministic statement, conflict detection
+ tolerance, aggregation roll-ups, deterministic confidence, reproducible report, insights
≠ recommendations, no-implicit-clock, schema versions, "no output is an action directive".

## Benchmark coverage (`astra/benchmarks/astra11d/run_research_benchmark.js`, 23 checks)

6 verticals (dental clinic, laser aesthetics, restaurant, local professional service, B2B
service, digital product / education) + 8 adversarial cases (very little evidence,
conflicting pricing, stale reviews, single competitor, no customer evidence, misleading
provider metadata, duplicate evidence, high-volume duplicated reviews) + 9 benchmark
dimensions (evidence discipline, claim support, scope discipline, conflict handling,
unknown handling, numeric integrity, coverage awareness, gap-vs-fact distinction,
recommendation grounding).
