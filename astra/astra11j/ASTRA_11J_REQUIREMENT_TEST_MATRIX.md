# ASTRA_11J_REQUIREMENT_TEST_MATRIX

Requirement -> module -> test -> status. Harness: `node astra/tests/astra11j.test.js`
-> `ASTRA11J_TEST_RESULT pass=88 fail=0` (W1..W80 + C1..C8 + W-matrix completeness).
Benchmark: `node astra/benchmarks/astra11j/run_funnel_revenue_benchmark.js`
-> `ASTRA11J_BENCHMARK_RESULT pass=52 fail=0` (8 funnel fixtures + 26 adversarial + 17 dimensions).

| Req | § | Module(s) | Test | Status |
|---|---|---|---|---|
| W1 custom funnel supported | A | `funnel_model.js` | W1 | PASS |
| W2 no mandatory universal funnel | A | `funnel_model.js` | W2 | PASS |
| W3 stage taxonomy controlled; unknown stage keeps its key | A | `funnel_model.js` | W3 | PASS |
| W4 valid conversion calculation | C | `transition_metrics.js` | W4 | PASS |
| W5 invalid denominator (zero) -> INVALID_DENOMINATOR, no rate | C | `transition_metrics.js` | W5 | PASS |
| W6 missing count -> MISSING_COUNT, no rate | C | `transition_metrics.js` | W6 | PASS |
| W7 time-window mismatch -> SCOPE_MISMATCH(period) | C/F | `scope_validation.js,time_window.js` | W7 | PASS |
| W8 cohort mismatch -> SCOPE_MISMATCH(cohort) | C/G | `scope_validation.js,cohort.js` | W8 | PASS |
| W9 segment mismatch -> SCOPE_MISMATCH(segment) | C | `scope_validation.js` | W9 | PASS |
| W10 channel mismatch -> SCOPE_MISMATCH(channel) | C/H | `scope_validation.js,channel.js` | W10 | PASS |
| W11 drop-off calculation | D | `transition_metrics.js` | W11 | PASS |
| W12 drop-off is not causality | D | `transition_metrics.js` | W12 | PASS |
| W13 volume vs conversion distinction (summary separates them) | E | `dropoff.js` | W13 | PASS |
| W14 low outcome can be a volume problem (small volume, strong rates) | E | `dropoff.js` | W14 | PASS |
| W15 mixed currency -> SCOPE_MISMATCH(currency) | C | `scope_validation.js` | W15 | PASS |
| W16 duplicate observations deduped + flagged | B | `funnel_observation.js` | W16 | PASS |
| W17 attribution not inferred (no multi-touch fabrication) | I | `attribution.js` | W17 | PASS |
| W18 source-reported attribution preserved | I | `attribution.js` | W18 | PASS |
| W19 unrecognised attribution -> UNKNOWN | I | `attribution.js` | W19 | PASS |
| W20 CPL / CPA / CAC are separated | K | `unit_economics.js` | W20 | PASS |
| W21 incomplete CAC coverage -> COMPUTED_PARTIAL / lower bound | K | `unit_economics.js` | W21 | PASS |
| W22 CAC does not silently default to ad spend / customers when sales cost declared | K | `unit_economics.js` | W22 | PASS |
| W23 cost declares status; none invented | J | `cost.js` | W23 | PASS |
| W24 missing cost data -> MISSING_COST_DATA | J/AF | `cost.js,completion.js` | W24 | PASS |
| W25 CPA respects its configured cost types | K | `unit_economics.js` | W25 | PASS |
| W26 CPL uses media spend / valid leads only | K | `unit_economics.js` | W26 | PASS |
| W27 zero customers -> CAC UNKNOWN | K | `unit_economics.js` | W27 | PASS |
| W28 revenue basis preserved (each revenue observation keeps its type) | L | `revenue.js` | W28 | PASS |
| W29 gross/net revenue distinction; net not silently derived | L | `revenue.js` | W29 | PASS |
| W30 net revenue derived ONLY with components | L | `revenue.js` | W30 | PASS |
| W31 net revenue UNKNOWN when a declared component is missing | L | `revenue.js` | W31 | PASS |
| W32 AOV uses order count | M | `revenue.js` | W32 | PASS |
| W33 ARPU uses user count; not substituted for AOV | M | `revenue.js` | W33 | PASS |
| W34 ARPA uses account count | M | `revenue.js` | W34 | PASS |
| W35 AOV/ARPU UNKNOWN without denominator | M | `revenue.js` | W35 | PASS |
| W36 gross vs contribution margin distinguished | N | `margin.js` | W36 | PASS |
| W37 no invented costs: contribution margin UNKNOWN without a supplied variable cost | N | `margin.js` | W37 | PASS |
| W38 gross margin UNKNOWN without a supplied COGS | N | `margin.js` | W38 | PASS |
| W39 break-even only with valid inputs | O | `break_even.js` | W39 | PASS |
| W40 break-even UNKNOWN without contribution-margin ratio | O | `break_even.js` | W40 | PASS |
| W41 break-even ROAS = 1 / contribution-margin ratio | O | `break_even.js` | W41 | PASS |
| W42 LTV methodology explicit (observed vs modelled) | P | `ltv.js` | W42 | PASS |
| W43 modelled LTV labelled modelled, not observed | P | `ltv.js` | W43 | PASS |
| W44 no silent ARPU/churn LTV formula (needs authorization) | P | `ltv.js` | W44 | PASS |
| W45 observed cohort LTV is a floor over its window | P | `ltv.js` | W45 | PASS |
| W46 payback basis required (contribution-margin cadence) | Q | `payback.js` | W46 | PASS |
| W47 payback UNKNOWN when CAC is a lower bound | Q | `payback.js` | W47 | PASS |
| W48 payback UNKNOWN without a contribution-margin cadence | Q | `payback.js` | W48 | PASS |
| W49 ROAS and MER separated | R | `roas_mer.js` | W49 | PASS |
| W50 ROAS carries its attribution basis; UNKNOWN without one | R | `roas_mer.js` | W50 | PASS |
| W51 booking funnel: qualification rate | T | `booking_funnel.js` | W51 | PASS |
| W52 booking funnel: booking rate | T | `booking_funnel.js` | W52 | PASS |
| W53 booking funnel: show rate | T | `booking_funnel.js` | W53 | PASS |
| W54 booking funnel: close rate | T | `booking_funnel.js` | W54 | PASS |
| W55 booking funnel: conversation-to-sale rate | T | `booking_funnel.js` | W55 | PASS |
| W56 ecommerce funnel supported | U | `commerce_funnel.js` | W56 | PASS |
| W57 webinar funnel supported | U | `commerce_funnel.js` | W57 | PASS |
| W58 sales pipeline: win rate + custom states + cycle + reasons | S | `sales_pipeline.js` | W58 | PASS |
| W59 retention cohort basis preserved | V/G | `retention.js,cohort.js` | W59 | PASS |
| W60 expansion revenue represented with cohort basis | V | `retention.js` | W60 | PASS |
| W61 no churn probability invented | V | `retention.js` | W61 | PASS |
| W62 strong acquisition / poor retention surfaced | V/AC | `retention.js,diagnosis.js` | W62 | PASS |
| W63 bottleneck analytical only (is_fact:false, causal_claim:false) | W | `bottleneck.js` | W63 | PASS |
| W64 no causality invention in bottleneck / diagnosis | W/AC | `bottleneck.js,diagnosis.js` | W64 | PASS |
| W65 bottleneck vs INTERNAL baseline only; no external benchmark | W/X | `bottleneck.js,internal_baseline.js` | W65 | PASS |
| W66 internal baseline validation before declaring change | X | `internal_baseline.js` | W66 | PASS |
| W67 absolute vs relative vs percentage-point delta correct | Y | `delta.js` | W67 | PASS |
| W68 no statistical-significance claim | Z | `delta.js` | W68 | PASS |
| W69 delta without causality (baseline comparison) | Y | `internal_baseline.js` | W69 | PASS |
| W70 leakage methodology explicit | AA | `revenue_leakage.js` | W70 | PASS |
| W71 no fabricated lost-revenue claim (UNKNOWN without value assumption) | AB | `revenue_leakage.js` | W71 | PASS |
| W72 opportunity value carries methodology + assumptions + status | AB | `revenue_leakage.js` | W72 | PASS |
| W73 mixed-currency opportunity value not summed | AB | `revenue_leakage.js` | W73 | PASS |
| W74 refund leakage is OBSERVED when supplied | AA | `revenue_leakage.js` | W74 | PASS |
| W75 diagnosis types (volume/conversion/economics/retention/data-quality/mixed/insufficient) | AC | `diagnosis.js` | W75 | PASS |
| W76 diagnosis grounded + non-causal | AC | `diagnosis.js` | W76 | PASS |
| W77 priority non-autonomous | AD | `priority.js` | W77 | PASS |
| W78 deterministic completion | AF | `completion.js` | W78 | PASS |
| W79 valid evidence graph + 35 sections + stable hashes | AE | `report.js` | W79 | PASS |
| W80 no production routing / autonomous action | AE | `report.js,engine.js` | W80 | PASS |
| C1 ASTRA-11B compatibility | AH | provenance / schema reuse | C1 | PASS |
| C2 ASTRA-11C compatibility (canonicalization reuse) | AH | canonicalization reuse | C2 | PASS |
| C3 ASTRA-11F compatibility (schema version constant) | AH | schema-version constant | C3 | PASS |
| C4 ASTRA-11H compatibility (schema version constant) | AH | schema-version constant | C4 | PASS |
| C5 ASTRA-11I compatibility (schema version constant) | AH | schema-version constant | C5 | PASS |
| C6 no network dependency | AH | all funnel_revenue/* (source scan) | C6 | PASS |
| C7 no production DB dependency | AH | all funnel_revenue/* (source scan) | C7 | PASS |
| C8 ASTRA-10 freeze unchanged + benchmark isolation | AH | benchmarks/astra10ah/freeze.json + benchmarks/astra11j/ | C8 | PASS |
