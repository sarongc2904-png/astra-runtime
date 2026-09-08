# SPECIALIST_CONTRACT — common interface for all specialist modules

Every specialist obeys this contract. Specialists are scoped domain executors; they do NOT choose methodology (the adjudicator did) and do NOT retrieve broadly (they receive a bounded knowledge bundle). **No specialist is implemented in ASTRA-01 or ASTRA-02.**

## SPECIALIST_INPUT
```json
{
  "task_id": "...",
  "work_unit_id": "D",
  "specialist_type": "OFFER_SPECIALIST",
  "task_brief": { /* subset relevant to this unit */ },
  "upstream_outputs": [ { "work_unit_id":"B", "downstream_payload": { } } ],
  "selected_methods": { "primary_method":"...", "secondary_methods":[], "hybrid_strategy": null },
  "knowledge_evidence": [ { "evidence_id","source_class":"INTERNAL_KNOWLEDGE","chunk_id","source_pdf_name","pdf_page_refs","text" } ],
  "constraints": { "budget":null,"time":null,"channels":[],"compliance":[] },
  "output_requirements": { "format":"structured","must_cite":true,"max_output_chars": <CONTEXT_POLICY> }
}
```

## SPECIALIST_OUTPUT
```json
{
  "task_id": "...",
  "work_unit_id": "D",
  "specialist_type": "OFFER_SPECIALIST",
  "status": "COMPLETE | PARTIAL | BLOCKED | FAILED",
  "findings": [ { "claim":"...","source_class":"INTERNAL_KNOWLEDGE|EXTERNAL_RESEARCH|USER_PROVIDED_FACTS|INFERENCE","evidence_refs":[] } ],
  "recommendations": [ "..." ],
  "decisions": [ { "decision":"...","rationale":"...","method_used":"METHOD_ID" } ],
  "assumptions": [ "explicit, marked as INFERENCE" ],
  "evidence_used": [ "evidence_id", "..." ],
  "method_used": "METHOD_ID (matches selected primary/hybrid)",
  "conflicts": [ { "with":"upstream/other method","resolution":"..." } ],
  "confidence": 0.0,
  "downstream_payload": { /* structured, minimal, content-addressed for the next specialist */ }
}
```

## Rules every specialist follows
- **Honor the adjudicated method.** If the specialist believes the method is wrong, it returns `status: BLOCKED` with a `conflicts` note; it does NOT silently switch methods.
- **Cite or mark inference.** Every claim carries a `source_class`; unsupported statements must be `INFERENCE` and flagged as assumptions — never dressed as INTERNAL_KNOWLEDGE.
- **Stay within the bundle.** A specialist uses only its `knowledge_evidence` + `upstream_outputs`; if it needs more, it requests a follow-up retrieval through the router (does not call Agent V1 directly with broad queries).
- **Bounded output.** Respect `max_output_chars`; emit a compact `downstream_payload` (content-addressed handoff), not the full working text, to the next specialist.
- **Fail closed.** On missing required inputs or insufficient evidence, return `PARTIAL`/`BLOCKED` with `open_questions`, never fabricated confidence.
- **Model tier** is assigned by MODEL_ROUTER, not chosen by the specialist.

## Catalog (all follow the contract)
MARKET_RESEARCH_SPECIALIST, ICP_SPECIALIST, OFFER_SPECIALIST, FUNNEL_SPECIALIST, COPY_SPECIALIST, CREATIVE_STRATEGY_SPECIALIST, META_ADS_SPECIALIST, WHATSAPP_SALES_SPECIALIST, INFOPRODUCT_SPECIALIST, COURSE_BUILDER_SPECIALIST, VIDEO_SCRIPT_SPECIALIST, STORYBOARD_SPECIALIST, CRO_SPECIALIST.

## Determinism aid
Specialist outputs may be cached content-addressed on `hash(SPECIALIST_INPUT + specialist_version)` (same pattern as the Agent V1 decision cache) so re-runs of an unchanged unit replay identically and cheaply.
