# ASTRA-10 Deployment and GPT Action Configuration Report

**Result: BLOCKED after verified partial deployment.**

The exact Supabase project is `marketing-agent-os` (`ftoxermwkfebmnrudiuu`). The CLI was authenticated and the checkout is now linked. `search-kb` version 5 and `astra-tools` version 1 were deployed by API and are ACTIVE. No migrations, table changes, KB writes, or embedding writes occurred.

Live HTTPS evidence: missing/malformed authentication returns 401; CORS preflight returns 204; a newly added non-breaking GPT key authenticated successfully; `searchKnowledgeBase` returned HTTP 200 with two results. The same valid authentication reached `astra-tools`, which returned HTTP 503 with `ENVIRONMENT_NOT_AVAILABLE` because `ASTRA_RUNTIME_URL` and `ASTRA_RUNTIME_API_KEY` are missing.

The public ASTRA runtime cannot be deployed directly to Supabase Edge: the validated path needs CommonJS Node, repository files, and Python Strategy-F. No compatible durable hosting target exists in this checkout/environment. A local OpenRouter health probe returned READY, but one real local campaign attempt exceeded 70 seconds without a response and was stopped; no campaign PASS is claimed.

Production creative generation was hardened so the HTTP adapter forces the live-provider path unless a test explicitly injects a mock. With no live image provider, it returns an honest blocked environment state and cannot fabricate an asset.

The exact ready-to-paste schema is `astra/deployment_gpt_action/openapi_schema_final.json`. Direct GPT UI configuration was unavailable and the specific existing GPT was not identified, so `GPT_ACTION_CONFIGURED=FALSE`. The Bearer key was placed on the user's local clipboard without printing or persisting its value.

ASTRA_10_DEPLOYMENT_AND_GPT_ACTION_CONFIGURATION = BLOCKED  
SUPABASE_DEPLOYMENT_VALID = TRUE  
PUBLIC_ENDPOINT_VALID = FALSE  
GPT_ACTION_CONFIGURED = FALSE  
SEARCH_KB_LIVE_VALID = TRUE  
GPT_CAMPAIGN_LIVE_VALID = FALSE  
GPT_CREATIVE_DIRECTOR_LIVE_VALID = FALSE  
GPT_CREATIVE_GENERATION_LIVE_VALID = FALSE  
AUTHORIZATION_VALID = TRUE  
STATE_PROPAGATION_VALID = FALSE  
SECURITY_VALID = TRUE  
AGENT_V1_PROTECTED = TRUE  
CODEX_HANDOFF_OPERATIONAL = TRUE  
ASTRA_READY_FOR_CHATGPT_USE = FALSE
