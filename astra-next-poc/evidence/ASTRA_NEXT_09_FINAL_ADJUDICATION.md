# ASTRA-NEXT-09 — Final Adjudication

Date: 2026-09-17
Branch: `astra-next-poc`
Runtime commit: `5b3593e06c156c810aca0b876630fbb761197318`
Knowledge bridge: `astra-next-kb` v3

## Objective

Verify that ASTRA NEXT can generate a real creative direction only after consulting the relevant design, advertising/copy, and current Meta knowledge, while preserving traceability from material creative decisions back to retrieved evidence.

## Test request

> Hazme un anuncio visual de Meta Ads formato 4:5 para una estética. Objetivo: llenar agenda por WhatsApp. Usa poco texto, un hook dominante y un CTA simple. No inventes resultados, descuentos ni testimonios.

## Knowledge routing / evidence gate

Status: **PASS**

- Evidence budget: `12/12`
- Stable evidence IDs:
  - `FORMAL_DESIGN:1..4`
  - `ADVERTISING:1..4`
  - `META_CURRENT:1..4`
- Sources retrieved:
  - `THE_ELEMENTS_OF_GRAPHIC_DESIGN_ALEX_WHITE.md`
  - `THE_ADVERTISING_CONCEPT_BOOK_PETE_BARRY.md`
  - `20_META_ADS_2026.md`
  - `Estudio de Mercado Meta Ads Mexico.md`

## Generation

Status: **PASS**

- AnythingLLM runtime: PASS
- Provider: OpenRouter
- Model: `openai/gpt-5-mini`
- HTTP: `200`
- JSON valid: `true`
- Duration: `54128 ms`
- Material decisions: `10`
- LLM calls: `1`
- Evidence chunks: `12/12`

The generated creative direction preserved:

- format `4:5`
- WhatsApp conversion objective
- limited text
- dominant hook
- simple CTA
- explicit visual hierarchy
- negative space
- typography/legibility choices
- contrast decisions
- complementary relationship between image and headline rather than text/image duplication

## Traceability

Status: **PASS**

The output used only source names present in the supplied evidence pack and cited stable evidence identifiers in `decisions[]`.

Examples observed in the successful run include references such as:

- `FORMAL_DESIGN:1`
- `FORMAL_DESIGN:3`
- `FORMAL_DESIGN:4`
- `ADVERTISING:1`
- `META_CURRENT:2`
- `META_CURRENT:3`

## Unsupported-claim gate

Status: **PASS**

- `unsupported_claims = []`
- no unresolved evidence IDs
- no unresolved source names
- no format drift
- no conversion drift
- no unsupported performance/proof claim violation

## Deterministic adjudication

```text
[ASTRA_NEXT_09] generation=PASS http=200 json_valid=true duration_ms=54128 decisions=10
[ASTRA_NEXT_09] adjudication=PASS violations=[]
[ASTRA_NEXT_09_GROUNDED_CREATIVE_OUTPUT_QA] status=PASS llm_calls=1 evidence=12/12
```

## Defects found and fixed during the gate

1. OpenRouter output reservation initially exceeded available credit; output ceiling was bounded without changing model.
2. Cold-start race was removed by waiting for the AnythingLLM local API to become stable before QA execution.
3. Long UUID evidence identifiers were replaced by short, family-scoped IDs in `astra-next-kb` v3.
4. The adjudicator's `sources_used` control-flow bug was corrected.
5. Unsupported-claim detection was narrowed to proposed creative content so negative constraints such as `no inventar testimonios` are not false positives.

## Final decision

`ASTRA_NEXT_09_GROUNDED_CREATIVE_OUTPUT_QA = PASS`

This gate demonstrates that a creative request can be routed to the required knowledge, bounded to a controlled evidence pack, generated through the live ASTRA NEXT stack, and deterministically checked for source traceability and unsupported claims.

This does **not** by itself prove persistence across free-tier redeploys or production readiness. Those remain separate infrastructure concerns.
