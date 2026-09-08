# Final GPT Action Setup — pending runtime host

1. Deploy `astra/run_gpt_api.js` to a durable HTTPS host with Node 22, Python 3.12, this repository's required runtime files, and outbound access.
2. Configure its server-side ASTRA/OpenRouter variables and a new `ASTRA_GPT_API_KEYS` runtime-to-Edge secret. Do not expose values in client code.
3. In Supabase project `ftoxermwkfebmnrudiuu`, set `ASTRA_RUNTIME_URL` to that HTTPS origin and `ASTRA_RUNTIME_API_KEY` to the matching runtime secret.
4. Verify the three public routes through `https://ftoxermwkfebmnrudiuu.supabase.co/functions/v1/astra-tools/...`.
5. Open the user's existing GPT Action editor and import `astra/deployment_gpt_action/openapi_schema_final.json`.
6. Select Bearer authentication and paste the GPT-facing secret currently on the local clipboard. Its value is intentionally absent from files and chat.
7. Save only after the editor shows the four exact operation IDs: `searchKnowledgeBase`, `runAstraCampaign360`, `runAstraCreativeDirector`, `runAstraCreativeGeneration`.
8. Run the campaign → creative variants → generation scenario. Preserve WAITING/BLOCKED/FAILED/CURRENT_RESEARCH_REQUIRED exactly.

Routing instructions: knowledge lookup uses `searchKnowledgeBase`; full campaign uses `runAstraCampaign360`; concepts/art direction use `runAstraCreativeDirector`; approved generation/revision uses `runAstraCreativeGeneration`. Never bypass a blocked ASTRA result with generic model knowledge.
