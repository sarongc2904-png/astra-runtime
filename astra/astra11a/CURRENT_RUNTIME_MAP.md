# CURRENT_RUNTIME_MAP — ASTRA-11A

Read-only audit of what runs today, how it executes (deterministic / LLM / hybrid), and
what is frozen. **No file was modified to produce this map.** Sources: direct inspection
of the working tree at commit `ebfb777` + untracked working files, `CLAUDE_TASK.md`
authorization ledger, `astra/CLAUDE_CODE_CODEX_HANDOFF_PROTOCOL.md`,
`astra/benchmarks/astra10ah/freeze.json`.

## 0. Two runtime stacks

| Stack | Root | Entry points | Role | Freeze status |
|---|---|---|---|---|
| **Agent V1 RAG runtime** | `agente_ia/` (repo root files) | `chat.js`, `app/server.js` (`:3081`) | grounded Q&A over course/book corpora | **FROZEN** (knowledge/retrieval/classifier/answer-policy/model) |
| **ASTRA Orchestrator** | `agente_ia/astra/src/` | `astra/run_gpt_api.js` → `/astra/campaign-360`, `/astra/creative-director`, `/astra/creative-generation`; Supabase gateway forwards these | multi-node marketing campaign planning above Agent V1 | partially frozen (benchmark harness, Agent V1 adapter contract, canonical model); orchestration layer is the active build surface |

ASTRA never calls Agent V1 except through `astra/src/adapter/agent_v1_adapter.js`
(read-only allow-list: `loadConfig`, `groundedRetrieve`, `classifyEvidenceSufficiency`;
fails closed if `corpus !== kb_chunks_v2` or `pipeline !== Strategy-F`).

## 1. Execution-mode legend

- **DET** — pure deterministic code. Same input → same output. No model call.
- **LLM** — a model call is on the critical path; output is generative / non-deterministic at cold start.
- **HYB** — LLM proposes, deterministic code bounds/validates/caches/gates the result (or a deterministic cache makes an LLM step *operationally* deterministic).

## 2. Inventory (the 13 audited capabilities)

### 2.1 classifier — evidence-sufficiency router
| | |
|---|---|
| Files | `knowledge.js` `classifyEvidenceSufficiency` / `classifyEvidenceSufficiencyUncached` (L383–474); `classifier_decision_cache.js` |
| Mode | **HYB** — frozen LLM classifier (`CLASSIFIER_SYSTEM_PROMPT`, `temperature:0`, `json_object`, reasoning-disabled-then-400-fallback) wrapped by a content-addressed persistent decision cache |
| Determinism | *Operational* only: `decision_key = sha256(canonical{classifier_version=clf-impl-1, prompt_version, model, model_config_version=mc-1, schema_version=sfx-1, query(NFC/LF), evidence_hash})`. HIT → 0 LLM calls, exact replay. MISS → classify once, atomic `wx` singular-winner write, reread canonical. Cold-start output "may be intrinsically nondeterministic". |
| Fail mode | Fail-closed on corrupt/incomplete/integrity-mismatch record (treated as absent, re-materialize); `CACHE_BYPASS` (flagged, never stale) if store unwritable; API failure propagates |
| Output | `{decision ∈ SUFFICIENT|FULL|PARTIAL|INSUFFICIENT|AMBIGUOUS, hasSupportedMaterial, specificLimitation, reason, cache:{...}}` |
| Freeze | **FROZEN** — semantics, prompt, version tags, cache contract |

### 2.2 askLLM — grounded answer generation
| | |
|---|---|
| Files | `knowledge.js` `askLLM` (L318–355) |
| Mode | **LLM** — `openai/gpt-5-mini` (canonical, CLI rejects alternates), `temperature:0.7`, `max_tokens` 3000 / 5000 (guarded), reasoning-disabled-then-400-fallback |
| Post-processing | If C3/Marketing-OS system active → `c3.guardGeneratedOutput` (DET claim scrub → `POR_VALIDAR`/`POR_DEFINIR`) |
| Freeze | **FROZEN** — answer model + generation contract |

