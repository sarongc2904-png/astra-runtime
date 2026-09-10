# ASTRA_11E_REQUIREMENT_TEST_MATRIX — W1..W50

Primary test file: `astra/tests/astra11e.test.js` (test id = `W<n>`). Run:
`node astra/tests/astra11e.test.js` → `ASTRA11E_TEST_RESULT pass=50 fail=0` plus a
`W-matrix completeness` assertion that all of W1..W50 have explicit test evidence.
Supporting coverage also in `astra/benchmarks/astra11e/run_competitor_benchmark.js` (30 checks).

| W | requirement | module | test | status |
|---|---|---|---|---|
| W1 | valid competitor profile | `competitor/competitor_profile.js` | `W1` | PASS |
| W2 | unresolved identity preserved | `competitor/competitor_profile.js` (`parseCompetitorRef`) | `W2` | PASS |
| W3 | ambiguous identity not auto-merged | `competitor/competitor_profile.js` (`identityHints.ambiguous`) | `W3` | PASS |
| W4 | observed attribute requires evidence | `competitor/attribute_model.js` (`validateAttribute`) | `W4` | PASS |
| W5 | inferred attribute not stamped observed | `competitor/attribute_model.js` (`kind: 'ANALYTICAL'`) | `W5` | PASS |
| W6 | temporal snapshot preserved | `competitor/temporal_state.js` (`buildSnapshots`) | `W6` | PASS |
| W7 | stale pricing not treated as current | `competitor/temporal_state.js` (`recency`, `currentState`) | `W7` | PASS |
| W8 | positioning synthesis distinct from observed fact | `competitor/positioning.js` (`positioning_statement.observed=false`) | `W8` | PASS |
| W9 | multiple offers preserved | `competitor/offer_profile.js` (one `Offer` per `source_ref`) | `W9` | PASS |
| W10 | offer frequencies deterministic | `competitor/offer_profile.js` (`computeOfferFieldFrequencies`) | `W10` | PASS |
| W11 | exact message text traceable | `competitor/message_profile.js` (`raw.verbatim_hash`) + `normalization/verbatim.js` | `W11` | PASS |
| W12 | analytical message classification distinct from raw text | `competitor/message_profile.js` (`raw` vs `analysis`) | `W12` | PASS |
| W13 | published proof distinguished from independent proof | `competitor/proof_profile.js` (`VERACITY`) | `W13` | PASS |
| W14 | proof truth not assumed | `competitor/proof_profile.js` (`validateProofItem` rejects `truth`) | `W14` | PASS |
| W15 | observable funnel step preserved | `competitor/funnel_profile.js` (`steps[]`) | `W15` | PASS |
| W16 | missing funnel observation remains UNKNOWN | `competitor/funnel_profile.js` (`touchpoint_status` OBSERVED\|UNKNOWN) | `W16` | PASS |
| W17 | creative angle traceable | `competitor/creative_profile.js` (`raw` traceable) | `W17` | PASS |
| W18 | strength is hypothesis | `competitor/hypotheses.js` (`is_fact:false`, `status:'HYPOTHESIS'`) | `W18` | PASS |
| W19 | weakness is hypothesis | `competitor/hypotheses.js` | `W19` | PASS |
| W20 | absence ≠ lack without sufficient coverage | `competitor/hypotheses.js` (`coverage_supports_absence`) | `W20` | PASS |
| W21 | matrix distinguishes NOT_OBSERVED_IN_SAMPLE vs UNKNOWN | `competitor/competitive_matrix.js` (`CELL_STATUS`, legend) | `W21` | PASS |
| W22 | saturation count deterministic | `competitor/saturation.js` (`buildMarketSaturation`) | `W22` | PASS |
| W23 | duplicate observations do not inflate frequency | `competitor/saturation.js` + ASTRA-11C dedup | `W23` | PASS |
| W24 | duplicate competitors do not inflate sample | `competitor/competitor_profile.js` (distinct `subject_ref`) + ASTRA-11C `ALREADY_INGESTED` | `W24` | PASS |
| W25 | message taxonomy controlled | `competitor/message_profile.js` (`MESSAGE_PATTERNS`, `validateMessageItem`) | `W25` | PASS |
| W26 | differentiation gap is hypothesis | `competitor/differentiation_gap.js` (`is_fact:false`) | `W26` | PASS |
| W27 | gap cannot be labeled profitable automatically | `competitor/differentiation_gap.js` (`profitability:'UNVALIDATED'`) | `W27` | PASS |
| W28 | positioning axes explicit | `competitor/positioning_map.js` (`NO_AXES_DEFINED`) | `W28` | PASS |
| W29 | unknown placement preserved | `competitor/positioning_map.js` (`position:'UNKNOWN'`) | `W29` | PASS |
| W30 | threat score deterministic | `competitor/threat_assessment.js` (`assessThreat`) | `W30` | PASS |
| W31 | threat weights configurable | `competitor/threat_assessment.js` (`weights` param, `weights_version:'custom'`) | `W31` | PASS |
| W32 | competitor size not automatically threat | `competitor/threat_assessment.js` (no size input; `< 3` signals → UNKNOWN) | `W32` | PASS |
| W33 | opportunity remains non-autonomous | `competitor/opportunity.js` (`autonomous:false`, `requires_human_validation:true`) | `W33` | PASS |
| W34 | expected lift not invented | `competitor/opportunity.js` (`expected_lift:'NOT_ESTIMATED'`) | `W34` | PASS |
| W35 | completion deterministic | `competitor/coverage.js` (`assessCompletion`) | `W35` | PASS |
| W36 | stale data produces completion reason | `competitor/coverage.js` (`STALE_DATA`) | `W36` | PASS |
| W37 | identity ambiguity produces completion reason | `competitor/coverage.js` (`IDENTITY_AMBIGUITY`) | `W37` | PASS |
| W38 | report evidence graph valid | `competitor/report.js` (`evidence_graph_valid`) | `W38` | PASS |
| W39 | missing sections remain UNKNOWN | `competitor/report.js` (`sec()`, 22 sections) | `W39` | PASS |
| W40 | identical input yields stable output | `competitor/report.js` (sorted id sets, content hash) | `W40` | PASS |
| W41 | provider-neutral compatibility | ASTRA-11C provider-neutrality boundary (reused); no vendor id in any 11E output | `W41` | PASS |
| W42 | ASTRA-11B compatibility | reuse of `validation/confidence.js` / `validation/canonical.js` (ucdm-1.0.0) | `W42` | PASS |
| W43 | ASTRA-11C compatibility | observations from ASTRA-11D→11C ingestion (ucdm-ingest-1.0.0) | `W43` | PASS |
| W44 | ASTRA-11D compatibility | input is an ASTRA-11D research result (ucdm-research-1.0.0) | `W44` | PASS |
| W45 | no network dependency | static source scan — no `http`/`https`/`net`/`dns`/`tls`/`fetch` | `W45` | PASS |
| W46 | no DB dependency | static source scan — no `supabase`/`pg`/`mysql`/`mongodb` | `W46` | PASS |
| W47 | no production routing | `report.caveats` + `provenance_note` | `W47` | PASS |
| W48 | no autonomous action | opportunities `autonomous:false`; `provenance_note` | `W48` | PASS |
| W49 | ASTRA-10 frozen artifacts unchanged | `benchmarks/astra10ah/freeze.json` `harness_hash` unchanged | `W49` | PASS |
| W50 | benchmark isolated from production | `benchmarks/astra11e/` (not `astra10ah`) | `W50` | PASS |

## Benchmark coverage (`run_competitor_benchmark.js`, 30 checks)

**6 verticals** (dental, laser aesthetics, restaurant, local professional service, B2B
service, digital education). **12+ adversarial cases:** single competitor only, two similar
names, old pricing, conflicting price, conflicting offer, missing proof, duplicate
competitor pages, duplicate reviews, competitor multiple offers, competitor rebrand,
high-volume duplicated ads, no funnel visibility, proof mix. **12 dimensions:** identity
discipline, evidence discipline, temporal discipline, offer accuracy, pricing accuracy,
message traceability, proof discipline, coverage awareness, absence-vs-unknown discipline,
saturation accuracy, gap-vs-fact discipline, opportunity grounding.
