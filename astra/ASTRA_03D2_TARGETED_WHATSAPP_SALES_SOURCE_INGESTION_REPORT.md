# ASTRA-03D2 Targeted WhatsApp Sales Source Ingestion

## Result

`ASTRA_03D2_TARGETED_WHATSAPP_SALES_SOURCE_INGESTION = PASS`

The remaining WhatsApp Sales evidence gap was closed to a conservative `MODERATE` level. Two complementary dedicated project sources were admitted, extracted, embedded and inserted additively. Unchanged Strategy-F surfaces them across every representative query. No registry remap, specialist, ASTRA-03E or ASTRA-04 execution occurred.

## Authorization and boundaries

- Authorization: `HUMAN_AUTHORIZATION_ASTRA_03D2_TARGETED_WHATSAPP_SALES_SOURCE_INGESTION_2026-09-06`.
- Pre-gate resolver: `RUN / latest_authorized_task_is_active`.
- Discovery was limited to local/project/user-provided assets and existing project knowledge. No arbitrary web source was ingested.
- Current Supabase documentation/changelog was checked only for safe implementation preflight, not used as corpus doctrine.

## Candidate admission

Six candidates were evaluated: 2 `ADMIT`, 2 `DEFER`, 2 `REJECT`.

Admitted:

1. `SRC_WA_SALES_OS_LEGACY_CURATED` — the 12 active project-curated legacy rows from `21_WHATSAPP_SALES_OS.md`. They cover first response, qualification, diagnosis, price, booking, objections, follow-up, no-show prevention, pipeline states, loss reasons and metrics. The original Markdown is absent locally, so the exact legacy rows, identifiers and content are preserved in a read-only snapshot and the attribution limitation is attached to every derived chunk.
2. `SRC_WA_FUNNELCHAT_WORKSHOP_TRANSCRIPT` — the bounded dedicated workshop section in `transcripciones/Video 20.txt` lines 685-end plus all of `Video 21.txt`. It covers WhatsApp Business/FunnelChat automation, questions, tags, interest/payment stages, reminders, lead recovery, human assignment, CRM use and conversational conversion. ASR, provider attribution, product specificity and possible UI/policy staleness warnings are retained.

Deferred:

- `SRC_WA_BIBLIA_VENDEDOR` — general sales, incomplete upstream derivation and high overlap.
- `SRC_WA_VENTA_ELEGANTE_PODCAST` — general/redundant sales, not WhatsApp-specific.

Rejected:

- `SRC_WA_SYSTEM_PROMPT` — operational instructions are not primary doctrine.
- `SRC_WA_COMBINED_TRANSCRIPT_DUPLICATE` — aggregate duplicates the more precisely bounded Video 20/21 units.

## Extraction, chunks and embeddings

- Source units: 14/14 extracted; 0 blank; 0 explicit garble-marker units.
- Validated chunks: 39 total — 3 from the 12-row curated package and 36 from the workshop.
- Chunk QA: 0 blank, duplicate ID, oversize, undersize or provenance-incomplete chunks.
- Embeddings: 39 new only using `text-embedding-3-small` at 1,536 dimensions; 1 request, 14,357 input tokens, 0 failures.
- Every chunk carries a traceable source/unit/content hash and batch ID `ASTRA03D2-INGEST-20260906-01`.

## Additive ingestion

- `public.kb_chunks_v2`: 1,415 → 1,454.
- Canonical embeddings: 1,415 → 1,454.
- Canonical sources: 9 → 11.
- Inserted: 39; duplicates skipped: 0; failures: 0.
- Legacy `public.kb_chunks`: 7,584 → 7,584.
- ANN: 0 → 0.
- Writes used atomic batches of at most 20 with ignore-duplicate primary-key semantics; no update, merge, overwrite, delete or re-embedding of prior data.

## Strategy-F retrieval and coverage

Ten representative queries covered qualification, diagnosis, appointments, objections, closing, follow-up, recovery, nurture, conversational conversion and CRM/pipeline. The two dedicated sources appeared in 10/10 queries with 40 dedicated hits across 50 top-five positions. Returned provenance passed 10/10.

`WHATSAPP_SALES_COVERAGE = MODERATE`.

The full representative workflow is supported, but `STRONG` is withheld because the compact curated source lacks its original local Markdown/complete authorship and the workshop is ASR-derived, product-specific and potentially stale at the UI/policy layer. Remaining depth gaps include current provider-independent WhatsApp API operations, multi-channel CRM integration, regulated-industry qualification and long-cycle nurture.

## Remap/readiness

- `WHATSAPP_SALES_EVIDENCE_READY_FOR_REMAP = TRUE`.
- `META_ADS_EVIDENCE_READY_FOR_REMAP = TRUE`; the prior artifact remains true and all 35 Meta source rows are preserved inside the protected 1,415-row baseline.
- `READY_FOR_ASTRA_03E_FINAL_REMAP_AND_READINESS = TRUE` because both mandatory evidence domains are ready and Agent V1 protection holds.
- `READY_FOR_ASTRA_04_VERTICAL_SLICE_360 = FALSE`; ASTRA-03E must make the final registry remap/readiness adjudication.

## Agent V1 protection

- All prior 1,415 canonical rows and their exact float32 vector bytes are preserved under a deterministic aggregate fingerprint.
- Strategy-F code/ranking, classifier code/model/prompt/thresholds, cache, benchmark/ground truth, rebuilt evidence, answer policy/model, evaluator and config remain byte-identical.
- Classifier cache remains 20 records with identical aggregate hash.
- Legacy count remains 7,584; ANN remains 0; no specialist executed.

`AGENT_V1_PROTECTED = TRUE`.

## Tests

The ASTRA-03D2 deterministic suite completed `25/25 PASS`, covering candidate schema/scope, admission, dedicated-source requirement, exact 12-row legacy snapshot, extraction, chunk integrity/hashes/provenance/warnings, embedding contract, additive counts, duplicate prevention, 10/10 retrieval visibility, conservative coverage, Meta and WhatsApp remap readiness, ASTRA-03E/04 boundaries, prior-row/vector preservation, protected hashes/cache/legacy/ANN and zero specialist execution.

## Exact next recommended gate

`ASTRA_03E_FINAL_REMAP_AND_READINESS` under a new explicit human authorization. It should remap `METHOD_META_ADS` and `METHOD_WHATSAPP_SALES` conservatively from the preserved evidence and adjudicate final ASTRA-04 readiness. ASTRA-03E and ASTRA-04 were not started here.

