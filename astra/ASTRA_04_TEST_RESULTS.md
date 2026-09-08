# ASTRA-04 — TEST RESULTS

## ASTRA-04 offline suite — 20/20 PASS
`node astra/tests/astra04.test.js` → `ASTRA04_TEST_RESULT pass=20 fail=0` (mock adapter, no live API, no LLM).
Covers: workflow completes (COMPLETE); 9 mandatory nodes; canonical node order; **ads→METHOD_META_ADS**, **whatsapp_conversion→METHOD_WHATSAPP_SALES** (forced, flagged); bounded evidence ≤5/node; provenance preserved (evidence_used chunk ids, source_class); no full-KB leakage; Meta & WhatsApp limitation + CURRENT_RESEARCH_REQUIRED present; current-research surfaced in synthesis; state PLANNED→RUNNING→COMPLETE; synthesis 18 sections coherent + not concatenation; required deliverable sections populated; no unsupported method winner (no Velocity/Course primary); all primaries evidence-backed; 0 LLM generation; specialist input/output contract enforced; **fail-closed when a forced binding is evidence-poor**.

## End-to-end acceptance — PASS (live Strategy-F)
`node astra/vertical_slice_360/run_acceptance.js`, input: *"Create a client acquisition campaign for a laser hair removal clinic."*
Result: `status=COMPLETE, nodes=9/9, ads=METHOD_META_ADS, whatsapp=METHOD_WHATSAPP_SALES, sections=18, llm_calls=0`. 36 unique evidence chunks retrieved live (bounded top5/node) with provenance. Deliverable carries all 18 sections including Meta/WhatsApp limitations and CURRENT_RESEARCH_REQUIRED items.

## Other ASTRA suites (regression)
- ASTRA-03E suite: 23/23 PASS.
- Router-core suite: 38/39 (1 obsolete `registry all DISCOVERED` test — registry legitimately enriched; not degraded).

## Protection
Agent V1 frozen shas unchanged (knowledge.js `0596f096`, cache `273b40ee`, retrieval `cdbbc9b2`, policy `f76d6207`, benchmark `ddb566fd`, evidence `02cbd455`); canonical chunks 1454, embeddings 1454, sources 11, legacy kb_chunks 7584, ANN 0, classifier cache records 20. `AGENT_V1_PROTECTED = TRUE`.
