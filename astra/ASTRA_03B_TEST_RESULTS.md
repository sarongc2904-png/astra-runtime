# ASTRA-03B — Test results

**PASS: 23/23 deterministic checks; 0 failures.**

Validated:

- Candidate schema completeness (12/12) and admission counts (7 ADMIT, 4 DEFER, 1 REJECT).
- High-redundancy source handling: no HIGH-redundancy candidate was admitted.
- Extraction QA: 64/64 units, zero blanks, warnings preserved.
- Chunk QA: 617 unique content hashes/IDs, valid sizes/content hashes, complete provenance.
- Embeddings: canonical model, `(617, 1536)` shape, finite/non-zero vectors.
- Additive counts and batch traceability: 763 + 617 = 1,380; 617/617 batch rows visible.
- Strategy-F visibility: 10/10 queries used unchanged `Strategy-F` over `kb_chunks_v2` with 1,380 rows and complete provenance.
- Coverage: seven newly supported domains return 4–5 subject hits in top-5; Meta Ads, WhatsApp sales and course creation remain honestly `NONE`.
- Protected runtime/policy files byte-identical; classifier cache unchanged (20 → 20).
- Existing canonical chunks/vectors preserved 763/763; legacy table 7,584; ANN 0.
- No specialist execution.

Machine-readable evidence: `astra/knowledge_ingestion/test_results.json` and the phase-specific JSON artifacts.
