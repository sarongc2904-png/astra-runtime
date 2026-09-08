# ASTRA local runtime

ASTRA runs the validated `MARKETING_CAMPAIGN_360` workflow with one provider interface. The supported providers are OpenRouter and an LM Studio OpenAI-compatible local server. Provider choice changes transport only; routing, evidence retrieval, specialist contracts, synthesis, and fail-closed behavior remain shared.

## Prerequisites

- Node.js 20 or newer (validated with Node.js 22.23.2).
- The existing Agent V1/Strategy-F runtime configured for read-only retrieval. If Python is not discoverable, set `STRATEGY_F_PYTHON` to the real Python executable and set `PYTHONIOENCODING=utf-8` and `PYTHONUTF8=1`.
- For OpenRouter: an active key and a model available to that account.
- For LM Studio: LM Studio installed, a model downloaded and loaded, and the Local Model API running.

Copy `astra/.env.example` to `astra/.env`, then fill only the provider values you use. The CLI does not parse `.env` itself; Node 20+ can load it with `--env-file=astra/.env`. Process environment variables also work.

## OpenRouter

Set:

```dotenv
ASTRA_LLM_PROVIDER=openrouter
ASTRA_LLM_MODEL=<openrouter-model-id>
OPENROUTER_API_KEY=<your-key>
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

Check configuration and connectivity without running a campaign:

```powershell
node --env-file=astra/.env astra/run_campaign_360.js --health --json
```

The key is required explicitly. ASTRA does not fall back to project configuration files and never includes the key in diagnostics.

## LM Studio

1. Open LM Studio and download a compatible instruction/chat model.
2. Load the model.
3. Open the Developer or Local Server view and start the OpenAI-compatible server.
4. Read the exact model id from LM Studio or from `http://127.0.0.1:1234/v1/models`.
5. Set:

```dotenv
ASTRA_LLM_PROVIDER=lmstudio
ASTRA_LLM_MODEL=<exact-loaded-model-id>
LMSTUDIO_MODEL=<exact-loaded-model-id>
LMSTUDIO_BASE_URL=http://127.0.0.1:1234/v1
LMSTUDIO_API_KEY=lm-studio
```

`ASTRA_LLM_MODEL` takes precedence; `LMSTUDIO_MODEL` is the provider-specific fallback. The health check validates server reachability, model discovery, configured-model availability, and a minimal structured completion.

## Run a campaign

Text input:

```powershell
node --env-file=astra/.env astra/run_campaign_360.js --input "Create a client acquisition campaign for a laser hair removal clinic."
```

File input uses the file only as the brief; it does not ingest the document:

```powershell
node --env-file=astra/.env astra/run_campaign_360.js --input-file .\brief.txt
```

Machine-readable output:

```powershell
node --env-file=astra/.env astra/run_campaign_360.js --input-file .\brief.txt --json
```

JSON output contains workflow id, status, completed nodes, selected methods, provider/model, final synthesis, research requirements, limitations, and usage. It contains sanitized diagnostics only.

## Failure states

- `CONFIG_INVALID`: provider, URL, model, key, timeout, retry, or token-budget configuration is invalid.
- `CREDENTIALS_UNAVAILABLE`: OpenRouter key is absent.
- `MODEL_NOT_CONFIGURED` / `MODEL_NOT_AVAILABLE` / `MODEL_NOT_LOADED`: the requested model is missing or not exposed by the provider.
- `ENVIRONMENT_NOT_AVAILABLE`: the selected endpoint cannot be reached.
- `WAITING_FOR_INPUT`: the brief lacks required business context; provide the listed inputs.
- `BLOCKED`: required evidence or a mandatory dependency is unavailable. No plan is fabricated.
- `FAILED`: the provider or validated specialist/synthesis contract failed. No partial result should be treated as complete.

`CURRENT_RESEARCH_REQUIRED` is not a failure. It marks current, platform-dependent, or otherwise unsupported facts that must be verified before implementation; ASTRA deliberately does not invent them.

## Troubleshooting

- Run `--health --json` first and check the sanitized status.
- Confirm the base URL includes `/v1` and uses `http` or `https`.
- For LM Studio, confirm the server is running and the configured id exactly matches `/v1/models`.
- For OpenRouter, confirm the key and model are available to the same account; credit/provider restrictions may still block completion.
- If retrieval reports that Python is unavailable, point `STRATEGY_F_PYTHON` at a working Python executable. Do not change Strategy-F to work around an environment issue.
- Increase `ASTRA_TIMEOUT_MS` only for a genuinely slow local model. Retry and output budgets remain bounded.

## Protected boundary

Agent V1 is the real knowledge engine. The CLI uses its existing read-only Strategy-F adapter and `kb_chunks_v2`; this package does not alter retrieval, classifier semantics/cache, corpus, embeddings, answer policy, or Supabase schema. The files in `astra/gpt_package/` are configuration/reference material for a GPT. Uploading them alone does not provide access to the local runtime or reproduce Agent V1 retrieval; that requires a separately implemented and authorized API/action connection.
