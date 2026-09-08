# ASTRA_MARKETING_ORCHESTRATOR_V1 — Charter

**Gate:** ASTRA-01 (architecture + router contract + method adjudication design). **Design only — no runtime, no Agent V1 change.**

## What ASTRA is
ASTRA is an **orchestration layer that sits ABOVE Agent V1**. Agent V1 is the validated, frozen **knowledge/retrieval engine** (`KNOWLEDGE_ENGINE_READ_ONLY`). ASTRA plans and reasons about complex marketing work; it never behaves like a single-shot RAG chatbot and never mutates Agent V1 state.

## What ASTRA must do
1. Understand the business goal (INTENT_ANALYZER → TASK_BRIEF).
2. Decompose the goal into an ordered DAG of work units (TASK_DECOMPOSER).
3. Decide what knowledge is relevant (KNOWLEDGE_QUERY_PLANNER).
4. Retrieve evidence from Agent V1 (read-only adapter).
5. **Adjudicate between competing methods/frameworks** (METHOD_ADJUDICATOR) — the defining capability.
6. Choose a PRIMARY_METHOD or a justified HYBRID.
7. Route work to specialist modules (SPECIALIST_ROUTER).
8. Synthesize one coherent marketing plan (SYNTHESIS_ENGINE).
9. Preserve provenance across every layer.
10. Control cost — expensive reasoning only where justified (MODEL_ROUTER + CONTEXT_POLICY).

## The core principle
**RETRIEVAL ≠ METHOD SELECTION.** Agent V1 may surface chunks from many books/courses/methods. ASTRA must NOT average or silently blend conflicting frameworks. A distinct `METHOD_ADJUDICATOR` decides which method governs each task and records `PRIMARY_METHOD / SECONDARY_METHODS / REJECTED_METHODS / HYBRID_ALLOWED` with structured reasons. Raw retrieval score alone must never choose a method.

## Hard boundaries (see AGENT_V1_ADAPTER_SPEC.md, ARCHITECTURE.md)
- **AGENT_V1** = frozen knowledge/retrieval foundation (read-only).
- **ASTRA_ORCHESTRATOR** = workflow planning + reasoning + coordination.
- **SPECIALISTS** = scoped domain execution.
- **RESEARCH_ENGINE** = current external evidence (kept separate from internal knowledge).
- **METHOD_REGISTRY** = framework metadata.
- **METHOD_ADJUDICATOR** = framework selection / conflict resolution.
- **MODEL_ROUTER** = cost/capability routing.

## Non-negotiable prohibitions (inherited by every future ASTRA gate)
Never modify: Agent V1 runtime, Strategy-F, retrieval, classifier, decision cache, corpus, embeddings, Supabase, benchmark, answer policy, answer model, evaluator. Never hardcode Velocity (or any method) as universally best. Never let retrieval scores alone select a framework. Never merge conflicting methods without an explicit, recorded adjudication.

## ASTRA-01 deliverables
The design documents in this directory (see README.md) plus `agent_loop/HANDOFF_ASTRA_01_ARCHITECTURE.md`. The next gate is **ASTRA-02_ROUTER_CORE_IMPLEMENTATION** (see VERTICAL_SLICE_360.md and the handoff for exact scope). Specialists are NOT implemented in ASTRA-02.
