# ASTRA GPT + Supabase Integration Guide

## What this package does

The GPT is the interface; ASTRA remains the knowledge and reasoning engine. `searchKnowledgeBase` keeps
using the existing `search-kb` Edge Function. The three ASTRA actions enter through the new
`astra-tools` Edge Function and are forwarded to the narrow Node API that can execute the local
CommonJS ASTRA runtime and Strategy-F.

## Routes and routing

- Knowledge lookup → `searchKnowledgeBase` → `POST /functions/v1/search-kb`
- Full campaign → `runAstraCampaign360` → `POST /functions/v1/astra-tools/campaign-360`
- Concepts/art direction → `runAstraCreativeDirector` → `POST /functions/v1/astra-tools/creative-director`
- Approved generation/revision → `runAstraCreativeGeneration` → `POST /functions/v1/astra-tools/creative-generation`

Do not call all actions for every request. If ASTRA returns `WAITING_FOR_INPUT`, ask only for
`required_inputs`. Surface `BLOCKED` and `FAILED` without rewriting them. Preserve every
`CURRENT_RESEARCH_REQUIRED` entry; ASTRA-09 does not browse automatically.

## Server-side configuration

The Supabase functions use `KB_API_KEY`. The `astra-tools` gateway additionally requires
`ASTRA_RUNTIME_URL` and `ASTRA_RUNTIME_API_KEY`. The Node API accepts `ASTRA_GPT_API_KEYS` (comma-
separated during rotation), or falls back to `KB_API_KEY`. Optional `ASTRA_ALLOWED_PROJECT_IDS` is a
fail-closed local allowlist; a production host should inject a real `projectAuthorizer` that verifies
ownership from authenticated server-side state.

Keep all values server-side. Never put service-role, OpenRouter, runtime, or KB keys in GPT
instructions or response bodies.

ASTRA provider configuration remains unchanged:

```dotenv
ASTRA_LLM_PROVIDER=openrouter|lmstudio
ASTRA_LLM_MODEL=<server-side-model-id>
```

Use the existing provider-specific variables documented in `README_RUNTIME.md`.

## Run the compatible Node API locally

```powershell
node --env-file=astra/.env astra/run_gpt_api.js
```

It binds to `127.0.0.1:3082` by default. A hosted Supabase Edge Function cannot reach a workstation
localhost; production use requires a separately authorized private/secured deployment of this API and
then setting `ASTRA_RUNTIME_URL` to that reachable HTTPS origin. This gate did not deploy or change
production secrets.

## GPT Action schema

Import `astra/gpt_supabase_integration/openapi_schema.json` into the GPT Action editor after replacing
`PROJECT_REF` with the real Supabase project reference. Configure Bearer authentication with the same
rotatable GPT-facing key used by the Edge Functions; do not paste that key into the schema file.

## Validation

```powershell
node astra/tests/astra09.test.js
node astra/tests/astra08c.test.js
node astra/tests/astra08b.test.js
node astra/tests/astra07.test.js
node astra/tests/astra05.test.js
node astra/tests/astra04.test.js
```

Core PASS uses deterministic mocks and needs no OpenRouter credit, live LM Studio server, or production
Supabase mutation. Deployment and a live GPT-to-Supabase-to-runtime smoke remain separate operational
steps requiring deployment authorization.
