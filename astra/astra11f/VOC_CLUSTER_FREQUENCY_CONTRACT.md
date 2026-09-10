# VOC_CLUSTER_FREQUENCY_CONTRACT — ASTRA-11F

Modules: `voc/clustering.js`, `voc/coverage.js`.

## VocCluster (§M) — deterministic

```
{ cluster_id, method: 'deterministic-taxonomy', aspect, canonical_concept,
  observation_refs[], utterance_refs[], segment_refs[],
  frequency{ observation_count, deduped_observation_count, utterance_count,
             unique_source_count, unique_speaker_count,
             known_speaker_observations, unknown_speaker_observations, denominator_note },
  representative_quotes[], polarity_mix, confidence, content_hash }
```

A cluster = all **OBSERVED** observations sharing `(aspect, canonical_concept)`. Grouping,
ordering, and ids are deterministic (W25). No LLM clustering; a future LLM clustering layer
would have to stay analytical, schema-constrained, and separately authorized.

## Frequency discipline (§N)

| count | definition |
|---|---|
| `observation_count` | grounded spans in this cluster |
| `deduped_observation_count` | distinct `(source_ref, span_text)` — duplicate evidence does not inflate (W27) |
| `utterance_count` | distinct source utterances |
| `unique_source_count` | distinct `source_ref` |
| `unique_speaker_count` | distinct `speaker_pseudonym`, or **`null`** when speakers are not identifiable |

**`denominator_note`** is emitted with every cluster:
- speakers known → *"N unique observed speakers (of the speaker-identifiable subset)"*
- speakers unknown → *"M independent observations across K sources — speaker count not determinable, do NOT express as '% of customers'"*

A repeated message from the **same speaker** keeps `unique_speaker_count = 1` — it is not
independent prevalence (W29). Identical verbatim text across sources raises
`coverage.duplicate_ratio` and, at ≥ 0.25, the `DUPLICATE_HEAVY` completion reason (W48).
The engine never states *"X% of customers"* without a customer denominator (W30).

## Representative quotes (§S) — deterministic

`selectRepresentativeQuotes` ranks by **directness** (short span, not negated, not prior),
then de-duplicates by `(source_ref, span_text)` and by `source_ref`, then stable-sorts by
`observation_id`. Each quote:

```
{ quote_kind: 'VERBATIM_QUOTE', is_paraphrase: false,
  verbatim_text (the exact span), full_utterance_verbatim, verbatim_hash,
  redacted_display_text, speaker_role, speaker_pseudonym, source_ref, evidence_refs[] }
```

The engine **never fabricates or paraphrases** a quote (`validateCluster` rejects a
non-`VERBATIM_QUOTE` / `is_paraphrase` representative — W39, W40). `PARAPHRASED_SUMMARY` is a
reserved kind for a future gate; ASTRA-11F emits only `VERBATIM_QUOTE`.

## VocCoverage (§O)

```
{ coverage_id, source_count, utterance_count, observation_count, unique_speaker_count,
  known_vs_unknown_speakers{known, unknown_utterances}, source_type_diversity, source_types[],
  segment_coverage{segments[], count}, journey_stage_coverage{stages[], count},
  time_coverage{latest, newest_age_days, stale}, language_coverage{languages[], count, request_language, mismatch},
  duplicate_ratio, sampling_limitations[], generated_by }
```

Sampling limitations are **explicit** (few sources, unidentifiable speakers, unknown-speaker-heavy).

## Segment / journey differences (§P §Q)

- `compareSegments(clusters, observations)` runs **only** on explicit `segment_ref`s; with
  `< 2` distinct refs → `{ status: 'INSUFFICIENT_SEGMENT_REFS', note: '… no demographic
  inference' }`. **No demographic inference, ever** (W22, W34).
- `compareJourneyStages(observations)` runs **only** on supplied `journey_stage_ref`s;
  journey stage is **never silently inferred**; `UNKNOWN` stays valid (W35, W36).

## VocCompletion (§W) — deterministic

`status ∈ {COMPLETE_FOR_SCOPE, PARTIAL, INSUFFICIENT, BLOCKED}`.
**Reason codes:** `LOW_SOURCE_COUNT · LOW_SPEAKER_COUNT · LOW_SOURCE_DIVERSITY ·
UNKNOWN_SPEAKER_HEAVY · MISSING_SEGMENT_COVERAGE · MISSING_JOURNEY_COVERAGE · STALE_DATA ·
DUPLICATE_HEAVY · LANGUAGE_MISMATCH · SOURCE_FAILURE`.

- `BLOCKED` — no utterances.
- `INSUFFICIENT` — `< 2` sources, or zero observations.
- `PARTIAL` — any reason code.
- `COMPLETE_FOR_SCOPE` — none.

**An LLM may never mark VOC research complete** — `generated_by:
'deterministic:ucdm/voc/completion'` (W46, W47, W48).
