# VOC_REPORT_CONTRACT — ASTRA-11F

Module: `voc/report.js` (`buildReport`). Reproducible from identical inputs
(order-independent `content_hash`). `generated_by: 'deterministic:ucdm/voc'`.

## Top-level shape

```
{ report_id / content_hash, schema_version: 'ucdm-voc-1.0.0',
  downstream_schema_versions: { ucdm, ingest, research, competitor },
  request_ref, reference_time, generated_by, counts{...},
  sections{ ...25 sections... }, section_names[],
  evidence_graph_valid: bool, evidence_graph_errors[],
  research_completion, caveats[] }
```

## The 25 sections (§X)

Every section is **either populated or explicitly `{ status: 'UNKNOWN' }`** — a missing
section is never silently omitted (W39). `section_names.length === 25` always.

`executive_summary · scope · coverage · top_pains · top_desires · top_fears · top_objections ·
triggers · alternatives · decision_criteria · questions · reasons_to_buy · reasons_not_to_buy ·
complaints · expected_outcomes · segment_differences · journey_stage_differences · contradictions ·
representative_quotes · buying_language_library · patterns · insights · unknowns · limitations ·
evidence_appendix`.

- `top_*` sections rank clusters by `deduped_observation_count`.
- `segment_differences` / `journey_stage_differences` are `{ status: 'INSUFFICIENT_*_REFS' }`
  unless explicit refs were supplied (§P/§Q).
- `representative_quotes` lists `VERBATIM_QUOTE` spans with `source_ref` (redacted display
  text is on the underlying utterance).
- `buying_language_library` is referenced by `library_id`.

## Evidence-graph validity — W49

`evidence_graph_valid` is a **deterministic** check:
1. every `pattern.supporting_observations` id resolves to an observation in the report, and
2. every `observation.evidence_refs` appears in `sections.evidence_appendix.entries`.

`evidence_graph_errors[]` names any break. A clean run → `evidence_graph_valid: true`,
`evidence_graph_errors: []`.

## Reproducibility — W40 / C9

`report_id = 'vocr_' + sha256(canonical(report without report_id))`. Constituent sets are
sorted id/hash arrays → the same inputs in any order produce the same `content_hash`.
`buyingLanguage.library_id` is likewise stable.

## Caveats (always present)

- Only customer/prospect-attributable language is canonical VOC — business and competitor copy is excluded.
- `verbatim_text` is immutable; `normalized_text` and `redacted_display_text` are additive.
- Frequencies use explicit denominators; prevalence is never expressed as "% of customers" without a customer denominator.
- Contradictions are preserved, never collapsed.
- Insights are analytical, never facts, never recommendations.
- **No ASTRA-11F output may feed production routing or autonomous action.**

## Model-knowledge separation — §Z / W50

The engine reads only ASTRA-11D evidence objects. It invents no quote, pain, desire,
objection, fear, trigger, speaker, frequency, segment, or customer question. Absent evidence
→ `UNKNOWN` / `INSUFFICIENT`. `provenance_note`: *"Only customer/prospect language is
canonical VOC. No LLM. No production routing. No autonomous action."*
