# BUYING_LANGUAGE_CONTRACT — ASTRA-11F

Module: `voc/buying_language.js`. This library will later feed copy/creative systems —
**this gate produces no marketing copy.**

## BuyingLanguageLibrary (§V)

```
{ library_id, aspects[], generated_by: 'deterministic:ucdm/voc',
  library: {
    <ASPECT>: { top_phrases: [{ phrase, variants[], unique_speaker_count, source_count,
                                evidence_refs[], freshness }],
                phrase_count, contains_generated_copy: false }
             | { status: 'UNKNOWN' }
  } }
```

**Organized by aspect:** `PAIN · DESIRE · OBJECTION · FEAR · TRIGGER · DECISION_CRITERION ·
QUESTION · OUTCOME · REASON_TO_BUY · REASON_NOT_TO_BUY`. Adjacent aspects fold in
(`COMPLAINT/FRUSTRATION/BARRIER → PAIN/OBJECTION`, `BENEFIT → REASON_TO_BUY`,
`UNCERTAINTY/RISK → FEAR`, `EXPECTATION → DESIRE`).

## What enters the library

- **OBSERVED, non-negated** VocObservation spans (exact customer language).
- Verbatim questions (`QUESTION`), trigger spans (`TRIGGER`), decision-criterion spans
  (`DECISION_CRITERION`).

Every phrase is a **real customer verbatim span** carrying `evidence_refs` (W44).
`validateLibrary` fails closed if any phrase has no evidence, an unresolved evidence ref, or
if a section flags `contains_generated_copy` (W45).

## Per-phrase fields

| field | notes |
|---|---|
| `phrase` | the canonical (lower-cased key) form |
| `variants[]` | every distinct surface form observed — **linguistic variation is preserved** (§L, W24) |
| `unique_speaker_count` | distinct `speaker_pseudonym`, or `null` when not identifiable |
| `source_count` | distinct `source_ref` |
| `evidence_refs[]` | resolvable in the report evidence appendix |
| `freshness` | age in days (vs caller `referenceTime`) of the newest citing utterance, or `null` |

`top_phrases` is ordered deterministically by `source_count` then phrase text, capped at 10
per aspect.

## Boundary

- **No generated marketing copy.** The library is a catalogue of things customers actually
  said, nothing more.
- No phrase is invented, rephrased, or "improved".
- A future copy/creative gate consumes this library; ASTRA-11F only builds it.
