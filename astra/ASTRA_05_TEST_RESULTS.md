# ASTRA-05 — TEST RESULTS

## ASTRA-05 offline suite — 24/24 PASS
`node astra/tests/astra05.test.js` → `ASTRA05_TEST_RESULT pass=24 fail=0` (mock LLM + mock adapter).
Covers: LLM executor schema validation; **fail-closed after bounded retry budget**; bounded-retry-then-success; hardened workflow completes (LLM mode); 9 nodes + order; **ads→METHOD_META_ADS**, **whatsapp→METHOD_WHATSAPP_SALES** enforced; LLM specialists operational (generation=LLM); evidence grounding (support_class); provenance (evidence_used); bounded context ≤5/node; CURRENT_RESEARCH_REQUIRED for meta+whatsapp + surfaced in synthesis; synthesis v2 coherent 18-section reconciled; cost/context tracking; no Velocity/Course winner; **scorer v2 specific-beats-generic**; evidence-poor excluded; no universal winner; multi-vertical completes (dental/restaurant/infoproduct); missing-evidence fail-closed; LLM fail-closed propagates.

## Live scenarios — 5/5 COMPLETE
`node astra/specialist_hardening/run_scenarios.js` (live Strategy-F retrieval; LLM = openai/gpt-5-mini):
| scenario | mode | status | nodes | ads | whatsapp | LLM calls |
|---|---|---|---|---|---|---|
| laser hair removal clinic | llm | COMPLETE | 9/9 | METHOD_META_ADS | METHOD_WHATSAPP_SALES | 8 |
| digital infoproduct | llm | COMPLETE | 9/9 | METHOD_META_ADS | METHOD_WHATSAPP_SALES | 8 |
| dental clinic | deterministic | COMPLETE | 9/9 | METHOD_META_ADS | METHOD_WHATSAPP_SALES | 0 |
| local restaurant | deterministic | COMPLETE | 9/9 | METHOD_META_ADS | METHOD_WHATSAPP_SALES | 0 |
| B2B marketing service | deterministic | COMPLETE | 9/9 | METHOD_META_ADS | METHOD_WHATSAPP_SALES | 0 |

Both required full LLM E2E (laser + infoproduct) completed. The 3 deterministic verticals prove ASTRA is not overfit to laser clinics (different briefs, same correct pipeline/bindings).

## Deterministic vs LLM comparison — LLM materially improved, 0 fabrication
`deterministic_vs_llm_comparison.json`: `llm_materially_improved = TRUE`; LLM more specific on 7/8 nodes (higher recommendation/finding counts + business-term hits); method-aligned on all 8; **fabrication_risk = 0 for both** deterministic and LLM. Current-platform specifics correctly routed to CURRENT_RESEARCH_REQUIRED (e.g., competitor pricing, regulatory, demand, CAPI/Advantage+/attribution, WhatsApp API) — never fabricated.

## Regression
ASTRA-04 20/20, ASTRA-03E 23/23, router-core 38/39 (1 obsolete `registry all DISCOVERED`). No regressions from ASTRA-05.

## Protection
Agent V1 frozen shas unchanged; canonical chunks 1454, embeddings 1454, sources 11, legacy kb_chunks 7584, ANN 0, classifier cache records 20. No new ingestion. `AGENT_V1_PROTECTED = TRUE`.

## Note on the initial LLM run (honest record)
The first LLM E2E fail-closed (JSON truncation) because gpt-5-mini's mandatory reasoning consumed the 4000-token output budget before the larger specialist JSON finished — the same reasoning-budget pattern as Agent V1's DEFECT-002. The fail-closed behavior worked correctly (no malformed text entered downstream). Fixed within the ASTRA LLM layer by raising the specialist output budget to 16000 tokens and adding brevity constraints to the prompt (no Agent V1 change). Re-run: both LLM E2E COMPLETE.
