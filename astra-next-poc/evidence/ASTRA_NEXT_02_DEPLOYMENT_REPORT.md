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

## Attempt 3 — Official AnythingLLM Docker image

Service: `astra-next-anythingllm-docker-poc`
Render service id: `srv-dalf0kp42hec73c8oabg`
Runtime: Docker
Image: `mintplexlabs/anythingllm:latest`
Branch: `astra-next-poc`
Result: LIVE

Observed runtime evidence:

- official Docker image pulled successfully;
- Prisma migrations completed successfully;
- SQLite pool started;
- AnythingLLM server boot telemetry emitted with `runtime=docker`;
- background worker initialized;
- backend reported `Primary server in HTTP mode listening on port 3001`;
- Render deploy `dep-dalf0qn40ujc73dppptg` reached `live`;
- application secrets (`AUTH_TOKEN`, `JWT_SECRET`, `SIG_KEY`, `SIG_SALT`) were set through Render environment variables and a redeploy was initiated.

`ASTRA_NEXT_02_DOCKER_RUNTIME = PASS`

## Current integration boundary

OpenRouter is not yet configured in the new AnythingLLM instance.

The existing ASTRA Render service already has an `OPENROUTER_API_KEY` environment variable, but the Render connector available in this execution context intentionally supports setting environment variables without exposing existing secret values. Therefore the key cannot be copied or read safely from `astra-runtime` by this process.

The execution environment also cannot resolve/open the newly-created Render hostname directly, so AnythingLLM onboarding and Developer API bootstrap cannot be completed through a browser/API call from this session.

This is not a runtime failure. It is a credential/bootstrap boundary.

`ASTRA_NEXT_02_OPENROUTER_CONFIGURATION = REQUIRED`
`ASTRA_NEXT_02_WORKSPACE_CREATION = REQUIRED`
`ASTRA_NEXT_02_KNOWLEDGE_INGESTION = NOT_STARTED`
`ASTRA_NEXT_02_CAMPAIGN360_EXECUTION = NOT_STARTED`

## Prepared deployment artifacts

- root `Dockerfile` on branch `astra-next-poc` for Render Docker deployment;
- `astra-next-poc/deployment/Dockerfile`;
- `astra-next-poc/deployment/render-anythingllm.yaml`;
- frozen brief: `astra-next-poc/frozen_brief/metodo360.json`;
- knowledge freeze manifest: `astra-next-poc/knowledge/manifest.json`;
- flow contract: `astra-next-poc/flows/campaign360_spec.json`;
- benchmark result contract: `astra-next-poc/benchmark/result_contract.json`.

## Safety

- ASTRA legacy unchanged.
- Existing `astra-runtime` Render service unchanged.
- No existing OpenRouter secret exposed or copied.
- No Supabase writes.
- No n8n changes.
- No Meta/WhatsApp actions.

## Gate status

`ASTRA_NEXT_02_RUNTIME = PASS`

Full ASTRA-NEXT-02 remains PARTIAL until OpenRouter is securely configured and workspace `ASTRA NEXT` is created.

Next executable steps once OpenRouter credential is present in the new service:

1. configure AnythingLLM LLM provider = OpenRouter;
2. select the same benchmark model used by legacy ASTRA;
3. create workspace `ASTRA NEXT`;
4. ingest only `ASTRA_NEXT_POC_KB_V1`;
5. materialize Campaign360 Agent Flow from `campaign360_spec.json`;
6. execute frozen Método 360 brief;
7. write benchmark result against the frozen result contract.
