# ASTRA-NEXT-03 — Campaign360 POC Benchmark Evidence

## Run

- case: `metodo360_control_v1`
- engine: `AnythingLLM`
- model: `openai/gpt-5-mini` via OpenRouter
- embedding engine: `openrouter`
- embedding model: `baai/bge-m3`
- knowledge manifest: `ASTRA_NEXT_POC_KB_V1`
- workspace: `astra-next`
- branch: `astra-next-poc`
- evaluated commit: `c88268ded11a024609383b927dc3bb8a7b08a205`
- Render deploy: `dep-dalgtobm8hqs739htlag`

## Immutable brief facts checked

- Business: infoproduct for estéticas
- Product: mini curso Método 360
- Price: 400 MXN
- Market: México
- Objective: sell the mini course
- Conversion channel: WhatsApp
- Core proposition: teach estéticas how to fill their appointment agenda

The generated JSON preserved the canonical price, market, objective, conversion channel, product and audience in the `canonical_brief` and final synthesis.

## Runtime evidence

Observed from the successful run:

```text
kb_ingestion_complete status=PASS manifest=ASTRA_NEXT_POC_KB_V1 total=7 passed=7 failed=0
campaign360_start case=metodo360_control_v1 manifest=ASTRA_NEXT_POC_KB_V1
ASTRA_NEXT_CAMPAIGN360 http=200 duration_ms=81301 chars=15218 normalized_chars=14633 sources=5 json_valid=true sections=14/14 errors=0
ASTRA_NEXT_CAMPAIGN360 status=PASS
```

Retrieved source names:

1. `01-method-registry.json`
2. `04-knowledge-query-planner.js`
3. `07-meta-ads-extraction-qa.json`
4. `03-multi-domain-ingestion-report.md`
5. `02-knowledge-method-discovery.md`

## Parser normalization

`openai/gpt-5-mini` returned a `<think>...</think>` wrapper before the JSON in the prior run. The evaluator now removes only that reasoning wrapper before JSON parsing. The commercial JSON body is not rewritten or repaired.

## Structural adjudication

| Metric | Result |
|---|---:|
| HTTP | 200 |
| fatal provider errors | 0 |
| KB ingestion | 7/7 PASS |
| JSON valid after wrapper normalization | PASS |
| required sections | 14/14 = 100% |
| workflow completion | 100% |
| retrieved RAG sources | 5 |
| Campaign360 duration | 81,301 ms |

`STRUCTURAL_EXECUTION = PASS`

## Full result-contract adjudication

The benchmark contract additionally requires:

- `brief_fidelity_pct = 100`
- `critical_hallucinations = 0`
- `knowledge_grounding_pct >= 90`
- `cost_ratio_vs_legacy <= 1.25`

These cannot all be truthfully closed from the current runtime logs alone:

- brief facts appear preserved in the generated output, but a deterministic field-by-field fidelity audit has not yet been recorded as a metric.
- recommendations and inferences are explicitly labeled, but a complete unsupported-claim audit has not yet been run, so `critical_hallucinations` is not formally adjudicated.
- five RAG sources were retrieved, but source count is not equivalent to `knowledge_grounding_pct`; claim-level grounding must be measured.
- AnythingLLM/OpenRouter token counts and cost were not captured by the current bootstrap, so the cost ratio versus legacy cannot yet be computed.

Therefore:

```text
ASTRA_NEXT_03_STRUCTURAL = PASS
ASTRA_NEXT_03_FULL_BENCHMARK = PARTIAL
READY_FOR_CLAIM_LEVEL_ADJUDICATION = TRUE
READY_FOR_COST_COMPARISON = FALSE
```

## Safety / isolation

- legacy ASTRA runtime was not modified.
- no n8n, Supabase, Meta, WhatsApp or production actions were executed.
- `RUN_CAMPAIGN360_POC` was returned to `false` after the successful one-shot run to prevent accidental repeated OpenRouter spend on future restarts.
