# ASTRA-06 — TEST RESULTS

## QA harness — 15/15 scenarios PASS (offline + live)
`node astra/orchestrator_e2e_qa/run_qa.js` (offline, deterministic) and `QA_LIVE=1 … run_qa.js` (live Strategy-F + laser LLM E2E) → both `QA_RESULT pass_all=true`.

| # | scenario | result | evidence |
|---|---|---|---|
| 01 | normal laser clinic | PASS | COMPLETE 9/9, ads=META_ADS, wa=WHATSAPP_SALES, 18 sections, provenance present |
| 02 | normal dental | PASS | COMPLETE 9/9, correct bindings, 18 sections |
| 03 | normal local restaurant | PASS | COMPLETE 9/9, correct bindings, 18 sections |
| 04 | normal infoproduct | PASS | COMPLETE 9/9, correct bindings, 18 sections |
| 05 | normal B2B service | PASS | COMPLETE 9/9, correct bindings, 18 sections |
| 06 | weak/incomplete brief | PASS | WAITING_FOR_INPUT (incomplete_business_information) — no fabrication |
| 07 | missing required evidence | PASS | fail-closed BLOCKED ("missing required evidence for node …") |
| 08 | conflicting method signals | PASS | scorer v2 resolves to specific (M_SPEC) by sub-intent |
| 09 | current-platform request | PASS | CURRENT_RESEARCH_REQUIRED surfaced (4 items), no fact promotion |
| 10 | model/API failure | PASS | fail-closed after retry (provider error propagated) |
| 11 | malformed LLM output | PASS | bounded retry → fail-closed; no malformed text downstream |
| 12 | context budget exceeded | PASS | guardrail caps bundle ≤5/node; no full-KB leakage |
| 13 | missing upstream dependency | PASS | fail-closed at the failing node; downstream not executed |
| 14 | unsupported method attempt | PASS | forced METHOD_VELOCITY rejected (evidence-poor) |
| 15 | repeat consistency | PASS | 3× identical structural decisions/bindings/sections |

Live confirmation: `LIVE_LASER_LLM` — COMPLETE 9/9, 8 LLM calls, correct bindings, 18 sections, current specifics → CURRENT_RESEARCH_REQUIRED.

## Regression (all green, no new regressions)
- ASTRA-05: 24/24 (fixed 2 test inputs that used a now-correctly-WAITING brief; product unchanged).
- ASTRA-04: 20/20 · ASTRA-03E: 23/23 · router-core: 38/39 (obsolete `registry all DISCOVERED` — registry not degraded).

## Narrow fixes applied (test-revealed, safety)
1. `marketing_campaign_360_hardened.js`: unspecified business + no domain signal → WAITING_FOR_INPUT (severity: HIGH robustness gap → fixed; regression = scenario 06).
2. `marketing_campaign_360_hardened.js`: zero retrieved evidence at an evidence-required node → BLOCKED (fail-closed; regression = scenarios 07/13).
3. `workflow_state.js`: allow PLANNED→WAITING_FOR_INPUT/BLOCKED (needed by fix 1; ASTRA-02 valid/invalid-transition tests still pass).
Agent V1 untouched.

## Protection
Frozen Agent V1 shas unchanged; canonical chunks 1454, embeddings 1454, sources 11, legacy kb_chunks 7584, ANN 0, classifier cache records 20. No new ingestion. `AGENT_V1_PROTECTED = TRUE`.
