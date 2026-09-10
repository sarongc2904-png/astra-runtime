# CUSTOMER_ATTRIBUTE_EVIDENCE_CONTRACT — ASTRA-11G

Module: `customer_model/attribute_evidence.js`. Schema `ucdm-customer-model-1.0.0`.

## CustomerAttributeEvidence (§A)

```
{ attribute_evidence_id, schema_version, kind: 'CustomerAttributeEvidence',
  attribute, value, source_class, scope, status, evidence_refs[],
  derived_from, speaker_pseudonym, negated, prior_experience,
  prohibited_inference_blocked, confidence, generated_by }
```

- **`attribute`** ∈ controlled `ATTRIBUTE_TYPES` (23): `problem · desired_outcome · pain · fear ·
  objection · trigger · alternative · decision_criterion · reason_to_buy · reason_not_to_buy ·
  awareness · urgency · budget_signal · purchase_context · channel · journey_context ·
  business_type · industry · company_size · location · maturity · role · decision_authority`.
- **`source_class`** ∈ ASTRA-11B `SOURCE_CLASSES` (`OBSERVED · COMPUTED · INFERRED · USER_PROVIDED`).
- **`status`** ∈ `OBSERVED · COMPUTED · ANALYTICAL · UNKNOWN`.
- **`scope`** ∈ `CUSTOMER · SAMPLE · SEGMENT · ACCOUNT · UNKNOWN`.
- Every non-`UNKNOWN` attribute that carries a `value` MUST carry `evidence_refs`.
- **ANALYTICAL is never silently upgraded to OBSERVED** — `validateAttributeEvidence` rejects an
  `INFERRED` value marked `OBSERVED`, and a signal from a non-eligible speaker
  (`UNKNOWN_CUSTOMER_ROLE`, business, competitor) stays `ANALYTICAL`.

## Prohibited inference (§B)

`PROHIBITED_INFERENCE_ATTRIBUTES` = `age, age_group, gender, marital_status, family_composition,
income, salary, wealth, net_worth, education, religion, race, ethnicity, political_ideology,
personality_type, medical_status, health_condition, sexuality, lifestyle, hobbies`.

- ASTRA never derives these. `makeAttributeEvidence` **force-downgrades** a prohibited attribute
  (or a value whose JSON matches `PROHIBITED_RE`) to `status: 'UNKNOWN'`, `value: null`,
  `prohibited_inference_blocked: true` — unless `source_class === 'USER_PROVIDED'`.
- The engine additionally emits an explicit `{ attribute, status: 'UNKNOWN', value: null,
  derived_from: 'not-inferred-by-policy' }` row for **every** prohibited attribute the business
  did not supply, so "we do not know" is auditable.
- Stereotypes never populate a field (W3–W7, W22-benchmark, W34).

## Deterministic derivation

`deriveAttributeEvidence({ vocResult, businessInput })`:

1. **Per OBSERVED Voc observation** → `OBSERVED` (customer scope) attribute evidence via the
   controlled `ASPECT_ATTR` / `CONCEPT_ATTR` maps; an `ANALYTICAL` observation → `ANALYTICAL`.
2. **Per VoC pattern** (non-`INSUFFICIENT`) → `COMPUTED` (sample scope) roll-up; a `MIXED`
   pattern → `ANALYTICAL`.
3. **Alternatives / triggers / decision criteria** from ASTRA-11F (already evidence-grounded) —
   `OBSERVED` for eligible speakers, else `ANALYTICAL`.
4. **`businessInput.explicit_attributes`** → `USER_PROVIDED` (the only path for otherwise-
   prohibited or org attributes).
5. **UNKNOWN markers** for every un-supplied prohibited attribute.

No LLM. `generated_by: 'deterministic:ucdm/customer_model'`.
