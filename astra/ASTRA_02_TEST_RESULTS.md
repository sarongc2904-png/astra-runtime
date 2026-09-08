# ASTRA-02 — TEST RESULTS

Runner: `node astra/tests/run_all.test.js` (Node built-ins; no live API — adapter uses an injected mock `kb`). Routing proof: `node astra/tests/routing_proof.js` (mock flow + one live read-only Agent V1 retrieval).

## Unit/contract suite — 39/39 PASS
| area | tests | result |
|---|---|---|
| TASK_BRIEF | valid / invalid enum / missing required / bad funnel_stage | PASS |
| INTENT | single (offer) / multi-step / generic / valid brief / deterministic id | PASS |
| DAG | valid+topo / deterministic ids / cycle rejected / unknown dep rejected / dep ordering | PASS |
| KNOWLEDGE QUERY PLANNER | targeted+bounded / ≤2 queries per step | PASS |
| AGENT V1 ADAPTER | read-only+provenance / no apiKey / fail-closed contract mismatch / healthCheck / top_k bounded | PASS |
| METHOD REGISTRY | loads seed (all DISCOVERED) / valid entry / invalid entry / getCandidates | PASS |
| METHOD ADJUDICATOR | output schema / multiple candidates / insufficient-evidence gate / conflict detection / not-retrieval-score-only | PASS |
| MODEL ROUTER | task classes / configurable role, no hardcoded model id | PASS |
| WORKFLOW STATE | create PLANNED / valid transition / invalid transition rejected / additive decisions | PASS |
| HANDOFF | CURRENT_TASK complete / HANDOFF_LATEST complete / operational | PASS |

`ASTRA02_TEST_RESULT pass=39 fail=0`

## First routing proof — PASS
Pipeline: RAW → INTENT_ANALYZER → TASK_BRIEF → TASK_DECOMPOSER → WORKFLOW_DAG → KNOWLEDGE_QUERY_PLANNER → AgentV1Adapter (read-only) → METHOD_REGISTRY candidates → METHOD_ADJUDICATOR → MODEL_ROUTER → WORKFLOW_STATE. **Stops before specialist execution.**

- intent = `MULTI_STEP_MARKETING`, objective = `CLIENT_ACQUISITION`, business_type = `LASER HAIR REMOVAL CLINIC`.
- workflow order (8): market_context → icp → offer → funnel → creative_strategy → ads → whatsapp_conversion → measurement.
- per step: targeted query, read-only retrieval (mock), sufficiency (cache hit), registry candidates, adjudicated primary_method + state + confidence, model tier.
- workflow_state_status = `PLANNED`; `specialists_executed = false`; `stopped_before = SPECIALIST_EXECUTION`.

### Live read-only Agent V1 retrieval (in the proof)
`health_ok = true`, `exposes_api_key = false`, `corpus = kb_chunks_v2`, `pipeline = Strategy-F`, `evidence_count = 5`, real `chunk_id`s, source = *The Advertising Concept Book*, `source_class = INTERNAL_KNOWLEDGE`, `read_only = true`. Proves the live adapter works against the frozen engine with provenance preserved and no key exposure.

Full JSON: `astra/tests/routing_proof_output.json`.

## Agent V1 protection (Phase 13)
All frozen shas unchanged: knowledge.js `0596f096`, classifier_decision_cache.js `273b40ee`, retrieval_strategy_f.py `cdbbc9b2`, rag_answer_policy_runtime.js `f76d6207`, benchmark `ddb566fd`, rebuilt evidence `02cbd455`. Decision-cache records unchanged (20). `AGENT_V1_PROTECTED = True`.
