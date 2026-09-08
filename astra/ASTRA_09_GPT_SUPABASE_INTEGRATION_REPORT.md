# ASTRA-09 GPT + Supabase Integration Report

**Gate:** ASTRA_09_GPT_SUPABASE_INTEGRATION  
**Authorization:** HUMAN_AUTHORIZATION_ASTRA_09_GPT_SUPABASE_INTEGRATION_2026-09-07  
**Result:** PASS (implementation and offline integration validation)

## Outcome

ASTRA now has a four-action GPT contract. The existing hybrid Supabase `search-kb` function remains the
narrow lookup action. Three new GPT routes use an authenticated Supabase Edge gateway and a compatible
Node API adapter to call the existing campaign, Creative Director, and Creative Generation runtimes.
No ASTRA reasoning was rebuilt in the GPT or Edge Function.

Discovery showed that direct execution inside the existing Edge context is not compatible: Supabase
Edge runs Deno, while the validated ASTRA runtime is CommonJS/Node and its Agent V1 adapter invokes
local Strategy-F/Python. The minimal correct boundary is therefore Edge authentication/routing followed
by a narrow Node runtime API. No second knowledge backend was created.

## Security and data

Bearer keys are compared server-side; runtime and provider keys are never returned. Input/body sizes,
enums, tool names, and project authorization are fail-closed. Errors are sanitized, stack traces are not
returned, and the Edge gateway has no shell or arbitrary filesystem capability. Project IDs use an
injected ownership verifier or explicit server-side allowlist and return the same 403 message regardless
of existence.

No appropriate integration-history table existed, and persistence is not required for tool correctness.
The adapter exposes an optional metadata-only persistence sink. No schema migration, database write,
knowledge duplication, binary duplication, deployment, or production secret mutation was performed.

## Validation

- ASTRA-09: 24/24 PASS.
- ASTRA-08C: 23/23 PASS.
- ASTRA-08B: 36/36 PASS.
- ASTRA-07: 23/23 PASS.
- ASTRA-05: 24/24 PASS.
- ASTRA-04: 20/20 PASS.
- ASTRA-02 aggregate after final handoff: 38 PASS / 1 known obsolete registry assertion. Both handoff
  checks PASS and `handoff operational=true`.
- Protected ASTRA-07 SHA-256 values match for `knowledge.js`, `classifier_decision_cache.js`,
  `retrieval_strategy_f.py`, and `rag_answer_policy_runtime.js`.

`COMPLETE`, `WAITING_FOR_INPUT`, `BLOCKED`, `FAILED`, and `CURRENT_RESEARCH_REQUIRED` were each verified
without semantic collapse. Creative generation completed with the deterministic mock; no live image was
faked. Live deployment was outside this gate, so production reachability is explicitly not claimed.

## Final flags

ASTRA_09_GPT_SUPABASE_INTEGRATION = PASS  
GPT_CAMPAIGN_TOOL_VALID = TRUE  
GPT_CREATIVE_DIRECTOR_TOOL_VALID = TRUE  
GPT_CREATIVE_GENERATION_TOOL_VALID = TRUE  
SEARCH_KB_COMPATIBILITY_VALID = TRUE  
GPT_ACTION_SCHEMA_VALID = TRUE  
AUTHORIZATION_VALID = TRUE  
STATE_PROPAGATION_VALID = TRUE  
SECURITY_VALID = TRUE  
SUPABASE_INTEGRATION_VALID = TRUE  
AGENT_V1_PROTECTED = TRUE  
CODEX_HANDOFF_OPERATIONAL = TRUE  
ASTRA_READY_FOR_GPT_USE = TRUE

`ASTRA_READY_FOR_GPT_USE` means the integration package and contracts are operational and validated.
Actual public GPT use still requires the separately authorized deployment/configuration described in the
guide.