### 2.3 retrieval
| Layer | File | Mode | Notes |
|---|---|---|---|
| Local keyword retrieval | `knowledge.js` `tokenize` + `retrieve` (L43–224) | **DET** | keyword scoring over local `.txt`/`CONOCIMIENTO/*.md`; `maxTotal` char budget |
| Canonical Strategy-F | `retrieval_strategy_f.py` + `knowledge.js` `retrieveStrategyF`/`groundedRetrieve` (L523–546) | **DET ranking + LLM embed** | cosine top20 + BM25(k1=1.2,b=0.75) top20 → RRF(k=60) → deterministic rerank (0.80·normRRF + 0.15·IDF-coverage + 0.05·bigram) → top5 over frozen `rag_retrieval_refinement/corpus_snapshot.json`. Query embedding = `text-embedding-3-small` 1536-dim (fixed model, network call). Reads only. |
| C3 book retrieval | `c3.js` (Supabase `kb_chunks` via embeddings) | **DET ranking + LLM embed** | verified book attribution; does not call the answer LLM |
| ASTRA async retrieval | `astra/src/adapter/agent_v1_adapter.js` `retrieveAsync` (`[ASTRA-10X]`) | **DET** | byte-for-byte the same Python invocation as `retrieveStrategyF`, `execFile` (non-blocking) instead of `execFileSync`; fresh isolated OS process |
| Transport (subprocess) | `execFileSync`/`execFile` python, `maxBuffer 96MB`, `timeout 120000ms`, python resolution `STRATEGY_F_PYTHON → PYTHON → 'python'` | DET | |
| Freeze | **FROZEN** — Strategy-F algorithm, corpus snapshot, embeddings model, `kb_chunks_v2` |

### 2.4 nodes (campaign-360 execution graph)
| | |
|---|---|
| Files | `astra/src/workflows/marketing_campaign_360.js` (base `NODES`/`DEPS`, sync), `marketing_campaign_360_hardened.js` (async, parallel `WAVES = computeWaves(NODES, DEPS)`) |
| 8 nodes | `market_context → icp → offer → funnel → creative_strategy → ads → whatsapp_conversion → measurement` + `final_synthesis` |
| Mode | **DET control plane** (wave scheduling, dependency gates, `WAITING_FOR_INPUT` guard on incomplete business info, evidence-required `BLOCKED` gate, `no evidence-backed method → BLOCKED`, cost/context tracking); node body is DET or LLM per `mode` |
| `mode:'deterministic'` | node body = `astra/src/specialists/specialists.js` (**DET**, no generation, evidence-cited findings, method-derived INFERENCE recommendations) |
| `mode:'llm'` | node body = `astra/src/specialists/llm_specialists.js` `runLLMSpecialist` (**LLM**, evidence-bounded strict-JSON) via `llm_executor.js` (`temp 0`, `json_object`, `RETRY_BUDGET=1`, reasoning fallback, **fail-closed**) |
| Synthesis | `synthesis_engine_v2.js` (**DET** reconciliation → 18 sections, `not_a_concatenation`, surfaces conflicts, no extra LLM call) |

### 2.5 market_context (node)
| | |
|---|---|
| DET path | `specialists.market_context` — frames positioning from evidence count + method; assumptions marked INFERENCE |
| LLM path | `llm_specialists` `MARKET_CONTEXT_SPECIALIST`, fields `problem_context, market_assumptions, constraints` |
| Retrieval | `knowledge_query_planner` targeted queries → Agent V1 top5 |
| Note | This is the node ASTRA-11's "market research / competitors / VoC" work would most expand |

### 2.6 measurement (node)
| | |
|---|---|
| DET path | `specialists.measurement_cro` — KPIs defined, target values `POR DEFINIR` (never invents benchmark numbers) |
| LLM path | `llm_specialists` `MEASUREMENT_CRO_SPECIALIST`, fields `primary_outcome, leading_indicators, funnel_metrics, conversion_metrics, diagnostic_metrics, optimization_triggers, measurement_cadence` |
| Benchmark status | one of the 2 nodes in the frozen ASTRA-10 benchmark; ASTRA-10AX result: not wave-dominated → latency reduction directly useful *if* the quality gate passed (it did **not**) |

### 2.7 creative_strategy (node)
| | |
|---|---|
| DET path | `specialists.creative_strategy` — angles/hooks from SMP; concrete claims need USER_PROVIDED_FACTS |
| LLM path | `llm_specialists` `CREATIVE_STRATEGY_SPECIALIST`, fields `core_idea, single_minded_proposition, angles, creative_territories, hooks, proof, objection_coverage` |
| Benchmark status | 2nd benchmark node; **dominated by `funnel` in production W4** (ASTRA-10AG) → its latency win must **not** be projected onto total production latency |
| ASTRA-10AX defect | `restaurant__creative_strategy__openai_gpt_4_1_mini` emitted 3 `DIRECTLY_SUPPORTED` findings citing input-section names → confirmed model evidence-discipline defect → **QUALITY_GATE = FAIL** |

