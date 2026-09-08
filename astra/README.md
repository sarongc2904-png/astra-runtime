# ASTRA_MARKETING_ORCHESTRATOR_V1

Orchestration layer **above** the frozen Agent V1 knowledge/retrieval engine. Coordinates complex marketing work (research → ICP → offer → funnel → creative → ads → WhatsApp → measurement → synthesis) by planning, retrieving read-only evidence from Agent V1, **adjudicating which method governs each task**, routing to specialists, and synthesizing one coherent plan — with provenance and cost control.

**Status:** ASTRA-01 (architecture/design) — **design only, no runtime built, Agent V1 untouched.**

## Core principle
`RETRIEVAL != METHOD SELECTION`. A dedicated **METHOD_ADJUDICATOR** decides the governing method/framework; conflicting frameworks are never averaged silently.

## Documents (this directory)
| file | purpose |
|---|---|
| `ASTRA_MARKETING_ORCHESTRATOR_V1.md` | charter, objective, boundaries, prohibitions |
| `ARCHITECTURE.md` | layers, data flow, separation of concerns, directory design |
| `AGENT_V1_ADAPTER_SPEC.md` | read-only bridge to Agent V1 (verified interface) |
| `ROUTER_CONTRACT.md` | intent analyzer, task decomposer, query planner, specialist router |
| `METHOD_REGISTRY_SPEC.md` | framework metadata catalog + population protocol |
| `METHOD_ADJUDICATOR_SPEC.md` | framework selection + conflict resolution (the key layer) |
| `SPECIALIST_CONTRACT.md` | common specialist input/output contract |
| `MODEL_ROUTER_SPEC.md` | cost/capability routing by task class |
| `CONTEXT_POLICY.md` | READ_MINIMUM_NECESSARY_CONTEXT budgets |
| `RESEARCH_ENGINE_SPEC.md` | when/how external research runs, source-class separation |
| `WORKFLOW_STATE_SPEC.md` | durable orchestration state object + lifecycle |
| `VERTICAL_SLICE_360.md` | first end-to-end workflow (MARKETING_CAMPAIGN_360) |
| `CLAUDE_CODE_CODEX_HANDOFF_PROTOCOL.md` | Claude Code ↔ Codex continuation protocol |
| `CURRENT_TASK_TEMPLATE.md` / `HANDOFF_TEMPLATE.md` | handoff templates |

## Boundaries
`AGENT_V1` = frozen knowledge/retrieval (read-only) · `ASTRA_ORCHESTRATOR` = planning/reasoning/coordination · `SPECIALISTS` = scoped execution · `RESEARCH_ENGINE` = external evidence · `METHOD_REGISTRY` = metadata · `METHOD_ADJUDICATOR` = selection/conflict · `MODEL_ROUTER` = cost/capability.

## Next gate
**ASTRA-02_ROUTER_CORE_IMPLEMENTATION** — implement task-brief schema, intent analyzer, task decomposer, Agent V1 read-only adapter, method-registry loader, method-adjudicator skeleton, model-router skeleton, workflow state, and the handoff protocol. **No specialists.** See the ASTRA-01 handoff for exact scope.

## Runtime env (inherited from Agent V1, required)
```
STRATEGY_F_PYTHON=C:\Users\saro_\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe
PYTHONIOENCODING=utf-8
PYTHONUTF8=1
```
