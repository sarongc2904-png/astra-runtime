# ASTRA-NEXT-05 — Final Adjudication

## Status

`ASTRA_NEXT_05_QUALITY_GATE = PASS`

`ASTRA_NEXT_05_FULL_BENCHMARK = PARTIAL`

The quality gate passed. The full benchmark remains partial only because the frozen legacy ASTRA baseline for the same `metodo360_control_v1` case has not yet been executed, so `cost_ratio_vs_legacy` cannot be calculated without using a non-equivalent benchmark.

## Runtime evidence

- Repository branch: `astra-next-poc`
- Runtime commit: `5f095bac0dc04b572f00fff4f5b6ade230419257`
- Runtime mode: AnythingLLM synchronous workspace Developer API (`sync-api`)
- Benchmark case: `metodo360_control_v1`
- Knowledge manifest: `ASTRA_NEXT_POC_KB_V1`
- Model: `openai/gpt-5-mini` via OpenRouter
- Embeddings: OpenRouter / `baai/bge-m3`
- KB ingestion: `7/7 PASS`, `0 failed`
- Campaign360 HTTP status: `200`
- JSON valid: `true`
- Required sections: `14/14`
- Retrieved RAG sources: `5`
- Runtime errors: `0`
- End-to-end Campaign360 duration: `63,416 ms`
- Provider generation duration: `55.465 s`

### Retrieved sources

1. `01-method-registry.json`
2. `02-knowledge-method-discovery.md`
3. `04-knowledge-query-planner.js`
4. `03-multi-domain-ingestion-report.md`
5. `07-meta-ads-extraction-qa.json`

## OpenRouter usage

- Prompt tokens: `819`
- Completion tokens: `4,706`
- Total tokens: `5,525`
- Exact OpenRouter cost: `$0.00961675 USD`
- Prompt cost: `$0.00020475 USD`
- Completion cost: `$0.009412 USD`
- Output throughput: `84.8463 tokens/s`

## Claim-level adjudication

Adjudicator: `ASTRA_NEXT_CLAIM_ADJUDICATOR_V1_3`

- `brief_fidelity_pct = 100`
- `critical_hallucinations = 0`
- `knowledge_grounding_pct = 100`
- `cross_node_contradictions = 0`
- `evidence_registry_valid = true`
- Total classified claims: `42`
- Groundable FACT/EVIDENCE claims: `14`
- Grounded FACT/EVIDENCE claims: `14`
- Qualified INFERENCE/RECOMMENDATION/UNKNOWN claims: `28`
- Unsupported claims: `0`

### Gate results

- Brief fidelity: `PASS`
- Hallucination gate: `PASS`
- Grounding gate: `PASS`
- Contradiction gate: `PASS`
- Evidence registry / evidence_ids traceability: `PASS`
- Required sections: `PASS`
- Runtime errors: `PASS`

## Evidence-traceability remediation

ASTRA-NEXT-05 required every claim classified as `EVIDENCE` to include one or more `evidence_ids`, required each referenced ID to resolve to exactly one entry in `evidence_used`, and prohibited classifying a claim as `EVIDENCE` when resolvable evidence was unavailable.

The successful run produced a valid evidence registry with one unique evidence ID, no duplicate evidence IDs, zero unsupported claims, and zero critical hallucinations. This resolves the ASTRA-NEXT-04 traceability failure.

## Benchmark contract disposition

Current comparable quality requirements:

- Brief fidelity `100%`: PASS
- Critical hallucinations `0`: PASS
- Required sections `100%`: PASS
- Fatal/runtime errors `0`: PASS
- Knowledge grounding `>=90%`: PASS (`100%`)
- Cross-node contradictions `0`: PASS
- Evidence traceability: PASS

Pending requirement:

- `cost_ratio_vs_legacy <= 1.25`: `NOT_YET_ADJUDICATED`

A valid cost ratio requires executing the same frozen `metodo360_control_v1` brief on the legacy ASTRA Campaign360 runtime. Costs from unrelated ASTRA-10AX cases must not be used as the baseline.

## Important scope note

This successful run validates Campaign360 through the AnythingLLM synchronous workspace RAG API. It does **not** by itself prove that the multi-node `ASTRA_NEXT_CAMPAIGN360_FLOW_V1` has been materialized and executed as an AnythingLLM Agent Flow. Agent Flow materialization remains a separate POC gate.

## Safe runtime state

After capturing the successful run, `RUN_CAMPAIGN360_POC` was reset to `false` so subsequent Render restarts do not automatically trigger another paid Campaign360 inference.
