# ASTRA-03E — TEST RESULTS

## ASTRA-03E deterministic suite — 23/23 PASS
`node astra/tests/astra03e.test.js` → `ASTRA03E_TEST_RESULT pass=23 fail=0`.
Covers: registry schema valid; version `mr-0.4-astra03e`; META_ADS + WHATSAPP_SALES promoted PARTIALLY_MAPPED with valid evidence refs (chunk+source); MODERATE limitations retained (Meta: CAPI/Advantage+/attribution not authoritative; WhatsApp: not provider-independent/current API); confidence conservative (≤0.6); VELOCITY + COURSE_DESIGN stay DISCOVERED (not forced); no universally-best flag; final adjudicator — Velocity/Course never primary, ≥8 distinct primaries, no non-evidence-backed primary, META_ADS & WHATSAPP available for their tasks, COURSE domain has no evidence-backed method; scorer limitation NON_BLOCKING with semantics unchanged; 0 unsupported ASTRA-04 nodes, ads+whatsapp PARTIALLY_SUPPORTED; readiness TRUE with 0 blocking domains; no specialist modules exist.

## Existing ASTRA-02 router-core suite — 38/39 PASS (1 obsolete)
`node astra/tests/run_all.test.js` → `pass=38 fail=1`.
- The single failure is **`registry loads seed (all DISCOVERED)`** — now **OBSOLETE**: it asserted the seed registry where every method was DISCOVERED. The registry has since been legitimately enriched by ASTRA-03/03B/03C/03E (19 PARTIALLY_MAPPED, evidence-backed). Per the ASTRA-03E contract, this test is documented as obsolete and the registry was **not** degraded to satisfy it. A future gate should update/retire this assertion.
- All other router-core tests (schema, intent, DAG, planner, adapter read-only + fail-closed, adjudicator skeleton, model router, workflow state, and the **handoff completeness/operational** checks) PASS.

## Protection (Phase 14)
Agent V1 frozen shas unchanged: knowledge.js `0596f096`, classifier_decision_cache.js `273b40ee`, retrieval_strategy_f.py `cdbbc9b2`, rag_answer_policy_runtime.js `f76d6207`, benchmark `ddb566fd`, rebuilt evidence `02cbd455`. Canonical chunks 1454, sources 11, classifier cache records 20, ANN 0, legacy kb_chunks 7584. `AGENT_V1_PROTECTED = TRUE`.
