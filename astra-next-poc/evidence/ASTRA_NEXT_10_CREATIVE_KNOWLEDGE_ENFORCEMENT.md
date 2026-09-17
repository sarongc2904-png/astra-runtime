# ASTRA-NEXT-10 — Creative Knowledge Enforcement

Status: **PASS**

## Objective

Make creative knowledge retrieval a mandatory runtime precondition rather than an optional prompt convention.

Policy: `NO_CREATIVE_WITHOUT_EVIDENCE`.

A creative deliverable may be generated only after ASTRA NEXT classifies the request, retrieves the required expert knowledge families, and validates evidence coverage. If the knowledge bridge is unavailable or evidence is insufficient, generation is blocked.

## Runtime component

`astra-next-poc/runtime/creative_gateway.js`

The gateway returns one of:

- `READY_WITH_EVIDENCE`
- `BLOCKED_KNOWLEDGE_GAP`
- `BLOCKED_KNOWLEDGE_UNAVAILABLE`
- `BYPASS_NON_CREATIVE`

Maximum evidence context: 12 chunks.

## Verified routing

| Case | Intent | Expected | Result |
|---|---|---|---|
| KG-01 | visual Meta creative | formal design + advertising + current Meta | PASS — 12/12 |
| KG-02 | copy-only headlines | advertising/copy only | PASS — 4/12 |
| KG-03 | Meta creative + Andromeda | formal design + advertising + current Meta + verified Andromeda | PASS — 10/12 |
| KG-04 | non-creative CAC explanation | bypass creative gateway | PASS |
| KG-05 | creative request with KB explicitly unavailable | fail closed | PASS — `BLOCKED_KNOWLEDGE_UNAVAILABLE` |

Final runtime evidence:

```text
[ASTRA_NEXT_10 KG-01] status=PASS gateway_status=READY_WITH_EVIDENCE evidence=12/12 families=["formal_design","advertising","meta_current"] failures=[]
[ASTRA_NEXT_10 KG-02] status=PASS gateway_status=READY_WITH_EVIDENCE evidence=4/12 families=["advertising"] failures=[]
[ASTRA_NEXT_10 KG-03] status=PASS gateway_status=READY_WITH_EVIDENCE evidence=10/12 families=["formal_design","advertising","meta_current","andromeda_local"] failures=[]
[ASTRA_NEXT_10 KG-04] status=PASS gateway_status=BYPASS_NON_CREATIVE evidence=0/12 families=[] failures=[]
[ASTRA_NEXT_10 KG-05] status=PASS gateway_status=BLOCKED_KNOWLEDGE_UNAVAILABLE expected=BLOCKED_KNOWLEDGE_UNAVAILABLE
[ASTRA_NEXT_10_CREATIVE_KNOWLEDGE_ENFORCEMENT] status=PASS passed=5/5 failed=0 llm_calls=0
```

## Defect found and repaired

The first fail-closed control exposed a real bug: explicit empty KB overrides used `||` and therefore fell back to environment credentials. The gateway was changed to nullish override semantics (`??`) so an explicitly unavailable KB remains unavailable and blocks generation deterministically.

## Adjudication

`ASTRA_NEXT_10_CREATIVE_KNOWLEDGE_ENFORCEMENT = PASS`

This gate proves the pre-generation enforcement layer. ASTRA-NEXT-11 extends the same invariant to the externally callable HTTP entrypoint used by future WhatsApp, CRM and API channels.
