# ASTRA-11A — RUNTIME BOUNDARY AUDIT — RESULT

**Type:** audit + design documents only. **No code. No frozen file touched. No implementation.**
**Gate state:** no ASTRA-11 authorization exists. Latest authorization = ASTRA-10AX (closed,
`QUALITY_GATE = FAIL`). `READY_FOR_PRODUCTION_ROUTING = FALSE` (unchanged).

## Deliverables (this directory: `astra/astra11a/`)

| # | Requested | File |
|---|---|---|
| 1 | CURRENT_RUNTIME_MAP.md | [`CURRENT_RUNTIME_MAP.md`](CURRENT_RUNTIME_MAP.md) — inventory of the 13 audited capabilities (classifier, askLLM, retrieval, nodes, market_context, measurement, creative_strategy, grounding, answer policy, diagnostics, cost/token tracking, benchmark harness, method selection), execution mode per capability, consolidated frozen list, current gate state |
| 2 | ASTRA_10_TO_11_MAP.md | [`ASTRA_10_TO_11_MAP.md`](ASTRA_10_TO_11_MAP.md) — ASTRA-10 inheritance, 22 ASTRA-11 areas vs current capability (HAVE 3 / PARTIAL 8 / GAP 11), cross-cutting gaps, ordering constraints |
| 3 | ASTRA_11A_RUNTIME_BOUNDARY.md | [`ASTRA_11A_RUNTIME_BOUNDARY.md`](ASTRA_11A_RUNTIME_BOUNDARY.md) — 8 boundary principles, the hybrid pattern, per-capability DET/LLM/HYB classification, build order, non-goals |
| 4 | regression-risk list | [`REGRESSION_RISKS.md`](REGRESSION_RISKS.md) — 13 ranked risks (R1–R13) with guardrails + a per-change checklist |
| 5 | Unified Commercial Data Model proposal | [`UNIFIED_COMMERCIAL_DATA_MODEL_PROPOSAL.md`](UNIFIED_COMMERCIAL_DATA_MODEL_PROPOSAL.md) — provenance rules, ~25 entities, write-guard, read path, persistence options, open questions for ASTRA-11B |

## Headline findings

1. **Two runtime stacks.** Frozen Agent V1 RAG runtime (`knowledge.js` + Strategy-F +
   classifier + answer policy + `gpt-5-mini`) and the ASTRA orchestrator (`astra/src/`).
   ASTRA-11 extends only the orchestrator; Agent V1 is reached solely through the
   read-only `AgentV1Adapter`.

2. **The boundary is already implicit in the code** — ASTRA-11A just names it:
   - **Deterministic runtime owns:** all orchestration/routing/state, all numbers
     (revenue, funnel, CAC/LTV, retention, experiment stats, bottleneck detection),
     identity/versioning/provenance/persistence, gates, caching, the cost ledger.
   - **LLM owns:** interpretation and articulation only — VoC themes, JTBD, persona
     narrative, awareness/sophistication classification, positioning/offer drafts,
     competitor synthesis, hypotheses. Always schema-constrained.
   - **Hybrid is the default for analysis nodes:** LLM proposes → deterministic code
     schema-validates, evidence-ref-checks, provenance-stamps, strips LLM numbers,
     content-addresses + caches, and gates fail-closed.
   - Only 2 areas are "pure LLM" (exec-summary rendering, clarifying questions).
   - **No area is "LLM decides and we trust it."**

3. **11 of 22 ASTRA-11 areas have no runtime primitive** — the biggest are: a durable
   provenance-tagged commercial-fact store (the UCDM spine), a deterministic analytics
   module, a production cost/token ledger, and a journey/CRM state machine.

4. **Two hard ordering constraints:** (a) the ASTRA-10 LLM-specialist benchmark
   `QUALITY_GATE = FAIL` must be resolved (or human-waived) before any ASTRA-11 LLM node
   is promoted to a decision; (b) `READY_FOR_PRODUCTION_ROUTING` stays FALSE until a human
   authorization explicitly flips it.

5. **Recommended ASTRA-11B first build (boundary-driven):** UCDM schema + deterministic
   persistence + provenance → deterministic analytics module → production cost ledger →
   one reference hybrid node (VoC → `VoCTheme[]`) end-to-end with its guard proven.

## Boundaries respected by this task

- No repository file modified except the 6 new documents under `astra/astra11a/`.
- No frozen component inspected-then-changed (inspection only).
- No benchmark rerun, no evaluator change, no matrix change.
- No commits, no push, no deploy, no refactor.
- ASTRA-11 not implemented.

## STOP

ASTRA-11A is complete. Awaiting human authorization for ASTRA-11B (or amendments to this
audit / the UCDM proposal). Do not proceed to implementation.
