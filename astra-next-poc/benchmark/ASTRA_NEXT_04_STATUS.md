# ASTRA-NEXT-04 — Claim Adjudication & Cost Telemetry

## Status

```text
ASTRA_NEXT_04_IMPLEMENTATION = PASS
ASTRA_NEXT_04_INSTRUMENTED_RUN = QUEUED
ASTRA_NEXT_04_FULL_BENCHMARK = PENDING_RUNTIME_EVIDENCE
```

## Implemented

### Deterministic claim adjudicator

File: `astra-next-poc/benchmark/adjudicate_campaign360.js`

Rules:

- `FACT` is supported only when it maps to the immutable canonical brief or carries explicit `evidence_ids`.
- `EVIDENCE` requires one or more `evidence_ids`.
- `INFERENCE`, `RECOMMENDATION`, and `UNKNOWN` are accepted as qualified non-factual claims and are excluded from the factual grounding denominator.
- unsupported `FACT` / `EVIDENCE` claims count as critical hallucinations.
- canonical brief fidelity is checked deterministically across 7 immutable facts.
- cross-node contradiction checks cover price, conversion channel, and market mutations in factual claims.

Metrics emitted:

- `brief_fidelity_pct`
- `critical_hallucinations`
- `knowledge_grounding_pct`
- `cross_node_contradictions`
- total/groundable/grounded/qualified/unsupported claim counts

Pass thresholds remain the benchmark contract thresholds.

### OpenRouter usage telemetry

The POC Docker image patches the AnythingLLM OpenRouter stream adapter to emit:

```text
[ASTRA_NEXT_OPENROUTER_USAGE] {...}
```

capturing the final streaming `usage` object including:

- `prompt_tokens`
- `completion_tokens`
- `total_tokens`
- `cost` when returned by OpenRouter
- `cost_details` when returned

The existing POC-only `OPENROUTER_MAX_TOKENS=8192` cap remains unchanged.

### Bootstrap integration

After a successful Campaign360 JSON parse, the bootstrap now:

1. persists normalized commercial JSON to `/tmp/campaign360.normalized.json`;
2. runs the deterministic adjudicator;
3. emits an `ASTRA_NEXT_ADJUDICATION` summary;
4. emits the complete adjudication artifact in base64 for forensic recovery.

## Git commits

- `4674fad5bd47f70b22c71a87038d823cd40a904e` — deterministic claim adjudicator
- `33209ee4b0536674d6fb0de28643030a66f4da8f` — OpenRouter usage instrumentation + image integration
- `c25ec41df524c66929e01b12ab8d756a935506c5` — bootstrap adjudication integration

## Render runtime state

Service: `astra-next-anythingllm-docker-poc`

Confirmed service state:

- suspended: `not_suspended`
- plan: `free`
- runtime: `docker`
- branch: `astra-next-poc`
- auto deploy: `off`

A previous environment-change deploy (`dep-dalh4vbm8hqs739imsj0`, old commit `c88268d...`) became stuck in `update_in_progress` during AnythingLLM startup. No application error or warning was emitted in the inspected logs. Memory observed for the replacement instance remained below the 512 MB service limit at the sampled points.

The ASTRA-NEXT-04 deploy is queued behind it:

```text
dep-dalh6j9kl7dc73eu8dng
commit=c25ec41df524c66929e01b12ab8d756a935506c5
status=queued
```

`RUN_CAMPAIGN360_POC=true` has been requested for the instrumented one-shot run. After evidence is captured it must be returned to `false` to prevent repeated OpenRouter spend.

## Remaining gate

Do not mark the full benchmark PASS until runtime evidence provides:

- deterministic adjudication output;
- OpenRouter exact usage/cost;
- a comparable legacy Campaign360 cost baseline for the same benchmark case.

The legacy cost ratio must not reuse a non-comparable ASTRA-10AX single-case cost.
