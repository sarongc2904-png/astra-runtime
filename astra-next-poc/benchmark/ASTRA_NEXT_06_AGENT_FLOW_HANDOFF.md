# ASTRA-NEXT-06 — Agent Flow Handoff Adjudication

Status: **PASS**

## Scope
Validate that a real AnythingLLM Agent Flow can be materialized as an active agent tool and invoked without external side effects, while preserving an already-grounded Campaign360 payload exactly.

## Runtime configuration
- Repository branch: `astra-next-poc`
- AnythingLLM runtime: Docker POC
- LLM provider: OpenRouter
- Model: `openai/gpt-5-mini`
- Embedder: OpenRouter
- Embedding model: `baai/bge-m3`
- Knowledge manifest: `ASTRA_NEXT_POC_KB_V1`
- Campaign360 generation flag: `RUN_CAMPAIGN360_POC=false`
- Agent Flow execution flag returned to safe state: `RUN_AGENT_FLOW_POC=false`

## Flow
Name: `ASTRA NEXT Campaign360 Handoff`

Design:
- 1 native `start` block
- required variable: `campaign_json`
- `directOutput=true`
- no `llmInstruction` block
- no `apiCall` block
- no web scraping
- no external side effects

Purpose: accept an already-grounded Campaign360 payload and return the handoff value without transformation.

## Evidence
Materialization:

```text
agent_flow_materialization status=PASS
active=true
blocks=1
side_effects=0
```

Successful execution after bounding the OpenRouter agent output budget:

```text
agent_flow_execution_start gate=ASTRA-NEXT-06 mode=automatic
agent_flow_execution status=PASS http=200 duration_ms=4495 exact_payload_preserved=true response_chars=214 side_effects=0
bootstrap_complete
```

A second successful run was also observed:

```text
agent_flow_execution status=PASS http=200 duration_ms=3594 exact_payload_preserved=true response_chars=214 side_effects=0
```

## Failure discovered and remediation
The first agent-mode attempt failed before the flow tool could execute because the AnythingLLM OpenRouter agent provider reserved the model's full output ceiling (`max_tokens=65536`), which triggered an OpenRouter 402 credit-preflight rejection.

Remediation commit:

`12466cf839437a078984fae58d257b15dcacb1ef` — `ASTRA-NEXT-06 bound OpenRouter agent output tokens`

The POC-only compatibility patch passes an explicit bounded `maxTokens` value to the OpenRouter agent provider while keeping the same provider, model, flow, and tool path.

## Adjudication

```text
ASTRA_NEXT_06_AGENT_FLOW_MATERIALIZATION = PASS
ASTRA_NEXT_06_AGENT_TOOL_REGISTRATION = PASS
ASTRA_NEXT_06_EXECUTION = PASS
ASTRA_NEXT_06_PAYLOAD_INTEGRITY = PASS
ASTRA_NEXT_06_EXTERNAL_SIDE_EFFECTS = 0
ASTRA_NEXT_06 = PASS
```

## Architectural conclusion
AnythingLLM Agent Flows are viable as the orchestration/action layer for ASTRA NEXT. The grounded Campaign360 intelligence remains in the Workspace RAG layer; Agent Flow receives adjudicated payloads for deterministic handoff/action orchestration rather than replacing RAG with ungrounded `llmInstruction` blocks.

This preserves the architecture established after ASTRA-NEXT-05:

`Workspace RAG / Campaign360 intelligence -> adjudication -> Agent Flow orchestration -> external execution tools`
