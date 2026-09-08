# Limitations

- This package does not contain the Agent V1 corpus, embeddings, classifier cache, or Strategy-F runtime.
- Uploading these Markdown files to a GPT does not grant local-file, database, OpenRouter, or LM Studio access.
- A real GPT-to-ASTRA connection requires an independently authorized API/action and secure credential handling; ASTRA-07 does not deploy one.
- The local CLI accepts plain-text briefs only. `--input-file` reads the file as text and is not broad document ingestion.
- Provider/model availability, credits, context capacity, and structured-output support vary by environment.
- `CURRENT_RESEARCH_REQUIRED` identifies facts that need current external verification. It is not evidence of those facts.
- Agent V1 coverage and the validated method registry bound what ASTRA can support. Missing mandatory evidence produces `BLOCKED`; incomplete briefs can produce `WAITING_FOR_INPUT`.
- ASTRA outputs plans, not guaranteed business results, legal advice, platform certification, or current-platform authority.
