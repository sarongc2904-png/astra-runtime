# Architecture summary

ASTRA separates conversation, orchestration, knowledge retrieval, and model transport:

1. A brief enters `MARKETING_CAMPAIGN_360`.
2. The orchestrator validates intent and required inputs, plans the fixed campaign nodes, and requests bounded evidence.
3. The read-only Agent V1 adapter retrieves evidence through the frozen Strategy-F pipeline from the canonical knowledge corpus.
4. Method routing selects evidence-backed methods, including the validated Meta Ads and WhatsApp Sales bindings.
5. Eight specialist contracts use one injected LLM runner. The provider factory supplies either OpenRouter or LM Studio without duplicating business logic.
6. The synthesis layer reconciles specialist outputs into the validated 18-section deliverable and preserves limitations and current-research requirements.

The GPT configuration package is only a front-end instruction/reference layer. Agent V1 remains the real knowledge engine. A GPT can invoke ASTRA only through an actual, separately hosted and configured API/action; no such public deployment is included in ASTRA-07.
