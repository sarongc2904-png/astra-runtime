# WORKFLOW_STATE_SPEC — durable orchestration state

The workflow state is the single source of truth for an in-progress ASTRA run. **Persistence is NOT implemented in ASTRA-01;** this defines the object and its lifecycle. It also underpins the Claude Code ↔ Codex handoff (a session can be resumed from state).

## Object
```json
{
  "project_id": "...",
  "workflow_id": "...",
  "workflow_type": "MARKETING_CAMPAIGN_360",
  "user_goal": "verbatim",
  "task_brief": { /* from INTENT_ANALYZER */ },
  "workflow_steps": [ { "work_unit_id","title","specialist_type","depends_on":[],"status" } ],
  "current_step": "work_unit_id",
  "selected_methods": { "work_unit_id": { /* adjudication result */ } },
  "evidence_bundles": { "bundle_id": { "queries":[], "evidence_refs":[], "sufficiency":"..." } },
  "specialist_outputs": { "work_unit_id": { /* SPECIALIST_OUTPUT (or payload ref) */ } },
  "decisions": [ { "at":"work_unit_id","decision":"...","rationale":"...","method_used":"..." } ],
  "assumptions": [ { "assumption":"...","source_class":"INFERENCE" } ],
  "open_questions": [ "..." ],
  "research": [ { "research_id","triggered_by","status" } ],
  "cost_usage": { "by_step": {}, "total_tokens": 0, "by_tier": {} },
  "provenance_index": { "evidence_id": {"source_class","chunk_id","source_pdf_name","pdf_page_refs"} },
  "status": "PLANNED | RUNNING | WAITING_FOR_INPUT | BLOCKED | COMPLETE | FAILED",
  "version": "ws-0.1",
  "updated_at": "ISO"
}
```

## Statuses
`PLANNED` (DAG built, nothing run) → `RUNNING` → (`WAITING_FOR_INPUT` when a user fact/decision is required) → (`BLOCKED` when an unresolved dependency/insufficient evidence stops progress) → `COMPLETE` | `FAILED`.

## Lifecycle rules
- **Additive/append-only** history for decisions/assumptions/open_questions (mirrors AGENT_STATE conventions); never rewrite past decisions, supersede them with a new dated entry.
- Each step transition writes state before proceeding (so a mid-run interruption is resumable).
- `cost_usage` is updated per model call with tier + tokens (feeds budget ceilings).
- Provenance index is maintained continuously so synthesis can cite without re-retrieving.

## Persistence (future gate)
Local durable store (JSON/SQLite) under `astra/state/`, content-addressed where useful, fail-closed on integrity errors — reusing the Agent V1 cache reliability pattern. Never in Supabase / Agent V1 stores. No secrets stored.

## Determinism
Given identical inputs, the *deterministic* portions (DAG, routing, adjudication cache hits, transforms) reproduce exactly; model-generated specialist prose is intrinsically nondeterministic and is not claimed otherwise — but is stabilized operationally via content-addressed specialist-output caching when unchanged.
