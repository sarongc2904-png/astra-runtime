# ASTRA-03B — Multi-domain knowledge source ingestion

## Result

**PASS.** Seven evidence-backed local source packages were admitted, extracted, chunked, embedded with the canonical model, and inserted additively into `public.kb_chunks_v2`. The canonical corpus grew from **763 to 1,380 chunks** and from **763 to 1,380 valid embeddings**. The prior 763 chunks and vectors remain intact. Strategy-F code and ranking were not modified.

## Source discovery and admission

- Candidates: **12**.
- ADMIT: **7**.
- DEFER: **4**.
- REJECT: **1**.

Admitted and ingested:

| Source ID | Local package | Principal value | Chunks |
|---|---|---|---:|
| `SRC_VEL_FUNNELS` | Velocity — Cursos Amplify: Funnels | Funnel architecture, audience, economics, offer, landing/sales assets | 186 |
| `SRC_VEL_SALES` | Velocity — La Venta Elegante | Sales context, strategy, tactics and script | 51 |
| `SRC_VEL_MIDAS` | Velocity — Curso MIDAS | Demand, pricing, business models/LTV and assets | 79 |
| `SRC_VEL_INFO_AZ` | Velocity — Negocio de infoproductos A–Z | Audience, proposition, launch and growth | 62 |
| `SRC_VEL_OFFER` | Velocity — Taller de Propuesta Irresistible | Focused offer/value-proposition method | 21 |
| `SRC_PRO_CRO` | Protégé — CRO Máxima | Research, experimentation, tests and prioritization | 86 |
| `SRC_PRO_GROWTH` | Protégé — Growth Marketing | Growth loops, market, positioning, economics and ICE | 132 |

Deferred for redundancy, format or provenance review: `SRC_VEL_INFO_ABC`, `SRC_PRO_BLOCKBUSTER`, `SRC_PRO_FUNNEL_QA`, and `SRC_BIBLIA_VENDEDOR`. Rejected: `SRC_COPY_FB_PROMPT`, because an operational prompt is not authoritative evidence for Meta Ads methodology.

## Extraction and chunk QA

- 64/64 admitted transcript units extracted; 0 blank units.
- All seven sources are `PASS_WITH_WARNING`: they are ASR transcripts without page numbers and may retain lexical transcription errors.
- 617 accepted chunks; 0 blank, 0 oversize (>1,850 chars), 0 undersize (<200 chars), 0 duplicate IDs/content, and 0 incomplete provenance records.
- Each chunk retains source/package, unit path, source and unit hashes, content hash, domain/subdomains, and `ASTRA03B-INGEST-20260906-01` batch traceability.
- All rows use `INCLUDE_WITH_WARNING`; degraded ASR was not silently presented as clean editorial text.

## Embeddings and additive ingestion

- Model: `text-embedding-3-small`; dimensions: 1,536; version: `openai:text-embedding-3-small:1536:input/1.0`.
- 617 new embeddings created in 10 requests (196,977 input tokens); 0 failures; all finite and non-zero.
- 617 rows inserted, 0 duplicate conflicts, 0 failures.
- Inserts used 20-row atomic PostgREST requests with `resolution=ignore-duplicates`; no merge/upsert and no overwrite of canonical rows.
- `public.kb_chunks_v2`: 763 → 1,380 rows; embeddings: 763 → 1,380; sources: 1 → 8.
- Legacy `public.kb_chunks`: 7,584 → 7,584. ANN indexes: 0 → 0.

## Retrieval and domain coverage

The unchanged Strategy-F runtime used its refreshed corpus-data snapshot and returned the following representative top-5 results:

| Domain | Before | After | Subject hits in top-5 |
|---|---|---|---:|
| Offer design | WEAK | STRONG | 5 |
| Funnel design | NONE | STRONG | 5 |
| Sales conversion | NONE | STRONG | 4 |
| Meta Ads | NONE | NONE | 0 |
| WhatsApp sales | NONE | NONE | 0 |
| Infoproducts | NONE | STRONG | 5 |
| Course creation | NONE | NONE | 0 |
| CRO | NONE | STRONG | 5 |
| Positioning | WEAK | STRONG | 5 |
| Pricing | NONE | STRONG | 5 |

All 10 queries returned complete provenance and the `Strategy-F / kb_chunks_v2 / 1,380 rows` runtime contract. Meta Ads, WhatsApp sales and course creation remain `NONE`; incidental mentions were deliberately not counted as dedicated coverage.

`DOMAIN_COVERAGE_IMPROVED = TRUE`.

## Agent V1 protection

Byte fingerprints remained identical for `knowledge.js`, `classifier_decision_cache.js`, `retrieval_strategy_f.py`, the Strategy-F pipeline definition, frozen benchmark and ground truth, rebuilt evidence, answer policy, model config, and evaluator selection/rubric. Classifier cache stayed at 20 records with an identical aggregate hash. All 763 pre-existing canonical chunk contents and vectors were compared and preserved. No specialist was executed.

The change to `rag_retrieval_refinement/corpus_snapshot.json` is **AUTHORIZED ADDITIVE KNOWLEDGE GROWTH** (763 → 1,380 rows), necessary because unchanged Strategy-F reads that data snapshot. It is not a ranking or runtime-semantic modification.

`AGENT_V1_PROTECTED = TRUE`.

## Method-registry impact and readiness

There is now sufficient evidence to enter ASTRA-03C adjudication/remapping for `METHOD_VELOCITY`, `METHOD_SALES_ACCELERATION`, `METHOD_DIGITAL_MARKETING`, `METHOD_OFFER_DESIGN`, `METHOD_CRO`, `METHOD_ICP`, and `METHOD_FUNNEL`. `METHOD_META_ADS` and `METHOD_WHATSAPP_SALES` remain insufficient. The registry itself was not modified.

- `READY_FOR_ASTRA_03C_METHOD_REMAP = TRUE`.
- `READY_FOR_ASTRA_04_VERTICAL_SLICE_360 = FALSE` because ASTRA-03C remains required and three intended domains remain uncovered.

## Exact next recommended gate

`ASTRA_03C_METHOD_REMAP_AND_METADATA_ADJUDICATION`, under a new explicit authorization. It should remap only evidence-supported methods, retain unsupported placeholders for Meta Ads/WhatsApp sales, and keep ASTRA-04 closed until its own readiness gate.
