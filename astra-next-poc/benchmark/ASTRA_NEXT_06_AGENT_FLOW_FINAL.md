# ASTRA-NEXT-06 — Native Agent Flow Final Adjudication

Status: **PASS**

## Scope

Validate a real AnythingLLM Agent Flow without replacing the already-validated Workspace RAG intelligence layer.

The Agent Flow is intentionally side-effect-free and deterministic. It receives an already-grounded Campaign360 payload through the required variable `campaign_json` and returns that payload directly via a `start` block configured with `directOutput=true`.

## Architecture decision

ASTRA NEXT uses a hybrid architecture:

- Workspace RAG = commercial intelligence and grounded Campaign360 generation.
- Agent Flows = deterministic orchestration and action handoff.
- n8n / MCP / external APIs = execution layer in later gates.

This avoids representing Agent Flow `llmInstruction` blocks as equivalent to Workspace RAG when those blocks do not independently perform the same workspace retrieval path.

## Materialization evidence

Observed on Render service `astra-next-anythingllm-docker-poc`:

```text
agent_flow_materialization status=PASS
active=true
blocks=1
side_effects=0
```

Flow name:

```text
ASTRA NEXT Campaign360 Handoff
```

AnythingLLM attached the flow to the agent cluster as:

```text
astra_next_campaign360_handoff
```

## First execution attempt

The first attempt failed before tool execution because the OpenRouter agent provider reserved the model's full 65,536-token output ceiling, producing HTTP 402 on the available account credit.

This was a provider budgeting issue, not an Agent Flow failure.

A POC-only compatibility patch was added in commit:

```text
12466cf839437a078984fae58d257b15dcacb1ef
ASTRA-NEXT-06 bound OpenRouter agent output tokens
```

The agent provider is now bounded with:

```text
OPENROUTER_AGENT_MAX_TOKENS=4096
```

The model remained:

```text
openai/gpt-5-mini
```

## Successful retry

The retry used the same flow and a deterministic handoff payload:

```json
{"brief_id":"ASTRA_NEXT_POC_METODO360_V1","quality_gate":"PASS","brief_fidelity_pct":100,"knowledge_grounding_pct":100,"critical_hallucinations":0,"evidence_registry_valid":true}
```

AnythingLLM agent logs confirmed the native tool call:

```text
@agent is attempting to call `astra_next_campaign360_handoff` tool
```

The exact `campaign_json` string was supplied to the flow. AnythingLLM then reported direct output and stopped further tool calls.

Final bootstrap adjudication:

```text
agent_flow_execution status=PASS
http=200
duration_ms=4495
exact_payload_preserved=true
response_chars=214
side_effects=0
```

## Gates

```text
ASTRA_NEXT_06_FLOW_MATERIALIZATION = PASS
ASTRA_NEXT_06_FLOW_ACTIVE = PASS
ASTRA_NEXT_06_NATIVE_AGENT_TOOL_ATTACHMENT = PASS
ASTRA_NEXT_06_NATIVE_AGENT_TOOL_CALL = PASS
ASTRA_NEXT_06_EXACT_PAYLOAD_PRESERVATION = PASS
ASTRA_NEXT_06_SIDE_EFFECT_ISOLATION = PASS
ASTRA_NEXT_06_AGENT_PROVIDER_TOKEN_BOUND = PASS
ASTRA_NEXT_06 = PASS
```

## Safety state

After the successful one-shot execution, `RUN_AGENT_FLOW_POC` was reset to `false` so future restarts do not repeat the agent call.

## Interpretation

This gate demonstrates that ASTRA NEXT can preserve the validated RAG-generated Campaign360 artifact and hand it into a real AnythingLLM Agent Flow without mutation. The result supports the hybrid design: keep intelligence in Workspace RAG and use Agent Flows for deterministic orchestration and later controlled actions.
