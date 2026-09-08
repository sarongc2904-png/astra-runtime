# ROUTER_CONTRACT — intent, decomposition, query planning, specialist routing

Covers the four routing layers between the user goal and the specialists.

## 1. INTENT_ANALYZER → TASK_BRIEF
```json
{
  "task_id": "...", "user_goal": "verbatim request",
  "objective": "normalized goal", "business_type": "e.g. local service clinic",
  "funnel_stage_focus": ["acquisition","conversion"],
  "target_customer_hint": "...", "desired_deliverable": "e.g. 360 campaign",
  "constraints": {"budget":null,"time":null,"channels":[],"skill":null,"compliance":[]},
  "urgency": "LOW|MEDIUM|HIGH",
  "evidence_need": "LOW|MEDIUM|HIGH",
  "external_research_needed": true,
  "risk_uncertainty": "LOW|MEDIUM|HIGH",
  "language": "es|en",
  "source_facts": [{"fact":"...","source_class":"USER_PROVIDED_FACTS"}]
}
```
The analyzer extracts, does not invent. Unknown fields are null and become `open_questions` in workflow state.

## 2. TASK_DECOMPOSER → WORKFLOW_DAG
Produces an **ordered DAG**, not a flat list. Each node:
```json
{ "work_unit_id":"A", "title":"market context", "specialist_type":"MARKET_RESEARCH_SPECIALIST",
  "depends_on":[], "produces":["market_context"], "consumes":[], "optional":false }
```
Example for "campaign for a laser hair removal clinic": A market context → B ICP → C pains/desires/objections → D offer → E funnel → F creative angles → G ads → H WhatsApp flow → I follow-up → J measurement. Edges encode which outputs feed which downstream units (e.g. D offer consumes B,C; G ads consumes D,E,F).

## 3. KNOWLEDGE_QUERY_PLANNER → retrieval requests
For each work unit, emits **targeted** Agent V1 queries (never "send the whole KB"):
```json
{ "work_unit_id":"D", "queries":[
   {"q":"offer design for high-ticket local services","domain":"OFFER","top_k":5},
   {"q":"risk reversal and guarantees for services","domain":"OFFER","top_k":5}
 ], "max_evidence_chars": <from CONTEXT_POLICY> }
```
Each query → `AgentV1Adapter.retrieveAndClassify`. Planner attaches the returned sufficiency so the adjudicator can evidence-gate.

## 4. SPECIALIST_ROUTER
Given the DAG + adjudications, determines execution:
```json
{ "work_unit_id":"D", "specialist_type":"OFFER_SPECIALIST",
  "run_order": 4, "inputs_from":["B","C"], "selected_methods": {from adjudicator},
  "knowledge_bundle_ref":"content-addressed handoff id", "model_tier":"HIGH_REASONING" }
```
Router responsibilities:
- **which** specialist runs for each unit,
- **in what order** (topological sort of the DAG),
- **which upstream outputs** become inputs (from DAG edges),
- **which knowledge bundle** each specialist receives (CONTEXT_POLICY-bounded, content-addressed),
- **which model tier** (from MODEL_ROUTER by task class).
Router never executes domain logic; it only assembles inputs and dispatches.

## Specialist catalog (routed, defined in SPECIALIST_CONTRACT.md)
MARKET_RESEARCH, ICP, OFFER, FUNNEL, COPY, CREATIVE_STRATEGY, META_ADS, WHATSAPP_SALES, INFOPRODUCT, COURSE_BUILDER, VIDEO_SCRIPT, STORYBOARD, CRO.

## Routing invariants
- Deterministic given identical (TASK_BRIEF, DAG, adjudications, versions) — routing decisions are content-addressable and auditable.
- No specialist receives more context than CONTEXT_POLICY allows.
- Every dispatch records provenance (which evidence bundle, which methods, which tier).
