# CONTEXT_POLICY — READ_MINIMUM_NECESSARY_CONTEXT

ASTRA must never receive the full knowledge base by default. Every layer reads the minimum context needed for its subtask. This controls cost, latency, and reasoning quality (less noise → better decisions).

## Core rule
**READ_MINIMUM_NECESSARY_CONTEXT.** Prefer targeted retrieval, structured summaries, and content-addressed intermediate artifacts over raw dumps. A specialist receives only the evidence relevant to its work unit.

## Budgets (indicative; tune in ASTRA-02, keep conservative)
| context slice | budget (chars) | notes |
|---|---|---|
| task brief | ~2,000 | normalized, not the raw transcript |
| retrieved evidence per work unit | ~8,000 | Agent V1 top5 already ~6–7k; cap and truncate deterministically |
| method metadata per adjudication | ~3,000 | candidate entries only, not the whole registry |
| upstream specialist outputs (downstream_payload) | ~2,000 each | compact payloads, not full working text |
| final synthesis working set | ~16,000 | assembled from payloads + decisions, not raw evidence |

## Mechanisms
- **Targeted retrieval:** KNOWLEDGE_QUERY_PLANNER emits specific queries; never "retrieve everything."
- **Summaries:** long specialist outputs are summarized (LOW_COST_EXECUTION) into `downstream_payload` before handoff.
- **Structured intermediate artifacts:** decisions/assumptions/evidence stored as fields, not prose.
- **Content-addressed handoffs:** bundles referenced by id/hash; a specialist pulls only its referenced bundle.

## Provenance is never dropped to save space
Truncation may shorten evidence text but must preserve `source_class`, `chunk_id`, `source_pdf_name`, `pdf_page_refs`. If a citation would be lost by truncation, keep the citation and drop body text instead.

## Enforcement
The router refuses to dispatch a specialist whose assembled input exceeds its budget (fail-closed) and requests a summarization/re-scope pass instead. Budget overages are a routing defect, logged in `cost_usage`.
