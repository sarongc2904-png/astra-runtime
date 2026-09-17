# ASTRA-NEXT-08 — Knowledge Routing & Creative Expertise Audit

## Status

`ASTRA_NEXT_08_SOURCE_INVENTORY = PASS`

`ASTRA_NEXT_08_ROUTING_POLICY = IMPLEMENTED`

`ASTRA_NEXT_08_RUNTIME_RETRIEVAL_INTEGRATION = PENDING`

`ASTRA_NEXT_08_ANDROMEDA_COVERAGE = FAIL_MISSING_DEDICATED_SOURCE`

## Why this gate exists

ASTRA NEXT previously proved Campaign360 quality using a representative seven-source workspace RAG sample. That is not sufficient for expert-grade creative work. A request such as "hazme un anuncio" must not be answered from model priors or summary reports when the canonical ASTRA knowledge corpus already contains specialist design/copy sources.

## Live source audit

Supabase project: `ftoxermwkfebmnrudiuu`

Legacy corpus: `public.kb_chunks`

Promoted corpus: `public.kb_chunks_v2`

### Design/copy books found in legacy corpus

- `GRAPHIC_DESIGN_SOLUTIONS_4E_ROBIN_LANDA.md` — 466 chunks, 466 embedded.
- `HEY_WHIPPLE_SQUEEZE_THIS_LUKE_SULLIVAN.md` — 243 chunks, 243 embedded.
- `THE_ADVERTISING_CONCEPT_BOOK_PETE_BARRY.md` — 217 chunks, 217 embedded.
- `THE_ELEMENTS_OF_GRAPHIC_DESIGN_ALEX_WHITE.md` — 183 chunks, 183 embedded.

Total specialist design/copy chunks available: **1,109**.

The previous design audit had only promoted The Advertising Concept Book into `kb_chunks_v2`; the other three books were present in legacy `kb_chunks` but `NOT_ACTIVE` in V2. This explains why a generic workspace RAG load could miss them.

### Meta sources found

- `20_META_ADS_2026.md` — 6 chunks.
- `SRC_META_VELOCITY_FACEBOOK_COURSE` / Velocity Facebook Ads transcript bundle — 35 chunks in V2.
- `Estudio de Mercado Meta Ads Mexico.md` — 6 chunks in legacy corpus.

`20_META_ADS_2026.md` contains verified current rules for Advantage+, downstream optimization, CRM/CAPI feedback, WhatsApp lead optimization, and diagnostic policy. It does **not** contain a dedicated Meta Andromeda doctrine.

## Critical finding

There is no dedicated source named or indexed as Meta Andromeda in the audited corpora or repository.

Therefore:

`KNOWLEDGE_GAP_ANDROMEDA = TRUE`

ASTRA must never manufacture Andromeda-specific recommendations and label them as evidence. Until a verified Andromeda source is ingested, explicit Andromeda requests must return a knowledge-gap marker while still using current Meta evidence for claims those sources actually support.

## Mandatory routing policy

Implemented in:

`astra-next-poc/knowledge/creative_knowledge_router.js`

Source inventory:

`astra-next-poc/knowledge/creative_source_manifest.json`

Rules:

1. **NO_CREATIVE_WITHOUT_EVIDENCE.** A creative deliverable cannot be marked READY before retrieval.
2. Visual/graphic-design tasks require at least one formal-design source (`Graphic Design Solutions` or `The Elements of Graphic Design`).
3. Advertising creative/copy requires at least one advertising-concept source (`Hey, Whipple` or `The Advertising Concept Book`).
4. A visual ad requires at least two distinct specialist design/copy sources across those families.
5. Meta ad requests additionally require a current Meta source.
6. Explicit Andromeda requests require a dedicated Andromeda source; otherwise emit `KNOWLEDGE_GAP_ANDROMEDA`.
7. Retrieval remains bounded: maximum 12 evidence chunks per creative task; no whole-KB dump.
8. Every evidence item must preserve provenance (`source_file`/`source_pdf_name`, chunk id where available, topic/section, and excerpt).

## Runtime target architecture

```text
User creative request
    ↓
Deterministic intent classifier
    ↓
Creative Knowledge Router
    ├── formal design retrieval
    ├── advertising concept/copy retrieval
    └── current Meta retrieval (when applicable)
    ↓
Evidence gate
    ├── PASS → Creative Director / Copywriter
    └── FAIL → BLOCKED_OR_GAP (never silent fallback to model priors)
    ↓
Creative synthesis
    ↓
Creative critic checks output against retrieved principles
```

The legacy `search-kb` Edge Function is the preferred retrieval bridge because it already implements hybrid semantic + full-text retrieval against ASTRA's knowledge corpus and preserves source provenance. ASTRA NEXT should call that endpoint instead of duplicating 1,109 specialist book chunks into the ephemeral AnythingLLM POC.

## Acceptance tests required for runtime PASS

### KR-01 Graphic design
Prompt: `Diseña una pieza minimalista para una clínica dental.`

PASS only if retrieval includes at least one formal-design source and one additional specialist source before synthesis.

### KR-02 Advertising creative
Prompt: `Hazme un anuncio de Meta Ads para una estética.`

PASS only if retrieval includes: formal design + advertising concept/copy + current Meta evidence.

### KR-03 Copywriting
Prompt: `Escribe 5 headlines para un anuncio de implantes dentales.`

PASS only if advertising/copy evidence is retrieved. Formal-design evidence is optional unless a visual execution is also requested.

### KR-04 Art direction
Prompt: `Dame composición, jerarquía, tipografía y espacio negativo para este creativo.`

PASS only if formal-design evidence is present and the final directions are traceable to it.

### KR-05 Andromeda
Prompt: `Haz el creativo basado en Meta Andromeda.`

Current expected result: `BLOCKED_OR_GAP` with `KNOWLEDGE_GAP_ANDROMEDA`, plus only those Meta recommendations supported by current verified Meta sources.

### KR-06 Retrieval-disabled A/B control
Run KR-02 with retrieval deliberately disabled.

Expected: evidence gate FAIL. The system must not silently produce a READY creative.

## Definition of done

ASTRA-NEXT-08 is full PASS only when all of these are true:

- source inventory PASS;
- deterministic router PASS;
- runtime `search-kb` bridge connected to ASTRA NEXT;
- KR-01 through KR-04 PASS;
- KR-05 correctly reports the Andromeda gap until source ingestion;
- KR-06 fails closed;
- final creative output records which sources were actually consulted;
- creative critic can demonstrate at least one applied design/copy principle from retrieved evidence rather than generic model knowledge.

Until runtime retrieval is wired:

`ASTRA_NEXT_08 = PARTIAL`