### 2.8 grounding / provenance
| | |
|---|---|
| Files | `knowledge.js` `buildGroundingEvidence` / `buildStrategyFEvidence`; `agent_v1_adapter._shapeResult` (`evidence_id 'E'+n`, `source_class:'INTERNAL_KNOWLEDGE'`, cosine, chunk_id, page refs); `base_specialist.findingsFromEvidence` |
| Mode | **DET** |
| Provenance model | every fact carries `source_class ∈ {INTERNAL_KNOWLEDGE, EXTERNAL_RESEARCH, USER_PROVIDED_FACTS, INFERENCE}` + evidence refs (`chunk_id` + `source_pdf_name` + `pdf_page_refs`). Synthesis must preserve `source_class`; never launders INFERENCE → INTERNAL_KNOWLEDGE. Truncation drops body text before citations (`CONTEXT_POLICY.md`). |
| Evaluator | `astra/benchmarks/astra10ah/quality_checks.js` (**FROZEN, benchmark-only**) — `invalid_evidence_refs`, `hallucinated_facts` (DIRECTLY_SUPPORTED + null ref), `evidence_ref_forensics[]` (ASTRA-10AW). Known evaluator over-strictness: applies the DIRECTLY_SUPPORTED-only "E#/chunk" rule to every support class. |

### 2.9 answer policy
| | |
|---|---|
| Files | `rag_answer_policy_runtime.js` + `.py` (`enforceSufficiencyOutput` / `enforce_sufficiency_output`); wired in `knowledge.js` `answerGrounded` (L487–513) |
| Mode | **DET** — pure output guard. FULL/SUFFICIENT/AMBIGUOUS → pass through; INSUFFICIENT → canonical abstention (`generationBypassed`); PARTIAL + no supported material → INSUFFICIENT; PARTIAL + supported → strip global abstention, append caller's evidence-specific limitation, assert no global abstention remains |
| Canonical abstention | `en` / `es` frozen strings; language via `detectLanguage` (DET regex) |
| Freeze | **FROZEN** — separation of PARTIAL vs INSUFFICIENT is the whole contract |

### 2.10 diagnostics
| | |
|---|---|
| Files | `astra/src/integration/diag.js` (`[ASTRA-DIAG]` timing checkpoints, ASTRA-10S, "remove after diagnosis"); `astra/benchmarks/astra10ah/env_diagnostics.js`, `error_capture.js` (benchmark-only) |
| Mode | **DET** — timing only; explicitly never logs keys/headers/bodies |
| Note | No structured production telemetry sink; `diag` writes to `console.log` and is meant to be removed |

### 2.11 cost / token tracking
| | |
|---|---|
| Normalizer | `astra/src/llm/usage_normalizer.js` — **DET**, never invents a field the provider didn't send (only authorized derivation: `total = prompt + completion` when total absent + both present) |
| Benchmark ledger | `astra/benchmarks/astra10ah/transport.js` `PhysicalRequestLedger` (**FROZEN, benchmark-only**) — hard `maxRequests` / `maxCostUsd` ceilings, pre-call + post-call gates, `AuthFailureError` kill-switch on 401/403, `[ASTRA-10AX]` `initialCount`/`initialCostUsd` resume seeding, checkpoint via `checkpoint.js` |
| Pricing | `astra/benchmarks/astra10ah/pricing.js` (**FROZEN, benchmark-only**) — documented OpenRouter USD/1M-token rates, estimate only |
| Workflow cost | `marketing_campaign_360_hardened.js` `cost` object (per-run) |
| Context budgets | `astra/config/context_budgets.js` — `MAX_EVIDENCE_PER_STEP`, `SYNTHESIS_WORKING_CHARS`, `METHOD_METADATA_CHARS`, `DEFAULT_TOP_K` |
| Gap | **no unified production cost/token ledger** outside the benchmark; no per-tenant / per-workflow persistent accounting |

### 2.12 benchmark harness
| | |
|---|---|
| Dir | `astra/benchmarks/astra10ah/` |
| Freeze | **FROZEN & hash-gated** — `freeze.json`: `harness_hash_files = [fixtures.js, mock_transport.js, pricing.js, quality_checks.js, run_benchmark.js, transport.js]`, `harness_hash_sha256`, `fixture_hash_sha256`, `manifest_hash_sha256`. Each paid gate MUST recompute and refuse on drift. `execution_freeze.json` carries the per-authorization hash lineage (10AI → 10AJ → 10AK → … → 10AX). |
| Matrix | 3 verticals × 2 nodes × 2 models = 12 logical cases |
| Latest result | **ASTRA-10AX**: `QUALITY_GATE = FAIL`, `BENCHMARK_WINNER = NOT_DECLARED`, 3 confirmed model defects (one `gpt-4.1-mini` creative_strategy case), 1 evaluator-defect class. Canonical-12 real cost ≈ $0.046806. `READY_FOR_PRODUCTION_ROUTING = FALSE`. Artifacts: `results/adjudication_10ax_final/`. |
| ASTRA-11A rule | **do not touch** — no reruns, no evaluator change, no matrix change |

