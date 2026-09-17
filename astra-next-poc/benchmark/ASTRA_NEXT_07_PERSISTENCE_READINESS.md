# ASTRA-NEXT-07 — Persistence Readiness

## Status

`ASTRA_NEXT_07_PERSISTENCE_DESIGN = PASS`

`ASTRA_NEXT_07_PERSISTENT_RUNTIME = BLOCKED_BY_INFRA_AUTHORIZATION`

## Why this gate exists

The current ASTRA NEXT Render POC runs on ephemeral storage. Runtime evidence has repeatedly shown a fresh `anythingllm.db` being created after redeploy/restart, followed by recreation of the workspace, vector embeddings, API keys, and Agent Flow.

That behavior is acceptable for the POC but is not acceptable for durable use.

## AnythingLLM persistence boundary

AnythingLLM is configured with:

```text
STORAGE_DIR=/app/server/storage
```

This directory is the persistence boundary for the Docker deployment. The future Render persistent disk must therefore mount at exactly:

```text
/app/server/storage
```

Persisting only another directory would not preserve the complete AnythingLLM runtime state.

## Prepared deployment artifact

A non-active example Blueprint has been added:

```text
astra-next-poc/deployment/render-anythingllm-persistent.example.yaml
```

It defines:

- paid web-service compute
- one persistent disk
- `mountPath: /app/server/storage`
- `sizeGB: 1`
- `PORT=3001`
- OpenRouter LLM and embedding configuration
- `OPENROUTER_AGENT_MAX_TOKENS=4096`
- all benchmark execution flags disabled by default
- secrets as `sync: false`

The example is intentionally not wired to the currently running service and must not be applied without explicit authorization for paid infrastructure.

## Persistence acceptance test

After a paid disk is attached, ASTRA-NEXT-07 is only PASS when all of the following are observed across a real redeploy/restart:

1. `anythingllm.db` is reused rather than recreated.
2. Workspace `astra-next` exists without recreation.
3. Previously embedded ASTRA NEXT knowledge remains available.
4. Agent Flow `ASTRA NEXT Campaign360 Handoff` exists with the same UUID or persisted identity.
5. Existing Developer API key remains available.
6. No duplicate document embedding is required merely because of a redeploy.
7. `RUN_CAMPAIGN360_POC=false`.
8. `RUN_AGENT_FLOW_POC=false`.
9. Campaign360 RAG query still returns grounded results after restart.

## Current safe state

Validated before this gate:

- ASTRA-NEXT-05 Campaign360 quality gate: PASS
- brief fidelity: 100%
- knowledge grounding: 100%
- critical hallucinations: 0
- contradictions: 0
- Agent Flow materialization: PASS
- Agent Flow exact-payload handoff: PASS
- external side effects: 0

## Decision boundary

No paid Render plan, persistent disk, billing change, or production migration is authorized by this document.

The remaining action is an infrastructure decision: keep the POC ephemeral, or authorize a paid single-instance service with a persistent disk mounted at `/app/server/storage`.

Until that decision is made:

`ASTRA_NEXT_07_PERSISTENT_RUNTIME = NOT_EXECUTED`
