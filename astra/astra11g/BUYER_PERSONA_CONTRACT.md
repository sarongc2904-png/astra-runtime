# BUYER_PERSONA_CONTRACT — ASTRA-11G

Modules: `buyer_persona.js`, `persona_evidence.js`, `awareness.js`, `urgency.js`,
`budget_signal.js`, `conflicts.js`, `merge_split.js`.

## BuyerPersona (§G)

```
{ persona_id, schema_version, kind: 'BuyerPersona', segment_refs[], label,
  current_situation, desired_situation, primary_problem, secondary_problems,
  functional_pains, emotional_pains, desired_outcomes, fears, objections,
  triggers, alternatives, decision_criteria, reasons_to_buy, reasons_not_to_buy,
  awareness{stage,basis,evidence_refs}, urgency{level,basis,evidence_refs},
  budget_signal{signal,basis,evidence_refs}, channels, questions,
  buying_language_refs, proof_needed, friction, explicit_attributes,
  evidence_refs[], scope, confidence, unknowns[], coverage }
```

- **No field is required.** Missing evidence ⇒ `{ status: 'UNKNOWN' }`; every UNKNOWN field is
  also listed in `persona.unknowns` alongside every un-supplied prohibited attribute (W15).
- Concept-list fields (`functional_pains`, `fears`, …) are built only from OBSERVED VoC
  observations; each row carries its own `evidence_refs` (W16–W25). `validatePersona` rejects a
  present field with no evidence.
- **`primary_problem`** is anchored to the segment's primary concept + evidence.
- **`awareness` / `urgency` / `budget_signal`** are the evidence-backed classifier outputs
  (below); MIXED / UNKNOWN are legal.
- **No demographic field** may appear on the persona except under `explicit_attributes`
  (`USER_PROVIDED`) — `validatePersona` rejects a derived `age`/`gender`/… key.

## Persona narrative (§H)

`renderNarrative(persona)` is a **pure deterministic function** — it interpolates only canonical
field values (concepts, stages, basis, `unknowns`). It asserts `is_analytical: true`,
`adds_no_new_facts: true`. `validateNarrative(narrative, persona)` **recomputes** the text and
rejects any divergence (an injected "María, 37, casada, gana $35 000 MXN/mes" fails), and
rejects demographic/psychographic filler via `PROHIBITED_RE` (W28). A future LLM renderer would
still have to pass schema + evidence validation.

## Persona Evidence Map (§I)

`buildPersonaEvidenceMap` traces every material field:
`Persona field → evidence_ref → Observation → Utterance → source_ref`.
`evidence_graph_valid` is `false` (and `validatePersonaEvidenceMap` fails **closed**) if any
`evidence_ref` resolves to no observation, or an observation references a missing utterance
(W29).

## Buying language attachment (§J)

`persona.buying_language_refs` references the ASTRA-11F `BuyingLanguageLibrary` by
`library_id`, grouped `by_aspect`, each phrase carrying real `evidence_refs`.
`contains_generated_copy` is always `false`; `validatePersona` rejects `true` (W26, W27). Only
grounded customer language — no generated marketing copy is copied in.

## Awareness (§K) — `awareness.js`

`AWARENESS_STAGES` = `UNAWARE · PROBLEM_AWARE · SOLUTION_AWARE · PRODUCT_AWARE · MOST_AWARE ·
MIXED · UNKNOWN`. Analytical unless explicitly supplied/observed. Derived from controlled
concept signals (+ tried alternatives ⇒ ≥ SOLUTION_AWARE, comparison/price/guarantee questions
⇒ PRODUCT_AWARE). **≥ 2 stages present ⇒ `MIXED`** (never forced). A non-UNKNOWN stage requires
`evidence_refs` (W30, W31).

## Urgency (§L) — `urgency.js`

`URGENCY_LEVELS` = `LOW · MEDIUM · HIGH · MIXED · UNKNOWN`. Evidence-backed only, from
controlled trigger types (`deadline · urgent_need · pain_worsened · business_slowdown ·
failed_previous_solution · seasonality` → HIGH; `life_event · new_budget · …` → MEDIUM) and an
active worsening pain. **Engagement frequency / message volume is never a signal** —
`validateUrgency` rejects any `frequency|volume|engagement` signal string (W32, W33).

## Budget / ability-to-pay (§M) — `budget_signal.js`

`BUDGET_SIGNALS` = `BUDGET_DECLARED · PRICE_SENSITIVE · FINANCING_REQUIRED · BUDGET_FLEXIBLE ·
NO_BUDGET_SIGNAL · UNKNOWN`. Concept map: `PRICE_CONCERN→PRICE_SENSITIVE`,
`PRICE_ACCEPTANCE→BUDGET_FLEXIBLE`, `FINANCING_DEMAND→FINANCING_REQUIRED`. Multiple signals →
dominant shown, full `signal_mix` preserved. **No personal income / wealth inference** from
geography, title, device, or spending language; `validateBudgetSignal` rejects an income
inference; declared company budget is representable only when supplied (W34, W35, W36).

## Persona conflicts (§U) — `conflicts.js`

Reuses the ASTRA-11F contradiction signal (no parallel system). `CONFLICT_THEMES` = price /
pain / results / responsiveness. Per theme: `CONSISTENT · MIXED · POLARIZED · INSUFFICIENT`.
A `MIXED`/`POLARIZED` conflict is **preserved, never averaged**, and is flagged
`likely_multiple_segments: true` (W52, W53).

## Persona merge / split (§V) — `merge_split.js`

`assessMergeSplit` computes similarity over **canonical attributes only** (Jaccard over concept
sets); `label_similarity` is reported but never drives the decision. Outcomes:
`KEEP_SEPARATE` · `MERGE_SUPPORTED` (attribute similarity ≥ 0.6 and no material conflict) ·
`REVIEW_REQUIRED` (any material persona conflict). `destructive_merge_performed` is always
`false` — no automatic merge (W54, W55).
