# VOC_TAXONOMY_CONTRACT — ASTRA-11F

All taxonomies are **controlled and versioned**. No free-form canonical label is generated
by an LLM (there is no LLM in this gate). Modules: `voc/taxonomy.js`, `voc/span_grounding.js`,
`voc/observation.js`, `voc/questions.js`, `voc/alternatives_triggers_criteria.js`.

## Aspect taxonomy — `voc-aspect-v1` (§C)

`PAIN · DESIRE · FEAR · OBJECTION · TRIGGER · ALTERNATIVE · DECISION_CRITERION ·
REASON_TO_BUY · REASON_NOT_TO_BUY · EXPECTATION · COMPLAINT · FRUSTRATION · BARRIER ·
OUTCOME · BENEFIT · RISK · QUESTION · UNCERTAINTY · UNKNOWN`.

`UNKNOWN` is always valid (W8). `observation.js` rejects any aspect outside this list.

## Canonical concept taxonomy — `voc-concept-v1` (§L)

`PRICE_CONCERN · PRICE_ACCEPTANCE · PAIN_FEAR · PAIN_EXPERIENCED · SPEED_NEED · SLOW_SERVICE ·
TRUST_CONCERN · RESULTS_DESIRED · RESULTS_UNCERTAINTY · PROCESS_UNCLEAR · FINANCING_DEMAND ·
GUARANTEE_DEMAND · RESPONSIVENESS_COMPLAINT · QUALITY_PRAISE · CONVENIENCE_VALUE ·
UNKNOWN_CONCEPT`.

Concept mapping is a **controlled keyword ruleset** (`KEYWORD_RULES`). Semantically
equivalent surface phrases ("muy caro", "se me hace caro", "está costoso") map to one
concept (`PRICE_CONCERN`) **while every verbatim form is retained** in the cluster and the
Buying Language Library (W23, W24). Every observation carries `concept_map_version`.

## Question taxonomy — `voc-question-v1` (§H)

`price_question · duration_question · process_question · risk_question · result_question ·
eligibility_question · availability_question · financing_question · guarantee_question ·
comparison_question · trust_question · UNKNOWN`.

A question is recognized only by explicit punctuation (`?` / `¿`) or an **accented** Spanish
interrogative opener (`qué`, `cuánto`, `cómo`, …) — bare unaccented "que"/"como" are
excluded by design. `verbatim_question` preserves the exact question text (W16, W17).

## Alternatives (§I), Triggers (§J), Decision criteria (§K)

- **Alternatives:** `competitor · diy · do_nothing · wait · cheaper_option · different_category ·
  existing_provider · referral · manual_process · UNKNOWN`. A `competitor` alternative is
  **never auto-resolved to a competitor identity** (`validateAlternative` rejects a
  `resolved_competitor_id` — W19).
- **Triggers:** `pain_worsened · deadline · life_event · business_slowdown ·
  failed_previous_solution · recommendation · promotion · new_budget · new_responsibility ·
  seasonality · urgent_need · UNKNOWN`. Every trigger is `grounded_in_evidence` with
  `evidence_refs` — **never invented from a persona stereotype** (`validateTrigger` — W20).
- **Decision criteria:** `price · speed · quality · trust · proof · location · convenience ·
  financing · guarantee · technology · expertise · personalization · availability · support ·
  reputation · UNKNOWN`. Derived from the `criterion` field on matched keyword rules, each
  with `evidence_refs` (W21).

## Span grounding (§E §F §G) — `voc/span_grounding.js`

`groundUtterance(utterance)` → `{ spans[] }`:

1. **Clause split** on sentence punctuation + connectives (`pero`, `aunque`, `y`, `porque`, …),
   preserving char offsets over the original text.
2. Per clause, match `KEYWORD_RULES`; the supporting **span** is the matched phrase (or the
   whole clause only when the phrase is >60% of it). Offsets map back to the verbatim string;
   `observation.js` asserts `span_matches_verbatim`.
3. **Negation** (§G): a negation cue (`no`, `nunca`, `sin`, …) before the keyword →
   a `negatable` rule flips to its `flip` (`PRICE_CONCERN → PRICE_ACCEPTANCE`,
   `PAIN_FEAR → PAIN_EXPERIENCED`); otherwise a NEGATIVE match is demoted to a `NEUTRAL`
   `OUTCOME`. Negation is **never stripped** during normalization.
4. **Prior experience** (§G): `PRIOR_RE` (`pensé que`, `creí que`, `esperaba que`, …) sets
   `prior_experience: true` — the aspect describes a *former belief*, distinct from the
   actual outcome in a later clause.
5. **Sarcasm guard:** keyword wrapped in quotes, or a POSITIVE match co-located with a
   contradictory complaint clause → `sarcasm_suspected`, aspect `UNKNOWN`, downgraded to
   `ANALYTICAL`.
6. An unclassified clause still yields an `UNKNOWN` / `UNKNOWN_CONCEPT` span so coverage
   reflects unclassified customer language.

## VocObservation (§D) — `voc/observation.js`

```
{ observation_id, utterance_ref, aspect, subject, evidence_ref, evidence_refs[],
  exact_span{text, start, end}, span_matches_verbatim, normalized_concept, concept_map_version,
  polarity ∈ {POSITIVE, NEGATIVE, NEUTRAL, MIXED, UNKNOWN},
  intensity, intensity_basis ∈ {EXPLICIT_INTENSITY_WORD, NOT_DETERMINABLE},
  negated, prior_experience, decision_criterion, speaker_role, speaker_pseudonym,
  source_ref, segment_ref, journey_stage_ref, confidence, status ∈ {OBSERVED, ANALYTICAL} }
```

- **`intensity` is only set from an EXPLICIT intensity word** (`muy`, `demasiado`, `un poco`,
  …) — never inferred from punctuation or capitalization (`validateObservation` — spec §D).
- **No hidden psychographic inference** — there is no personality/emotion model; polarity
  comes from the controlled rule, not from tone analysis.
- `status: 'OBSERVED'` requires an eligible speaker + a matched rule; everything else
  (`UNKNOWN` aspect, unknown speaker, sarcasm) is `ANALYTICAL`.
