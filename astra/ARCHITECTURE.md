# ASTRA — ARCHITECTURE

Design-only. ASTRA orchestrates; Agent V1 stays frozen and read-only.

## Layered data flow
```
USER GOAL
  │
  ▼
[1] INTENT_ANALYZER ─────────────► TASK_BRIEF
  │
  ▼
[2] TASK_DECOMPOSER ─────────────► WORKFLOW_DAG (ordered work units + dependencies)
  │
  ▼
[3] KNOWLEDGE_QUERY_PLANNER ─────► targeted retrieval requests (per work unit)
  │                                     │
  │                                     ▼
  │                        [AGENT_V1_ADAPTER]  (READ-ONLY)
  │                        kb.groundedRetrieve → Strategy-F top5 + provenance
  │                        kb.classifyEvidenceSufficiency (cached) → sufficiency
  │                                     │
  ▼                                     ▼
[4] METHOD_REGISTRY (candidates) ─► [5] METHOD_ADJUDICATOR
                                        │  PRIMARY / SECONDARY / REJECTED / HYBRID
                                        ▼
                                    [6] SPECIALIST_ROUTER
                                        │  order, knowledge bundle, model tier per specialist
                                        ▼
                                    SPECIALISTS (scoped execution, common contract)
                                        │  each: SPECIALIST_INPUT → SPECIALIST_OUTPUT
                                        ▼
                                    [7] SYNTHESIS_ENGINE (resolve conflicts, not concatenate)
                                        │
                                        ▼
                                    COHERENT MARKETING PLAN
                                    (+ methodology, provenance, assumptions, uncertainty, next actions)
```
Cross-cutting: **MODEL_ROUTER** (cost/capability), **CONTEXT_POLICY** (read-minimum-necessary), **RESEARCH_ENGINE** (external evidence), **WORKFLOW_STATE** (durable orchestration state), **provenance** threaded end-to-end.

## Separation of concerns
| Layer | Owns | Must NOT |
|---|---|---|
| Agent V1 | retrieval, Strategy-F, classifier+cache, answer policy/model | be mutated by ASTRA |
| Intent Analyzer | goal → TASK_BRIEF | pick methods or retrieve |
| Task Decomposer | goal → ordered DAG | execute work |
| Knowledge Query Planner | targeted queries | dump whole KB to ASTRA |
| Method Registry | framework metadata | invent unaudited method content |
| Method Adjudicator | framework selection + conflict resolution | choose by retrieval score alone; average conflicts |
| Specialist Router | which/what order/which bundle/which tier | do domain work itself |
| Specialists | scoped domain execution | change methodology chosen upstream |
| Synthesis Engine | one coherent plan; resolve contradictions | concatenate raw outputs |
| Research Engine | external current evidence | merge external with internal silently |
| Model Router | model tier per task class | be invoked for trivial transforms |

## Provenance model (threaded everywhere)
Every fact carries a `source_class ∈ {INTERNAL_KNOWLEDGE, EXTERNAL_RESEARCH, USER_PROVIDED_FACTS, INFERENCE}` plus evidence refs (Agent V1 `chunk_id` + `source_pdf_name` + `pdf_page_refs`, or research citation). Synthesis must preserve source_class; it never launders INFERENCE into INTERNAL_KNOWLEDGE.

## Proposed directory design (create incrementally in ASTRA-02+)
```
astra/
  README.md
  ASTRA_MARKETING_ORCHESTRATOR_V1.md
  ARCHITECTURE.md
  ROUTER_CONTRACT.md
  METHOD_REGISTRY_SPEC.md
  METHOD_ADJUDICATOR_SPEC.md
  SPECIALIST_CONTRACT.md
  MODEL_ROUTER_SPEC.md
  CONTEXT_POLICY.md
  RESEARCH_ENGINE_SPEC.md
  WORKFLOW_STATE_SPEC.md
  VERTICAL_SLICE_360.md
  AGENT_V1_ADAPTER_SPEC.md
  CLAUDE_CODE_CODEX_HANDOFF_PROTOCOL.md
  CURRENT_TASK_TEMPLATE.md
  HANDOFF_TEMPLATE.md
  architecture/     # design diagrams, ADRs (docs only in ASTRA-01)
  contracts/        # JSON schemas for briefs/inputs/outputs (ASTRA-02)
  router/           # intent analyzer, decomposer, query planner, specialist router (ASTRA-02+)
  methods/          # method registry data + loader (ASTRA-02)
  specialists/      # scoped modules (ASTRA-03+; NOT in ASTRA-02)
  workflows/        # workflow definitions incl. MARKETING_CAMPAIGN_360 (ASTRA-02+)
  research/         # research engine (later gate)
  model_router/     # model routing policy + impl (ASTRA-02 skeleton)
  state/            # workflow state store (ASTRA-02 skeleton; persistence later)
  handoffs/         # per-session CURRENT_TASK.md / HANDOFF_LATEST.md live at repo agent_loop or here
  tests/            # contract + skeleton tests (ASTRA-02)
```
ASTRA-01 creates only the top-level design docs. Subdirectories are created when their first artifact is needed.

## Reliability inheritance from Agent V1
ASTRA reuses Agent V1's proven patterns: content-addressed determinism (extend the decision-cache idea to specialist outputs and adjudications), fail-closed on integrity uncertainty, additive/append-only state, explicit versioning of any material change, and provenance on every emitted fact.
