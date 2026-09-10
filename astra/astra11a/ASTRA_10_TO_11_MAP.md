# ASTRA_10_TO_11_MAP — ASTRA-11A

What ASTRA-01…10 already delivers, mapped against the 22 capability areas ASTRA-11
("Commercial Intelligence Operating System") targets. Design analysis only.

## A. What ASTRA-10 leaves in place (the inheritance)

| Asset | State | ASTRA-11 uses it as |
|---|---|---|
| Agent V1 grounded RAG (`knowledge.js` + Strategy-F + classifier + answer policy) | frozen, working | the **internal-knowledge evidence source** — one of several ASTRA-11 evidence classes, never the only one |
| `AgentV1Adapter` (read-only, fail-closed) | frozen contract | the **only** legal path from ASTRA-11 to Agent V1 |
| Router core: intent → brief → DAG → query plan | built (ASTRA-02) | reused; ASTRA-11 intents are a superset |
| Method registry + adjudicator + `method_scorer_v2` | built (ASTRA-03/05) | reused; ASTRA-11 adds commercial-analysis methods (JTBD, sophistication ladder, positioning frames) as new registry entries |
| Model router (task_class map) | built (ASTRA-02) | reused; ASTRA-11 adds task types for the new analysis nodes |
| Workflow state machine + handoff protocol | built (ASTRA-02) | reused as the ASTRA-11 orchestration substrate; needs a durable store (see §C) |
| `marketing_campaign_360` + `_hardened` (8 nodes, waves, gates) | built (ASTRA-04…06) | the **template** for the ASTRA-11 node graph; ASTRA-11 adds ~14 upstream analysis nodes feeding the existing 8 |
| LLM specialist contract (`llm_specialists.js` + `llm_executor.js`, evidence-bounded strict-JSON, fail-closed, retry budget 1) | built (ASTRA-05), **benchmark-blocked** | the pattern for every ASTRA-11 LLM node; **quality gate must pass first** |
| Deterministic thin specialists (`specialists.js`) | built (ASTRA-04) | the deterministic fallback / comparison baseline per node |
| Synthesis engine v2 (18-section, reconciliation, not concatenation) | built (ASTRA-05) | reused; ASTRA-11 output schema is larger (see UCDM) |
| Provenance model (`source_class` on every fact) | built, threaded | **mandatory** for ASTRA-11 — more evidence classes → more need for it |
| Creative Director + Creative Generation | built (ASTRA-08B/08C) | ASTRA-11 "positioning → offer → creative" hands off here unchanged |
| Integration layer (`astra_api_handler`, `runtime_auth`, `openapi_builder`, `gpt_supabase_adapter`) | built (ASTRA-09/10) | ASTRA-11 adds routes, not a new server |
| Runtime host packaging (Docker, `render.yaml`, `astra-runtime/`) | built (ASTRA-10R), **deploy-blocked externally** | ASTRA-11 ships inside the same image |
| Benchmark harness (12-case, hash-gated, ceilings, forensics) | frozen | ASTRA-11 **secondary-node benchmark** extends the *pattern* in a new dir under a new authorization; the 10ah tree is untouched |
| Cost: `usage_normalizer` + benchmark `PhysicalRequestLedger` + `context_budgets` | built (benchmark-scoped) | ASTRA-11 needs a **production** ledger — genuine gap (see §C) |

## B. The 22 ASTRA-11 areas vs current capability

Legend: **HAVE** (usable as-is) · **PARTIAL** (a node/primitive exists, needs extension) · **GAP** (no runtime primitive).

