# ASTRA-NEXT-08 — Knowledge Routing Final Adjudication

Date: 2026-09-17
Branch: `astra-next-poc`
Audited commit: `d958e6824b8734338d8613540b3f7870e2931783`

## Final verdict

`ASTRA_NEXT_08_KNOWLEDGE_ROUTING = PASS`

The final live Render audit completed with:

- passed: 6
- failed: 0
- total: 6
- max evidence chunks per creative request: 12
- LLM calls during routing audit: 0
- fail-closed safety test: PASS

## Final live cases

| Case | Intent | Final evidence budget | Verdict |
|---|---|---:|---|
| KR-01 | visual design | 8/12 | PASS |
| KR-02 | Meta Ads visual creative | 12/12 | PASS |
| KR-03 | copy-only headlines | 4/12 | PASS |
| KR-04 | art direction / composition | 8/12 | PASS |
| KR-05 | Meta Andromeda creative | 10/12 | PASS |
| KR-06 | retrieval deliberately disabled | blocked as required | PASS |

## Source-family behavior verified

### KR-01 — visual design
Recovered both required knowledge families:
- formal design: `THE_ELEMENTS_OF_GRAPHIC_DESIGN_ALEX_WHITE.md`
- advertising concept/art direction: `THE_ADVERTISING_CONCEPT_BOOK_PETE_BARRY.md`

### KR-02 — Meta Ads visual creative
Recovered all required families:
- formal design
- advertising concept/art direction
- current Meta Ads knowledge

Observed sources included:
- `THE_ELEMENTS_OF_GRAPHIC_DESIGN_ALEX_WHITE.md`
- `THE_ADVERTISING_CONCEPT_BOOK_PETE_BARRY.md`
- `20_META_ADS_2026.md`
- `Estudio de Mercado Meta Ads Mexico.md`

### KR-03 — copy-only
Correctly avoided formal visual-design retrieval and used advertising/copy knowledge only.
Observed sources:
- `THE_ADVERTISING_CONCEPT_BOOK_PETE_BARRY.md`
- `HEY_WHIPPLE_SQUEEZE_THIS_LUKE_SULLIVAN.md`

### KR-04 — art direction
Recovered formal-design and advertising-concept evidence before marking the request READY.

### KR-05 — Meta Andromeda
Recovered:
- formal-design evidence
- advertising-concept evidence
- current Meta Ads evidence
- dedicated verified Andromeda source: `META_ANDROMEDA_VERIFIED_2026.md`

Final context was 10/12 chunks, inside the enforced global budget.

### KR-06 — fail closed
With retrieval disabled, the router correctly refused READY status and emitted missing-evidence violations for formal design, advertising concept/copy, distinct design sources, and current Meta evidence.

## Architecture validated

Creative knowledge path:

`Creative request -> deterministic intent classification -> bounded source-family retrieval -> evidence validation -> READY_WITH_EVIDENCE or BLOCKED_OR_GAP`

Legacy knowledge remains read-only and intact. ASTRA NEXT uses the isolated `astra-next-kb` bridge with source-scoped retrieval. The bridge was revised so `top_k` is a hard final result cap rather than a cap per retriever. The request-level auditor separately reserves budget for local verified sources such as Andromeda and fails if total evidence exceeds 12 chunks.

## Knowledge inventory confirmed during the gate

Legacy design/copy corpus available to ASTRA NEXT:

- `GRAPHIC_DESIGN_SOLUTIONS_4E_ROBIN_LANDA.md` — 466 chunks
- `THE_ELEMENTS_OF_GRAPHIC_DESIGN_ALEX_WHITE.md` — 183 chunks
- `HEY_WHIPPLE_SQUEEZE_THIS_LUKE_SULLIVAN.md` — 243 chunks
- `THE_ADVERTISING_CONCEPT_BOOK_PETE_BARRY.md` — 217 chunks

Total specialized design/copy chunks: 1,109.

Current Meta family includes `20_META_ADS_2026.md` and Mexico market context. A separate versioned source, `META_ANDROMEDA_VERIFIED_2026.md`, is required for Andromeda-specific claims.

## Safety / operating state

After adjudication, `RUN_KNOWLEDGE_ROUTING_AUDIT` was returned to `false` so the audit does not execute on normal service starts.

Campaign360 and the Agent Flow execution remained disabled during this routing audit. The routing audit made zero LLM generation calls.

## Next gate

`ASTRA-NEXT-09 — Grounded Creative Output QA`

Purpose: prove not only that the correct knowledge is retrieved, but that an actual creative-direction output visibly applies the retrieved principles and preserves source traceability.

Proposed acceptance criteria:

1. request routes to the correct source families before generation;
2. evidence pack remains <=12 chunks;
3. generated creative direction identifies the exact sources used;
4. major visual/copy decisions map to evidence or are explicitly labeled creative judgment/inference;
5. Meta-specific recommendations require current Meta evidence;
6. Andromeda-specific recommendations require the verified Andromeda source;
7. no unsupported performance promises or fabricated business facts;
8. removal of required evidence causes the output to block or downgrade rather than silently proceed.
