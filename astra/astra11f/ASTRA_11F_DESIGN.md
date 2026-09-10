# ASTRA_11F_DESIGN — Voice of Customer Engine

**Authorization:** `HUMAN_AUTHORIZATION_ASTRA_11F_VOICE_OF_CUSTOMER_ENGINE_2026-09-09`
**Mode:** design + deterministic implementation + isolated offline benchmarking.
**No ASTRA-11F output may feed production routing or autonomous action. No LLM is used.**

## 1. Purpose

Transform customer-authored / customer-attributed evidence (from ASTRA-11D research results)
into **structured, traceable customer language and behavioral signals** — preserving
*exactly what customers said* separately from any interpretation.

## 2. Pipeline (as built — `voc/engine.js`)

```
ASTRA-11D research result (QUOTE / CLAIM observations with verbatim)
   ↓  speaker_validation.js   SPEAKER / CONTEXT VALIDATION — only CUSTOMER/PROSPECT/FORMER_CUSTOMER is canonical
   ↓  utterance.js            VERBATIM EVIDENCE — VocUtterance; verbatim immutable, normalized_text additive, redacted_display_text separate
   ↓  span_grounding.js       EXACT-SPAN GROUNDING + negation + prior-experience + sarcasm guards
   ↓  observation.js          VOC OBSERVATION — one grounded aspect per span; intensity only from an explicit word
   ↓  taxonomy.js             CONTROLLED TAXONOMY MAPPING — voc-aspect-v1 / voc-concept-v1 / voc-question-v1
   ↓  questions.js / alternatives_triggers_criteria.js   questions / alternatives / triggers / decision criteria (all grounded)
   ↓  clustering.js           CLUSTER — deterministic (aspect, canonical_concept); FREQUENCY discipline; representative quotes
   ↓  coverage.js             FREQUENCY / COVERAGE + segment/journey comparisons (explicit refs only) + VocCompletion
   ↓  pattern_insight.js      CONFLICT / SEGMENT DIFFERENCE + VOC PATTERN + CUSTOMER INSIGHT (analytical)
   ↓  buying_language.js      BUYING LANGUAGE LIBRARY — exact customer phrases by aspect (no generated copy)
   ↓  report.js               VOC REPORT — 25 sections, evidence appendix, evidence_graph_valid
```

`referenceTime` is caller-supplied — the engine never reads the system clock.

## 3. Files (spec §AA)

`astra/src/commercial/voc/` (14 modules, ~1,240 LoC, `crypto` only, **no LLM**):
`taxonomy.js` · `speaker_validation.js` · `utterance.js` · `span_grounding.js` ·
`observation.js` · `questions.js` · `alternatives_triggers_criteria.js` · `clustering.js` ·
`coverage.js` · `pattern_insight.js` · `buying_language.js` · `report.js` · `engine.js` ·
`index.js`.
(`span_grounding.js` covers §E/§F/§G; `alternatives_triggers_criteria.js` covers §I/§J/§K;
`coverage.js` covers §O/§P/§Q/§W; `pattern_insight.js` covers §R/§T/§U.)

`astra/benchmarks/astra11f/` (isolated — **not** `astra10ah`): `fixtures.js` (6 verticals +
15 adversarial) · `run_voc_benchmark.js` (**34 checks**).

`astra/tests/astra11f.test.js` — **W1..W50 + 10 compatibility/security, 60 pass / 0 fail**.

## 4. Reuse (no second evidence/provenance system — spec)

| reused | for |
|---|---|
| ASTRA-11D `engine.runMarketResearch` output | the sole source of customer utterances (QUOTE/CLAIM observations) |
| ASTRA-11B `provenance/provenance.js` `pv` | every `VocUtterance.provenance` |
| ASTRA-11B `validation/confidence.js` | every `ConfidenceAssessment` |
| ASTRA-11B `validation/canonical.js` | all hashing / identity / freezing |
| ASTRA-11C `normalization/normalize.js` | `normalized_text` derivation |
| ASTRA-11C `ingestion/redaction.js` | `redacted_display_text` + `redaction_manifest` (privacy §Y) |

## 5. Core invariants

1. **Speaker discipline (§A/§Z):** only `CUSTOMER` / `PROSPECT` / `FORMER_CUSTOMER` language is canonical VOC. `BUSINESS` / `COMPETITOR` / `SALESPERSON` / `THIRD_PARTY` is recorded in `excludedNonVoc` and never counts. `UNKNOWN_CUSTOMER_ROLE` utterances are kept but their observations are `ANALYTICAL` (never prevalence).
2. **Verbatim immutable (§B):** `verbatim_text` is deep-frozen; `normalized_text` and `redacted_display_text` are additive derived fields. `verifyUtterance` fails closed on any alteration.
3. **Controlled taxonomy (§C/§H/§L):** aspects, concepts, and question types come only from versioned controlled vocabularies — no free-form canonical labels, no LLM taxonomy.
4. **Exact-span grounding (§E/§F):** each observation carries the narrowest supporting span (text + char offsets); `span_matches_verbatim` is asserted. One utterance → many observations, each with its own span.
5. **Negation & context preserved (§G):** a negation cue before a keyword flips a `negatable` rule to its documented opposite (or suppresses the negative); `"No me pareció caro"` → `PRICE_ACCEPTANCE`, never `PRICE_CONCERN`. `"Pensé que dolería"` is flagged `prior_experience`, distinct from `"no dolió"` (`PAIN_EXPERIENCED`).
6. **Sarcasm guard:** a keyword wrapped in quotes, or a POSITIVE match next to a contradictory complaint in the same clause, → `sarcasm_suspected`, aspect `UNKNOWN`, status `ANALYTICAL`.
7. **Frequency discipline (§N):** clusters expose `observation_count`, `deduped_observation_count`, `utterance_count`, `unique_source_count`, `unique_speaker_count`, and a `denominator_note`. Prevalence is never `"% of customers"` without a customer denominator. Duplicate verbatim text does not inflate counts; repeated same-speaker text keeps `unique_speaker_count = 1`.
8. **Contradictions preserved (§R):** per-cluster `CONSENSUS/MIXED/POLARIZED/INSUFFICIENT` + cross-concept polarization over opposing pairs (`PRICE_CONCERN ↔ PRICE_ACCEPTANCE`, …). Never collapsed.
9. **Representative quotes are verbatim (§S):** `quote_kind: 'VERBATIM_QUOTE'`, `is_paraphrase: false`. The engine never fabricates or paraphrases a quote.
10. **Insights analytical (§U):** `is_fact: false`, `is_recommendation: false`, deterministic statement.
11. **No demographic / journey inference (§P/§Q):** segment / journey comparisons run only on explicitly-supplied refs. `UNKNOWN` stays valid.
12. **Model-knowledge separation (§Z):** the engine reads only ASTRA-11D evidence — it invents no quote, pain, desire, objection, fear, trigger, speaker, frequency, segment, or question.

## 6. Not in this gate

No live web / crawling; no CRM / Meta / WhatsApp / production DB; no deploy; no autonomous
action; no production routing; no generated marketing copy; no Buyer Persona / ICP /
Segmentation / Journey / JTBD / Positioning / Offer / Funnel work. No change to
`READY_FOR_PRODUCTION_ROUTING` (FALSE), the ASTRA-10AX `QUALITY_GATE` (FAIL),
`BENCHMARK_WINNER` (NOT_DECLARED), or any frozen ASTRA-10 artifact
(`astra/benchmarks/astra10ah/` `harness_hash` verified — test `C8`).
