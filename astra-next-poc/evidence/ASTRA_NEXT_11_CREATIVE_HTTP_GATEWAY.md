# ASTRA-NEXT-11 — Protected Creative HTTP Gateway

Status: **PASS**

## Objective

Expose one protected external entrypoint for future WhatsApp, CRM and API clients while preserving the mandatory creative knowledge policy established in ASTRA-NEXT-10.

Endpoint:

`POST /astra-next/creative`

Authentication uses a dedicated runtime secret supplied through the `x-astra-next-gateway-key` header. The secret is stored only in runtime environment configuration and is not committed to the repository.

## Enforcement path

`external client -> protected HTTP gateway -> creative intent router -> expert knowledge retrieval -> evidence validation -> grounded Creative Director`

A creative request cannot proceed to generation unless the knowledge preflight returns `READY_WITH_EVIDENCE`.

## Runtime behavior

- invalid gateway credential -> `401 UNAUTHORIZED`
- creative request with sufficient evidence -> `READY_WITH_EVIDENCE`
- non-creative request -> `422 NOT_CREATIVE_REQUEST`
- unavailable/insufficient required knowledge -> fail closed before generation
- `dry_run=true` performs authentication, routing and grounding validation without an LLM call

## Final deterministic QA

```text
[ASTRA_NEXT_11 HG-01] status=PASS http=401 gateway_status="UNAUTHORIZED"
[ASTRA_NEXT_11 HG-02] status=PASS http=200 gateway_status="READY_WITH_EVIDENCE" evidence=12 families=["formal_design","advertising","meta_current"]
[ASTRA_NEXT_11 HG-03] status=PASS http=422 gateway_status="NOT_CREATIVE_REQUEST"
[ASTRA_NEXT_11_CREATIVE_HTTP_GATEWAY] status=PASS passed=3/3 failed=0 llm_calls=0
[ASTRA_NEXT_ENTRYPOINT] creative_http_gateway_qa_complete rc=0
```

## Security properties

- dedicated gateway credential; no reuse of legacy ASTRA credentials
- timing-safe key comparison
- no secret values emitted to logs
- external caller never receives internal AnythingLLM authentication material
- evidence preflight occurs before any model generation

## Adjudication

`ASTRA_NEXT_11_CREATIVE_HTTP_GATEWAY = PASS`

The endpoint is suitable as the controlled ASTRA NEXT creative entrypoint for the later WhatsApp/n8n and CRM integrations. A full generation request may use the same endpoint with `dry_run` omitted; the gateway then forwards only the grounded instruction to the ASTRA NEXT AnythingLLM workspace.
