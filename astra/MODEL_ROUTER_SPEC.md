# MODEL_ROUTER_SPEC — cost/capability routing

ASTRA-grade reasoning is expensive; most operations don't need it. The Model Router assigns a model tier per task class so expensive reasoning is used only where justified.

## Task classes
| class | use for |
|---|---|
| `HIGH_REASONING` | strategic synthesis, method adjudication, complex market interpretation, offer/funnel architecture, conflict resolution, hard creative strategy, cross-domain synthesis |
| `MEDIUM_REASONING` | specialist domain execution with moderate ambiguity (ICP drafting, ad-angle ideation) |
| `LOW_COST_EXECUTION` | formatting, extraction, tagging, variant generation, summarization, simple rewrites, classification |
| `DETERMINISTIC_TRANSFORM` | pure structural transforms (schema mapping, id hashing, DAG topo-sort) — **no LLM at all** |

## Routing policy entry
```json
{
  "task_type": "METHOD_ADJUDICATION",
  "model_role": "orchestrator_reasoner",
  "task_class": "HIGH_REASONING",
  "minimum_required_capability": "strong multi-constraint reasoning + structured JSON",
  "max_context_budget_chars": <from CONTEXT_POLICY>,
  "reasoning_level": "high",
  "fallback_model": "<next-best available>",
  "cost_priority": "QUALITY_FIRST | BALANCED | COST_FIRST"
}
```

## Assignment rules
- Adjudication, synthesis, conflict resolution → `HIGH_REASONING`.
- Specialist execution → `MEDIUM_REASONING` by default; upgrade to `HIGH_REASONING` only when the adjudicator flags high `contradiction_risk` or low `selection_confidence`.
- Formatting/extraction/tagging/summaries/variants → `LOW_COST_EXECUTION`.
- Structural transforms → `DETERMINISTIC_TRANSFORM` (code, no model).
- The **classifier stays Agent V1's frozen model** (via the adapter/cache) — the Model Router never re-routes Agent V1's classifier or answer model.

## Cost controls (compound with CONTEXT_POLICY)
- Prefer cached results (adjudication cache, specialist-output cache) before any model call.
- `DETERMINISTIC_TRANSFORM` first — never spend a token on what code can do.
- Batch `LOW_COST_EXECUTION` items where possible.
- Record `cost_usage` per step in workflow state (tokens + tier), surfaced for budget limits.

## Model selection
Do NOT hardcode a specific model here. The router resolves a task_class to a concrete model from **available/configured** models at run time (a small policy table), with an explicit `fallback_model`. When building AI features, default to the latest capable models; but ASTRA-01 fixes only the *policy*, not the model ids.

## Anti-waste invariant
Astra-tier (HIGH_REASONING) calls are the minority of operations by design. If a workflow shows HIGH_REASONING on routine transforms, that is a routing defect to fix — not the intended behavior.
