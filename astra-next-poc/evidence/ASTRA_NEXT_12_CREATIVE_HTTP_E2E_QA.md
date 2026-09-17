# ASTRA-NEXT-12 — Creative HTTP End-to-End QA

Date: 2026-09-17
Branch: `astra-next-poc`
Runtime commit under test: `4c9097bde9f91f9a66dc62628bb366a1e4d518a1`
Render deploy: `dep-dalo5le1egvs73f9ss6g`
Service: `astra-next-anythingllm-docker-poc`

## Objective

Prove that the externally callable protected ASTRA NEXT creative endpoint can complete the full grounded creative path end to end in the live Render environment, not only the dry-run/preflight path validated in ASTRA-NEXT-11.

Validated path:

`HTTP client -> gateway authentication -> creative intent routing -> expert knowledge retrieval -> evidence validation -> grounded generation -> HTTP response -> deterministic E2E adjudication`

## Runtime configuration

The deployment entrypoint runs this QA only when `RUN_CREATIVE_HTTP_E2E_QA=true`.

The gate waits for the local AnythingLLM API to become stable before executing `run_creative_http_e2e_qa.js`. Normal creative QA gates remain independently switchable and were not re-run as part of this deployment.

## Live Render evidence

Observed on the live deployment:

```text
[ASTRA_NEXT_ENTRYPOINT] creative_http_e2e_qa_wait_for_api gate=ASTRA-NEXT-12
[ASTRA_NEXT_ENTRYPOINT] creative_http_e2e_qa_start gate=ASTRA-NEXT-12 api_stable=true
[ASTRA_NEXT_12_CREATIVE_HTTP_E2E] status=PASS http=200 gateway_status="PASS" duration_ms=75996 response_chars=8082 evidence=12/12 families=["formal_design","advertising","meta_current"] sources=5 failures=[] llm_calls=1
[ASTRA_NEXT_ENTRYPOINT] creative_http_e2e_qa_complete rc=0
```

## Acceptance results

| Check | Result |
|---|---|
| live HTTP request completes | PASS — HTTP 200 |
| protected gateway admits valid request | PASS |
| creative path performs actual generation | PASS — 1 LLM call |
| evidence precondition is preserved | PASS — 12/12 |
| required knowledge families are present | PASS — formal design + advertising + current Meta |
| source traceability survives full HTTP path | PASS — 5 sources |
| deterministic E2E failures | PASS — `failures=[]` |
| process exit code | PASS — `rc=0` |

## Adjudication

`ASTRA_NEXT_12_CREATIVE_HTTP_E2E_QA = PASS`

ASTRA-NEXT-10 established mandatory knowledge enforcement, ASTRA-NEXT-11 exposed that invariant through the protected HTTP gateway, and ASTRA-NEXT-12 now proves a complete live HTTP generation request can traverse the full grounded creative stack successfully.

This closes the creative HTTP E2E gate. It does not, by itself, declare the complete ASTRA NEXT POC production-ready; persistence/redeploy guarantees, broader channel integration, operational rate controls, and any remaining benchmark/cost criteria remain separate gates.

## Safety / scope

- Legacy ASTRA was not modified by this QA.
- Campaign360 was not started or restarted.
- No WhatsApp, n8n, CRM, Meta Ads, or other external production action was executed.
- The QA generated one model completion solely for validation of the ASTRA NEXT creative HTTP path.
