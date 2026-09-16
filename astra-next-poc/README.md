# ASTRA NEXT POC

Status: ASTRA-NEXT-01 — Knowledge Freeze & Campaign360 POC Foundation

## Goal
Validate whether AnythingLLM can execute the Campaign360 intelligence with sufficient fidelity while preserving ASTRA knowledge and removing most custom runtime infrastructure.

## Non-goals
- No production changes
- No n8n changes
- No Supabase writes
- No Meta or WhatsApp execution
- No modification of ASTRA legacy runtime

## Baseline
Legacy ASTRA remains the frozen control via `runAstraCampaign360` / `/functions/v1/astra-tools/campaign-360`.

## First benchmark
- Business: infoproduct for beauty/aesthetic businesses
- Product: Método 360 mini course
- Price: 400 MXN
- Market: Mexico
- Objective: sell the mini course
- Conversion channel: WhatsApp
- Promise: teach beauty/aesthetic businesses to fill their appointment calendar

## POC sequence
1. Freeze representative knowledge sample.
2. Define immutable canonical brief.
3. Rebuild only Campaign360 as an AnythingLLM Agent Flow.
4. Run legacy and new paths with the same model, brief and knowledge sample.
5. Compare fidelity, grounding, completion, cost, requests, retries and failures.

## PASS gate
- brief_fidelity = 100%
- critical_hallucinations = 0
- required_sections = 100%
- workflow_completion = 100%
- fatal_errors = 0
- knowledge_grounding >= 90%
- cost <= legacy ASTRA x 1.25
