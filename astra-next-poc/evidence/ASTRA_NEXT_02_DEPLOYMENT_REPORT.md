# ASTRA-NEXT-02 — AnythingLLM Runtime POC Deployment Report

Date: 2026-09-16
Branch: `astra-next-poc`
Scope: isolated POC only. No changes to ASTRA legacy runtime or production.

## Attempt 1 — Render native Node service

Service: `astra-next-anythingllm-poc`
Result: BUILD_FAILED
Observed failure: `sharp` attempted source compilation and `node-gyp` was not available (`exit code 127`).

## Attempt 2 — Render native Node service with node-gyp

Service: `astra-next-anythingllm-poc2`
Result: BUILD_FAILED
Observed failure: AnythingLLM repository pins Node `18.18.0`; `sharp@0.32.6` attempted source compilation against Render's globally installed libvips. `node-gyp` then failed during configuration with `ReferenceError: File is not defined` from its undici dependency.

## Adjudication

The failure occurs before AnythingLLM runtime startup, before ASTRA knowledge ingestion, before OpenRouter configuration, and before Campaign360 execution. Therefore it is an infrastructure/deployment-path failure, not evidence against AnythingLLM RAG, Agent Flows, Campaign360 fidelity, or knowledge quality.

`ASTRA_NEXT_02_NATIVE_RENDER = BLOCKED`

Reason: native Render Node deployment is incompatible with the current AnythingLLM build dependency path in this environment.

## Correct deployment path

Use the official AnythingLLM Docker image. Prepared artifacts:

- `astra-next-poc/deployment/Dockerfile`
- `astra-next-poc/deployment/render-anythingllm.yaml`

Target storage path: `/app/server/storage`
Target provider: OpenRouter
Target workspace: `ASTRA NEXT`
Knowledge freeze: `ASTRA_NEXT_POC_KB_V1`
Campaign flow spec: `astra-next-poc/flows/campaign360_spec.json`

## Safety

- ASTRA legacy unchanged.
- Existing `astra-runtime` Render service unchanged.
- No Supabase writes.
- No n8n changes.
- No Meta/WhatsApp actions.

## Next gate

`ASTRA_NEXT_02_DOCKER_DEPLOYMENT = REQUIRED`

PASS requires a healthy AnythingLLM Docker runtime and successful creation of the `ASTRA NEXT` workspace before knowledge ingestion proceeds.