| # | ASTRA-11 area | Closest current capability | Status | Notes |
|---|---|---|---|---|
| 1 | market research | `market_context` node + Agent V1 retrieval | PARTIAL | today: internal-corpus framing only; needs external-research evidence class + structured `MarketProfile` |
| 2 | competitors | none (mentioned in `RESEARCH_ENGINE_SPEC` design, not built) | GAP | needs `CompetitorProfile` entity + evidence ingestion; no scraping in-runtime |
| 3 | Voice of Customer | none | GAP | LLM theme-extraction over user-supplied reviews/transcripts → structured `VoCTheme[]` with quote provenance |
| 4 | buyer persona | `icp` node (thin) | PARTIAL | today: dimension list + "needs USER_PROVIDED_FACTS"; needs `Persona` entity, narrative + structured fields |
| 5 | ICP | `icp` node | PARTIAL | ICP = firmographic/qualification filter; split from Persona in the UCDM |
| 6 | segmentation | none | GAP | deterministic: partition a customer set by rules/attributes; hybrid: LLM proposes segment axes |
| 7 | customer journey | `funnel` node (stages) + `whatsapp_conversion` | PARTIAL | funnel ≠ journey; needs a `JourneyStage` state machine (awareness→advocacy) |
| 8 | Jobs To Be Done | none (method could be a registry entry) | GAP | LLM articulates jobs from VoC/persona evidence → `Job[]` (functional/emotional/social) |
| 9 | awareness (Schwartz) | none | GAP | LLM classifies audience awareness level from copy/context; deterministic ladder enum |
| 10 | market sophistication | none | GAP | same shape as awareness; 5-stage enum |
| 11 | positioning | `market_context` assumptions + `brand` mode in `marketing_os` | PARTIAL | needs `PositioningStatement` entity (frame, alternative, differentiator, proof) |
| 12 | offer | `offer` node + `marketing_os` OFFER mode + `INGENIERIA_DE_OFERTAS` | PARTIAL | node exists; needs `Offer` entity with value-stack / risk-reversal / price-framing structure |
| 13 | acquisition | `ads` node + `meta_ads` specialist + `marketing_os` META_ADS | HAVE (channel-scoped) | Meta-centric; ASTRA-11 keeps channel plug-ins |
| 14 | funnel | `funnel` node | HAVE | reused as-is |
| 15 | CRM | none (WhatsApp flow logic only) | GAP | ASTRA-11 models CRM *state* (contact, stage, activity), not a CRM integration |
| 16 | sales | `whatsapp_conversion` node + `marketing_os` SALES | HAVE (channel-scoped) | |
| 17 | retention | none | GAP | deterministic cohort/retention math + LLM diagnosis |
| 18 | upsell | none | GAP | LLM proposes upsell paths from offer + journey; deterministic eligibility rules |
| 19 | revenue | none | GAP | **fully deterministic** — MRR/ARR/expansion/churn rollups from supplied transactions |
| 20 | bottlenecks | `measurement` node optimization_triggers (thin) | PARTIAL | deterministic: compute stage conversion deltas vs targets; hybrid: LLM hypothesises cause |
| 21 | experimentation | none | GAP | deterministic assignment + significance math; LLM proposes hypotheses |
| 22 | business memory | `classifier_decision_cache.js` (pattern only), workflow state | GAP | needs a durable, provenance-tagged, versioned commercial-fact store (the UCDM persistence layer) |

Count: **HAVE 3, PARTIAL 8, GAP 11.**

## C. Cross-cutting gaps ASTRA-11 must close (not domain-specific)

| Gap | Why ASTRA-10 didn't need it | ASTRA-11 requirement |
|---|---|---|
| **Durable commercial-fact store** | campaign-360 is a single stateless request | UCDM persistence: entities keyed by content hash, append-only versions, `source_class` per field, tenant scoping |
| **External-research evidence class** | benchmark deliberately excludes it (internal-only) | `EXTERNAL_RESEARCH` source_class, user-supplied only (no in-runtime scraping), never silently merged with `INTERNAL_KNOWLEDGE` |
| **Production cost/token ledger** | ceilings only mattered for the paid benchmark | per-workflow + per-tenant persistent accounting; `usage_normalizer` is the input, needs a sink |
| **Numeric/analytics runtime** | no node does revenue/cohort math today | deterministic module: revenue rollups, funnel conversion, CAC/LTV, retention curves, experiment stats — **no LLM on any number** |
| **Structured production telemetry** | `diag.js` is a temporary console tracer | a real telemetry contract (still: no secrets, no bodies) |
| **Journey/CRM state machine** | funnel is a static list | stateful contact/stage/activity model |

## D. Ordering constraints ASTRA-11 inherits

1. **Benchmark gate first.** ASTRA-10AX = `QUALITY_GATE FAIL`. No ASTRA-11 LLM node may be promoted to a routing decision until the LLM-specialist quality gate is PASS (or human-waived). ASTRA-11A design proceeds regardless; ASTRA-11B+ implementation of LLM nodes waits.
2. **`READY_FOR_PRODUCTION_ROUTING = FALSE`** is asserted by every gate to date — ASTRA-11 cannot flip it without an explicit human authorization that says so.
3. **No specialist before its gate** — each new ASTRA-11 analysis node needs its own authorized gate before implementation.
4. **Agent V1 stays frozen** — every ASTRA-11 read of internal knowledge goes through `AgentV1Adapter`; the new evidence classes live outside it.
5. **Deterministic-first** — where ASTRA-04's thin deterministic specialist pattern can express a node, build that first as the comparison baseline (mirrors `mode:'deterministic'` vs `mode:'llm'`).
