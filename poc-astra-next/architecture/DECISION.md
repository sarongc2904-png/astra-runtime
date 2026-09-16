# Runtime decision for POC

Primary runtime under test: `Mintplex-Labs/anything-llm`.

Reason: the POC optimizes for time-to-working-system rather than framework purity. AnythingLLM already supplies document ingestion/RAG, agents, memory, model routing, Agent Flows, MCP, multi-user support, and a developer API. ASTRA contributes the commercial knowledge and acceptance rules.

This is a POC decision, not a production cutover decision.
