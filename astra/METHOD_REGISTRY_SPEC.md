# METHOD_REGISTRY_SPEC — canonical framework catalog

The Method Registry is structured metadata about the methods/frameworks that exist in Agent V1's knowledge base. It is the candidate set the METHOD_ADJUDICATOR reasons over. **It is metadata, not method content** — actual method substance is retrieved from Agent V1 at run time via evidence_refs.

## Entry schema
```json
{
  "method_id": "METHOD_OFFER_DESIGN",
  "method_name": "Offer Design (Grand Slam-style value stacking)",
  "source": "<book/course title>",
  "source_type": "BOOK | COURSE | MODULE | MIXED",
  "domain": "OFFER | FUNNEL | ADS | SALES | COPY | CREATIVE | INFOPRODUCT | COURSE | CRO | RESEARCH | ICP | CONTENT",
  "subdomain": "e.g. high-ticket local services",
  "primary_jobs": ["construct irresistible offer", "value stacking", "risk reversal"],
  "business_stage": ["idea","launch","growth","scale"],
  "funnel_stage": ["awareness","acquisition","activation","conversion","retention"],
  "best_for": ["..."],
  "not_recommended_for": ["..."],
  "required_inputs": ["product","avatar","price band","margin"],
  "expected_outputs": ["offer architecture","guarantee","bonuses"],
  "strengths": ["..."],
  "limitations": ["..."],
  "dependencies": ["METHOD_ICP"],
  "compatible_methods": ["METHOD_FUNNEL","METHOD_COPY"],
  "conflicting_methods": ["<method_id that recommends an opposing move>"],
  "evidence_refs": [{"chunk_id":"...","source_pdf_name":"...","pdf_page_refs":"..."}],
  "confidence": 0.0,
  "mapping_status": "DISCOVERED | PARTIALLY_MAPPED | UNMAPPED",
  "version": "mr-0.1"
}
```

## Mapping status
- `DISCOVERED` — the method is known to exist in the KB but not yet detailed.
- `PARTIALLY_MAPPED` — some metadata + at least one evidence_ref confirmed.
- `UNMAPPED` — placeholder id reserved; **no content asserted**.
Do NOT invent method content before the KB is audited. Unaudited entries stay `DISCOVERED`/`UNMAPPED`.

## Conceptual seed entries (status only — NOT content)
`METHOD_VELOCITY`, `METHOD_SALES_ACCELERATION`, `METHOD_DIGITAL_MARKETING`, `METHOD_OFFER_DESIGN`, `METHOD_CRO`, `METHOD_META_ADS`, `METHOD_WHATSAPP_SALES`, `METHOD_INFOPRODUCT`, `METHOD_COURSE_DESIGN`, `METHOD_CREATIVE_STRATEGY`, `METHOD_ICP`, `METHOD_FUNNEL`, `METHOD_COPY`, `METHOD_CONTENT`, `METHOD_MARKET_RESEARCH`. All seed entries begin `mapping_status: DISCOVERED`, `confidence: 0`, `evidence_refs: []`.

## Population protocol (a later gate: ASTRA method-audit)
1. For each domain, run targeted `AgentV1Adapter.retrieve` queries.
2. Confirm the method exists via retrieved chunks (evidence_refs).
3. Fill metadata ONLY from evidence; leave unknowns null.
4. Promote `DISCOVERED → PARTIALLY_MAPPED → (fully) mapped` as evidence accrues.
5. Never mark `confidence` high without corroborating evidence_refs.
6. `conflicting_methods` must be filled deliberately (this feeds conflict detection).

## Storage (ASTRA-02 skeleton)
`astra/methods/registry.json` (array of entries) + a loader that validates the schema, dedupes by `method_id`, and exposes `getCandidates({domain, funnel_stage, business_stage})`. The loader is read-mostly; edits are versioned (`version` bump) and append-friendly. No benchmark/Agent-V1 coupling.

## Anti-bias rule
The registry MUST NOT encode a global ranking. There is no "best method" field. Superiority is always **task-relative** and decided by the METHOD_ADJUDICATOR. `METHOD_VELOCITY` (or any single method) is never flagged universally best.
