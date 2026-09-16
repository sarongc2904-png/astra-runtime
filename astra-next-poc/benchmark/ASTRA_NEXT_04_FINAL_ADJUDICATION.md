# ASTRA-NEXT-04 — Final Instrumented Adjudication Evidence

## Run identity

- service: `astra-next-anythingllm-docker-poc`
- Render service id: `srv-dalf0kp42hec73c8oabg`
- deploy: `dep-dalhei9m57gc73dc8n2g`
- evaluated branch: `astra-next-poc`
- runtime commit: `687dfcbd557ac75eb288af6fe85f7d50b5c0f527`
- case: `metodo360_control_v1`
- brief: `ASTRA_NEXT_POC_METODO360_V1`
- knowledge manifest: `ASTRA_NEXT_POC_KB_V1`
- engine: AnythingLLM
- LLM: `openai/gpt-5-mini` via OpenRouter
- embedder: OpenRouter `baai/bge-m3`

## Runtime evidence

The instrumented run completed successfully:

```text
kb_ingestion_complete status=PASS manifest=ASTRA_NEXT_POC_KB_V1 total=7 passed=7 failed=0
campaign360_start case=metodo360_control_v1 manifest=ASTRA_NEXT_POC_KB_V1
ASTRA_NEXT_OPENROUTER_USAGE prompt_tokens=732 completion_tokens=4409 total_tokens=5141 cost=0.009001
ASTRA_NEXT_CAMPAIGN360 http=200 duration_ms=71522 chars=15865 normalized_chars=13038 sources=5 json_valid=true sections=14/14 errors=0
ASTRA_NEXT_CAMPAIGN360 status=PASS
```

Retrieved RAG sources:

1. `01-method-registry.json`
2. `04-knowledge-query-planner.js`
3. `07-meta-ads-extraction-qa.json`
4. `03-multi-domain-ingestion-report.md`
5. `02-knowledge-method-discovery.md`

Exact OpenRouter usage/cost:

- prompt tokens: **732**
- completion tokens: **4,409**
- total tokens: **5,141**
- cost: **$0.009001 USD**
- upstream prompt cost: **$0.000183 USD**
- upstream completion cost: **$0.008818 USD**

## Evaluator schema finding

The first adjudicator versions were too rigid about the model's claim-body key. Real runs returned `assertion` and later `statement`, while the initial evaluator accepted only `text` / `claim`. This caused false `claims=0`, `brief_fidelity_pct=0` results even though the generated JSON visibly contained the canonical brief.

The adjudicator has now been hardened to accept:

```text
text | claim | assertion | statement
```

Current evaluator version: `ASTRA_NEXT_CLAIM_ADJUDICATOR_V1_2`.

No commercial output was rewritten to obtain this correction; only evaluator field normalization changed.

## Deterministic replay of the same logged Campaign360 result

Using the V1.2 normalization semantics on the exact logged result yields:

| Metric | Result |
|---|---:|
| brief_fidelity_pct | **100.00** |
| critical_hallucinations / unsupported FACT-or-EVIDENCE claims | **1** |
| knowledge_grounding_pct | **93.75%** |
| cross_node_contradictions | **0** |
| total classified claims | **52** |
| groundable FACT/EVIDENCE claims | **16** |
| grounded FACT/EVIDENCE claims | **15** |
| qualified INFERENCE/RECOMMENDATION/UNKNOWN claims | **36** |
| unsupported claims | **1** |

### Brief fidelity

All seven canonical facts were preserved in `canonical_brief`:

1. business = infoproduct for estéticas
2. product = mini curso Método 360
3. price = 400 MXN
4. market = México
5. objective = sell/vender the mini course
6. conversion channel = WhatsApp
7. core proposition = teach estéticas how to fill their appointment agenda

`BRIEF_FIDELITY = PASS`

### Hallucination / traceability gate

There is one material item classified as `EVIDENCE` whose claim object does not carry an explicit `evidence_ids` link. The output does contain a separate `evidence_used` section with evidence records, but the current benchmark contract requires claim-level traceability rather than assuming a global association.

Therefore this item is conservatively treated as an unsupported EVIDENCE claim.

`CRITICAL_HALLUCINATIONS = 1`
`HALLUCINATION_GATE = FAIL`

This is primarily a **traceability/schema failure**, not evidence that the canonical business facts drifted.

### Grounding

15 of 16 FACT/EVIDENCE claims are grounded either directly by the canonical brief or by an explicit evidence link under the evaluator's rules:

`15 / 16 = 93.75%`

`KNOWLEDGE_GROUNDING_GATE = PASS` because the contract threshold is `>= 90%`.

### Contradictions

No conflicting price, market, or conversion-channel FACT was detected.

`CROSS_NODE_CONTRADICTIONS = 0`
`CONTRADICTION_GATE = PASS`

## Contract status

```text
ASTRA_NEXT_02_DOCKER_RUNTIME = PASS
ASTRA_NEXT_02_OPENROUTER_CONFIGURATION = PASS
ASTRA_NEXT_02_KNOWLEDGE_INGESTION = PASS
ASTRA_NEXT_03_STRUCTURAL = PASS
ASTRA_NEXT_04_TELEMETRY = PASS
ASTRA_NEXT_04_BRIEF_FIDELITY = PASS
ASTRA_NEXT_04_KNOWLEDGE_GROUNDING = PASS
ASTRA_NEXT_04_CONTRADICTIONS = PASS
ASTRA_NEXT_04_HALLUCINATION_TRACEABILITY = FAIL
ASTRA_NEXT_04_COST_CAPTURE = PASS
ASTRA_NEXT_04_FULL_BENCHMARK = FAIL
```

The full benchmark cannot be declared PASS because the contract requires `critical_hallucinations = 0` and the current output has one unsupported EVIDENCE claim under the deterministic claim-level traceability rule.

The cost-ratio criterion also remains **NOT_ADJUDICATED** because there is not yet a like-for-like legacy ASTRA `metodo360_control_v1` Campaign360 cost baseline. A cost from another ASTRA benchmark case must not be substituted.

## Required remediation for the next gate

For ASTRA-NEXT-05, require every output item classified as `EVIDENCE` to include one or more valid `evidence_ids` that resolve to entries in `evidence_used`. The output schema should also freeze the claim-body key to one canonical field (recommended: `statement`) so evaluator correctness does not depend on model-selected aliases.

After that remediation, rerun the same frozen brief once and require:

- brief fidelity = 100%
- critical hallucinations = 0
- knowledge grounding >= 90%
- contradictions = 0
- 14/14 sections
- no provider/fatal errors

Separately, run the same frozen case through legacy ASTRA if the cost-ratio gate is to be closed.

## Safety / spend control

`RUN_CAMPAIGN360_POC` was returned to `false` after the instrumented run so service restarts do not repeat the paid LLM call automatically.
