# VOC_SOURCE_UTTERANCE_CONTRACT — ASTRA-11F

`voc_schema_version = ucdm-voc-1.0.0`. Modules: `voc/speaker_validation.js`, `voc/utterance.js`.

## Eligible VOC source types (§A)

`review · survey_response · customer_conversation · sales_conversation · support_conversation ·
call_transcript · form_response · social_comment · customer_message · testimonial · interview ·
user_provided_quote`. Mapped from ASTRA-11C `source_category` via `CATEGORY_TO_VOC_SOURCE`
(overridable by a per-source hint).

## Speaker roles (§A)

`CUSTOMER · PROSPECT · FORMER_CUSTOMER · UNKNOWN_CUSTOMER_ROLE · BUSINESS · SALESPERSON ·
COMPETITOR · THIRD_PARTY`.

`classifySpeaker({ observation, envelope, hint })` → `{ speaker_role, voc_eligible,
source_type, reason, speaker_ref, speaker_pseudonym }`:

| condition | role |
|---|---|
| `hint.role` supplied | that role (human authority) |
| `verbatim.actor` = advertiser / business | `BUSINESS` — **marketing copy, never VOC** |
| `verbatim.actor` = salesperson / agent / rep | `SALESPERSON` |
| `subject.subject_type` = `Competitor` | `COMPETITOR` — **never VOC** |
| `verbatim.actor` = customer / prospect | `CUSTOMER` / `PROSPECT` |
| `source_category ∈ {REVIEW, TESTIMONIAL, SURVEY_RESPONSE, SOCIAL_COMMENT}` and no conflicting actor | `CUSTOMER` |
| `source_category ∈ {ADVERTISEMENT, WEB_PAGE}` | `BUSINESS` — never VOC |
| otherwise | `UNKNOWN_CUSTOMER_ROLE` — preserved |

**`voc_eligible = role ∈ {CUSTOMER, PROSPECT, FORMER_CUSTOMER}`.** Non-eligible, non-unknown
roles are recorded in `engine` result `excludedNonVoc[]` and never become an utterance
(W2, W3). `UNKNOWN_CUSTOMER_ROLE` utterances are built but their observations are forced to
`status: 'ANALYTICAL'` — kept for context, never counted as prevalence (W4).

`speaker_pseudonym = 'spk_' + sha256(speaker_ref)[:16]` — stable pseudonymous identifier
(§Y); a VOC report never needs the raw `speaker_ref`.

## VocUtterance (§B)

```
{ content_hash, schema_version,
  verbatim_text,            ← IMMUTABLE (deep-frozen)
  verbatim_hash,
  normalized_text,          ← additive (ASTRA-11C normalizeText: NFC + whitespace collapse; punctuation & case kept)
  redacted_display_text,    ← SEPARATE derived field (privacy §Y) — raw evidence never destroyed
  redaction_manifest: [{path, class}],
  speaker_role, voc_eligible, speaker_ref, speaker_pseudonym, source_type,
  source_ref, conversation_ref, timestamp, time_range, language, locale,
  segment_ref, journey_stage_ref, context,
  provenance (ASTRA-11B ProvenanceValue, source_class OBSERVED),
  observation_hash }
```

`verifyUtterance(u)` → fails closed if `sha256(verbatim_text) !== verbatim_hash`, or if
`normalized_text` was not actually derived (W5). Attempting to reassign `verbatim_text`
throws (`TypeError`).

### Privacy (§Y)

- `verbatim_text` is the immutable raw evidence — it may contain personal data; it is never
  auto-destroyed.
- `redacted_display_text` is produced by ASTRA-11C `buildRedactionPlan` + `applyRedaction`
  (deterministic, shape-preserving) — this is what a report/UI shows. `redaction_manifest`
  lists what was masked (email/phone/account id). Test `C5` verifies raw vs redacted are
  separate.
- speaker identity is referenced only by `speaker_pseudonym`.
