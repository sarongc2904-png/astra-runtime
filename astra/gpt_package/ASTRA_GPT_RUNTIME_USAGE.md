# Runtime usage for a GPT action

The actual local entrypoint is:

```powershell
node --env-file=astra/.env astra/run_campaign_360.js --input "<brief>" --json
```

Before execution, operators can run:

```powershell
node --env-file=astra/.env astra/run_campaign_360.js --health --json
```

A future GPT action would need a separately implemented HTTPS API that securely invokes the same provider abstraction and returns the CLI-equivalent JSON contract. That API/action does not exist merely because this package is uploaded, and ASTRA-07 does not authorize public hosting.

An action client should submit only the user's brief and should consume these fields: `workflow_id`, `status`, `completed_nodes`, `selected_methods`, `provider`, `model`, `final_synthesis`, `current_research_required`, `limitations`, and `usage`. It must branch on `status`: present output only for `COMPLETE`, request inputs for `WAITING_FOR_INPUT`, and surface the reason without manufacturing a campaign for `BLOCKED` or `FAILED`.

Never place OpenRouter or LM Studio credentials in GPT instructions, conversation messages, action payloads, reports, or returned diagnostics.
