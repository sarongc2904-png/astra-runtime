# ASTRA_11E_DESIGN — Competitor Intelligence Engine

**Authorization:** `HUMAN_AUTHORIZATION_ASTRA_11E_COMPETITOR_INTELLIGENCE_ENGINE_2026-09-09`
**Mode:** design + deterministic implementation + isolated offline benchmarking.
**No ASTRA-11E output may feed production routing or autonomous action. No LLM is used.**

## 1. Purpose

Transform **evidence-backed competitor observations from ASTRA-11D** into structured
competitor intelligence. The engine input is an ASTRA-11D research result (`facts`,
`message_observations`, `offer_items`, `pricing_observations`, `observations`,
`ingestion`). It invents **no** competitor, price, offer, review, rating, claim, CTA,
proof, funnel, ad, or market share (spec §U). Where evidence is absent the output is
`UNKNOWN` / `NOT_OBSERVED_IN_SAMPLE` / `INSUFFICIENT`.

## 2. Pipeline (as built — `competitor/engine.js`)

```
ASTRA-11D research result
   ↓  competitor_profile.js   IDENTITY / SCOPE — RESOLVED/UNRESOLVED/AMBIGUOUS, no fuzzy/LLM merge
   ↓  attribute_model.js      ATTRIBUTE EXTRACTION — ~30 attributes, OBSERVED vs ANALYTICAL
   ↓  temporal_state.js       TEMPORAL STATE — CURRENT / HISTORICAL / UNKNOWN_CURRENT snapshots
   ↓  positioning.js          POSITIONING MODEL — observed elements are facts; positioning_statement is analytical
   ↓  offer_profile.js        OFFER MODEL — multiple simultaneous offers preserved, per source/channel
   ↓  message_profile.js      MESSAGE MODEL — raw verbatim (traceable to 11C) + controlled analytical taxonomy
   ↓  proof_profile.js        PROOF MODEL — PUBLISHED_PROOF / INDEPENDENT_EVIDENCE / UNKNOWN_VERACITY; truth never asserted
   ↓  funnel_profile.js       FUNNEL / CTA MODEL — supplied observations only, no crawling; missing = UNKNOWN
   ↓  creative_profile.js     CREATIVE ANGLE MODEL — observed patterns only, no strategy generation
   ↓  hypotheses.js           STRENGTH / WEAKNESS HYPOTHESES — never facts; absence != lack without coverage
   ↓  competitive_matrix.js   COMPETITIVE MATRIX — OBSERVED / NOT_OBSERVED_IN_SAMPLE / UNKNOWN / CONFLICTED
   ↓  saturation.js           SATURATION / WHITE-SPACE — deterministic pattern-frequency, no extrapolation beyond sample
   ↓  positioning_map.js      POSITIONING MAP (explicit axes only) + deterministic CLUSTERS
   ↓  threat_assessment.js    COMPETITIVE THREAT — deterministic configurable weights; size != threat
   ↓  differentiation_gap.js  DIFFERENTIATION GAP — hypothesis; white space never "profitable" without validation
   ↓  opportunity.js          COMPETITOR OPPORTUNITY — recommendation-level, non-autonomous, no fabricated lift
   ↓  coverage.js             COVERAGE + COMPLETION — deterministic; an LLM can never mark research complete
   ↓  report.js               COMPETITOR INTELLIGENCE REPORT — 22 sections, evidence appendix, evidence_graph_valid
```

`referenceTime` is caller-supplied throughout — the engine never reads the system clock.

## 3. Files (spec §V)

`astra/src/commercial/competitor/` (20 modules, ~1,600 LoC, `crypto` only, **no LLM**):
`competitor_profile.js` · `attribute_model.js` · `temporal_state.js` · `positioning.js` ·
`offer_profile.js` · `message_profile.js` · `proof_profile.js` · `funnel_profile.js` ·
`creative_profile.js` · `hypotheses.js` · `competitive_matrix.js` · `saturation.js` ·
`positioning_map.js` · `threat_assessment.js` · `differentiation_gap.js` · `opportunity.js` ·
`coverage.js` · `report.js` · `engine.js` · `index.js`.

`astra/benchmarks/astra11e/` (isolated — **not** `astra10ah`): `fixtures.js` (6 verticals +
13 adversarial cases) · `run_competitor_benchmark.js` (**30 checks**).

`astra/tests/astra11e.test.js` — **W1..W50, 50 pass / 0 fail** (+ W-matrix completeness).

## 4. Reuse (no parallel systems — spec)

| reused | for |
|---|---|
| ASTRA-11D `engine.runMarketResearch` output | the sole source of competitor observations — 11E invents no ingestion or market-fact system |
| ASTRA-11D `research/conflict.js` `detectConflicts` | competitor price conflict detection |
| ASTRA-11B `validation/confidence.js` | every `ConfidenceAssessment` |
| ASTRA-11B `validation/canonical.js` | all hashing / identity / freezing |
| ASTRA-11C verbatim / `SOURCE_CATEGORIES` | message-text traceability, source classification |

### Additive change to an ASTRA-11D deliverable

`astra/src/commercial/research/research_source_adapter.js` (an ASTRA-11D module authored in
this session) gained **additive** support for competitor-page `rating` / `review_count`
fields and for `research_review` payloads that name a `competitor_ref` (→ a `Competitor`
subject, enabling `INDEPENDENT_EVIDENCE` proof). No existing behavior changed — the full
ASTRA-11D test suite (21 + 40) and benchmark (23) still pass unchanged.

## 5. Model-knowledge separation (spec §U)

The engine reads only ASTRA-11D evidence objects. It has **no branch** that emits a
competitor/price/offer/rating/claim/CTA/proof/funnel/ad from anything but an evidence-backed
input. Absence → `UNKNOWN` / `NOT_OBSERVED_IN_SAMPLE` / `INSUFFICIENT`. Model pretrained
knowledge may inform *future* interpretation but can never become OBSERVED competitor
evidence — and no LLM runs in this gate at all.

## 6. Not in this gate

No live web / crawling; no CRM / Meta / WhatsApp / GA4 / Stripe; no production Supabase
write; no deploy; no autonomous action; no production routing; no Creative Strategy
generation; no Voice-of-Customer / Persona / Journey. No change to
`READY_FOR_PRODUCTION_ROUTING` (FALSE), the ASTRA-10AX `QUALITY_GATE` (FAIL),
`BENCHMARK_WINNER` (NOT_DECLARED), or any frozen ASTRA-10 artifact
(`astra/benchmarks/astra10ah/` `harness_hash` verified in W49).
