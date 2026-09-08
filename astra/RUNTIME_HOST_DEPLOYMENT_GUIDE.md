# Runtime Host Deployment Guide — Render Docker

This guide resumes ASTRA-10R from the completed offline package. Do not rebuild the integration architecture.

## Package

- Blueprint: `render.yaml`
- Dockerfile: `astra/runtime_host/Dockerfile`
- Node lock: `astra/runtime_host/package-lock.json`
- Python lock: `astra/runtime_host/requirements-runtime.txt`
- Runtime entrypoint: `astra/run_gpt_api.js`
- Health path: `GET /health`

## Render configuration

Create the service from the repository Blueprint. Keep every `sync: false` value server-side. Required values are `ASTRA_RUNTIME_API_KEY`, `OPENROUTER_API_KEY`, `ASTRA_LLM_MODEL`, `OPENAI_API_KEY`, and the intended `ASTRA_ALLOWED_PROJECT_IDS`. Do not place values in source, build arguments, logs, or this guide.

Render must build the Dockerfile successfully, start as non-root, bind `0.0.0.0:$PORT`, and report a healthy `https://<service>.onrender.com/health` before wiring Supabase.

## Post-deploy validation order

1. Verify public `GET /health` returns 200 without environment or secret details.
2. Verify each execution route returns 401 with no token and with an incorrect token.
3. Verify each execution route accepts only the configured runtime Bearer token.
4. Run campaign, Creative Director, and Creative Generation directly. Preserve COMPLETE, WAITING_FOR_INPUT, BLOCKED, FAILED, and `CURRENT_RESEARCH_REQUIRED` exactly; never treat a missing image provider as a generated asset.
5. Only after the HTTPS runtime succeeds, set matching Supabase secrets without writing them to disk:
   - `ASTRA_RUNTIME_URL=https://<service>.onrender.com`
   - `ASTRA_RUNTIME_API_KEY=<same runtime-only value>`
6. Re-run all three routes through `https://ftoxermwkfebmnrudiuu.supabase.co/functions/v1/astra-tools/...` and verify the prior 503 is gone.
7. Re-run `search-kb` and every regression/protection check.
8. Complete the still-manual GPT Action import using `astra/deployment_gpt_action/openapi_schema_final.json`.

## Stop conditions

Stop without rotating existing keys if Render requires account/billing/user action, if the build fails, if health is not 2xx, if the runtime leaks data, if any protected hash changes, or if Supabase cannot reach the runtime. Do not use tunnels, temporary proxies, or a different host as a workaround.