### 2.13 method selection (context for the adjudicator layer)
| Layer | File | Mode |
|---|---|---|
| Intent → brief | `astra/src/router/intent_analyzer.js` | **DET** (`model_router`: `INTENT_ANALYSIS → DETERMINISTIC_TRANSFORM`, `uses_llm:false`) |
| Decompose → DAG | `astra/src/router/task_decomposer.js` | **DET** (topo sort, deterministic step ids, cycle/unknown-dep rejection) |
| Query plan | `astra/src/router/knowledge_query_planner.js` | **DET** (≤2 queries/step, ≤5 evidence, bounded) |
| Method registry | `astra/src/methods/registry_loader.js` + data | **DET** (metadata catalog, `mapping_status`) |
| Adjudicator | `astra/src/router/method_adjudicator.js` + `method_scorer_v2.js` | **DET** — weighted multi-dimension score (`evidence_strength` weight < 0.5; `sub_intent_fit 0.22`…), conflict detection, `INSUFFICIENT_EVIDENCE` gate, hybrid-allowed flag. **Never retrieval-score-only; never averages conflicts.** |
| Model router | `astra/src/model_router/model_router.js` | **DET** (task_type → class → plan; no hardcoded model ids) |
| Workflow state | `astra/src/state/workflow_state.js` | **DET** (state machine, additive decisions/assumptions) |

## 3. Frozen / protected components (consolidated — do NOT modify in ASTRA-11)

From `CLAUDE_CODE_CODEX_HANDOFF_PROTOCOL.md` prohibitions + `freeze.json` + every gate's Stop clause:

1. Agent V1 runtime: `knowledge.js` retrieval + classifier + answer-policy + model selection
2. Strategy-F: `retrieval_strategy_f.py`, ranking algorithm, `rag_retrieval_refinement/corpus_snapshot.json`, `query_vectors.npy`
3. Classifier + decision cache: prompt, version tags (`clf-impl-1`/`mc-1`/`sfx-1`), `classifier_decision_cache.js` semantics
4. Answer policy / evaluator: `rag_answer_policy_runtime.{js,py}`, `astra/benchmarks/astra10ah/quality_checks.js`
5. Corpus / embeddings / Supabase: `kb_chunks`, `kb_chunks_v2`, `text-embedding-3-small` (1536-dim), `supabase/functions/search-kb`, migrations
6. Benchmark: entire `astra/benchmarks/astra10ah/` tree (hash-gated)
7. Canonical answer model: `openai/gpt-5-mini` (`config.json` `loadConfig` overrides stale values; CLI rejects alternates)
8. ASTRA-10 deployment freeze: `render_freeze_*/`, digest-pinned Docker bases, `render.yaml`, `astra-runtime/` image contents
9. Agent V1 adapter contract: `corpus=kb_chunks_v2` / `pipeline=Strategy-F` fail-closed check

Additional prohibitions carried by every handoff: do not implement specialists before their gate; do not hardcode a method as universally best; do not let retrieval scores alone select frameworks; do not merge conflicting methods silently.

## 4. Current gate state

- Latest authorization in `CLAUDE_TASK.md`: **`HUMAN_AUTHORIZATION_ASTRA_10AX_TARGETED_EVIDENCE_REF_RERUN_2026-09-09`** — executed, closed. Result: `QUALITY_GATE = FAIL`.
- `astra/CURRENT_TASK.md`: ASTRA-10R **BLOCKED** on an external Render credential / Git deploy source (not a code problem).
- **No ASTRA-11 authorization exists.** Every gate ends `READY_FOR_PRODUCTION_ROUTING = FALSE`. `READY_FOR_SECONDARY_NODE_BENCHMARK = NO`.
- Therefore ASTRA-11 may be **designed** (11A) but not implemented, and no production model-routing decision may be taken, until: (a) a human ASTRA-11 authorization is issued, and (b) the ASTRA-10 benchmark quality gate is resolved to PASS (or explicitly waived by the human).
