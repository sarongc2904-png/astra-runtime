# ASTRA-05 — SPECIALIST HARDENING — REPORT

- **Authorization:** `HUMAN_AUTHORIZATION_ASTRA_05_SPECIALIST_HARDENING_2026-09-06`
- **Pre-gate:** RUN / this authorization / latest_authorized_task_is_active ✅
- **Scope:** harden the ASTRA-04 specialists + synthesis with controlled, evidence-bounded LLM drafting. No architecture redesign, no new ingestion, no Agent V1 change.

## Result
- **`ASTRA_05_SPECIALIST_HARDENING = PASS`**
- **`LLM_SPECIALISTS_OPERATIONAL = TRUE`** · **`METHOD_SCORING_HARDENED = TRUE`** · **`MULTI_VERTICAL_VALIDATION = PASS`**
- **`EVIDENCE_GROUNDING_VALID = TRUE`** · **`CONTEXT_BUDGET_VALID = TRUE`** · **`COST_TRACKING_VALID = TRUE`** · **`SYNTHESIS_HARDENED = TRUE`**
- **`AGENT_V1_PROTECTED = TRUE`** · **`CODEX_HANDOFF_OPERATIONAL = TRUE`** · **`READY_FOR_ASTRA_06_ORCHESTRATOR_E2E_QA = TRUE`**

## What was built (extends ASTRA-04; no redesign)
- **LLM execution layer** `astra/src/llm/llm_executor.js`: OpenRouter gpt-5-mini, temperature 0, `json_object`, reasoning-disabled + 400 fallback; **strict schema validation**, **bounded retry (budget 1)**, **fail-closed** after budget, usage tracking. Model id config-driven.
- **LLM specialists** `astra/src/specialists/llm_specialists.js`: one generic evidence-bounded runner + per-node specs for the 8 authorized nodes. Every finding/recommendation carries `support_class ∈ {DIRECTLY_SUPPORTED, INFERENCE, ASSUMPTION, CURRENT_RESEARCH_REQUIRED}`; current-platform facts → `CURRENT_RESEARCH_REQUIRED`; brevity constraints prevent truncation.
- **Method scorer v2** `astra/src/router/method_scorer_v2.js`: orchestration-level hardening using primary_jobs/best_for/subdomain/funnel_stage/business_stage/limitations + **sub-intent fit** so specific beats generic; evidence-poor excluded; no universal winner. ASTRA-02 adjudicator left unchanged.
- **Synthesis v2** `astra/src/synthesis/synthesis_engine_v2.js`: reconciles/dedupes, groups recommendations by support_class, surfaces conflicts, preserves methods/evidence/assumptions/limitations/current-research; same 18-section deliverable.
- **Hardened workflow** `astra/src/workflows/marketing_campaign_360_hardened.js` (async; `mode: 'llm'|'deterministic'`). Base ASTRA-04 `marketing_campaign_360.js` untouched (regression-safe baseline for comparison).

## Core execution rule honored
LLM interprets/synthesizes/drafts **within evidence**; it does not invent doctrine, current platform facts, benchmarks, or provider/API behavior, and does not hide uncertainty. Verified: `fabrication_risk = 0` across both LLM E2E runs; current-platform items routed to CURRENT_RESEARCH_REQUIRED.

## Model routing & cost (`model_routing_validation.json`, `cost_tracking_validation.json`)
Tiers routed per node via MODEL_ROUTER (SPECIALIST_EXECUTION; STRATEGIC_SYNTHESIS for creative+synthesis; DETERMINISTIC_TRANSFORM for DAG/state/schema). No single expensive model hardcoded; model ids config-driven (single available provider currently resolves to gpt-5-mini). Tracked per workflow/specialist: mode, model_calls, retries, by_tier, tokens (prompt/completion), evidence_chars, per-node tier/generation. Laser LLM: 8 calls, ~21k completion tokens. Monetary cost not invented.

## Method scoring hardening (`method_scoring_validation.json`)
`specific_beats_generic = TRUE` (unit-verified); no universal winner; evidence-poor excluded; forced bindings preserved (ads→METHOD_META_ADS, whatsapp→METHOD_WHATSAPP_SALES). Laser selected: market_context→GROWTH_MARKETING, icp→ICP, offer→OFFER_DESIGN, funnel→FUNNEL (Velocity excluded), creative_strategy→CREATIVE_STRATEGY, measurement→CRO. No Velocity/Course selected.

## Evidence grounding & context (`evidence_grounding_validation.json`, `context_budget_validation.json`)
All findings carry support_class; provenance preserved (evidence_used chunk ids per node); READ_MINIMUM_NECESSARY_CONTEXT — ≤5 evidence chunks/node, no full-KB leakage. Evidence classes kept separate (INTERNAL_KNOWLEDGE vs INFERENCE; USER_PROVIDED_FACTS requested; EXTERNAL_RESEARCH none, flagged via current-research).

## Multi-vertical (`scenario_results.json`)
5 scenarios all COMPLETE 9/9 with correct bindings: laser (LLM), infoproduct (LLM), dental/restaurant/B2B (deterministic). Not overfit to laser.

## Deterministic vs LLM (`deterministic_vs_llm_comparison.json`)
Machine-readable per-node metrics: `llm_materially_improved = TRUE` (LLM more specific on 7/8, higher business-term hits), method-aligned on all 8, **0 fabrication either side**. Synthesis materially richer while remaining evidence-bounded.

## Synthesis hardening (`synthesis_validation.json`)
v2 reconciles rather than concatenates; 18-section contract retained; coherent; current-research + limitations preserved.

## Fail-closed (verified)
Missing evidence bundle / unavailable mandatory binding / schema violation after retry / synthesis missing sections → workflow transitions FAILED/BLOCKED and throws; no fabrication. The initial run's JSON-truncation fail-closed (reasoning-budget) was fixed by raising the ASTRA LLM budget to 16000 + brevity (no Agent V1 change).

## Protection (`protection_validation.json`)
0 mutations to knowledge.js/classifier/cache/Strategy-F/corpus/embeddings/benchmark/rebuilt-evidence/answer-policy/evaluator/Supabase/ANN. Frozen shas unchanged; chunks 1454, embeddings 1454, sources 11, legacy 7584, ANN 0, cache 20. No new ingestion.

## Known limitations
- Single LLM provider (gpt-5-mini) currently backs all tiers; per-tier model ids are configurable for future differentiation.
- Meta Ads & WhatsApp remain MODERATE coverage; current-platform specifics are surfaced as CURRENT_RESEARCH_REQUIRED, not answered.
- Concrete numbers (price, benchmarks, demographics) require USER_PROVIDED_FACTS / current research.
- One obsolete router-core test (registry-all-DISCOVERED).

## Exact next gate
**ASTRA-06_ORCHESTRATOR_E2E_QA** (separate authorization) — end-to-end QA of the orchestrator across scenarios/quality/robustness. Do NOT begin automatically.
