# VERTICAL_SLICE_360 — MARKETING_CAMPAIGN_360 (first end-to-end workflow)

The first workflow to implement (in ASTRA-02+). It proves the orchestrator architecture end-to-end before adding all specialist modules. **Design only here.**

## Input example
"Create a client-acquisition campaign for a laser hair removal clinic."

## Required flow (DAG)
```
1. INTENT_ANALYSIS ................ TASK_BRIEF
2. MARKET_RESEARCH_DECISION ....... external_research_needed? (competitor/pricing/consumer language now)
3. KNOWLEDGE_RETRIEVAL ............ targeted Agent V1 queries per unit (read-only adapter)
4. METHOD_ADJUDICATION ........... primary/secondary/rejected/hybrid per unit
5. ICP ........................... target customer, pains/desires/objections
6. OFFER ......................... irresistible offer, guarantee, price framing
7. FUNNEL ........................ acquisition→conversion sequence
8. CREATIVE_STRATEGY ............. angles, hooks, visual direction
9. AD_ANGLES / COPY .............. Meta Ads angles + copy variants
10. WHATSAPP_CONVERSION_FLOW ..... appointment-booking conversation flow
11. MEASUREMENT_PLAN ............. KPIs, targets POR DEFINIR until data, tracking
12. FINAL_SYNTHESIS .............. one coherent 360 plan, conflicts resolved, provenance preserved
```
Dependency edges (examples): 6 Offer ← 5 ICP; 7 Funnel ← 6 Offer, 5 ICP; 9 Ads ← 6,7,8; 10 WhatsApp ← 7; 11 Measurement ← 7,9,10; 12 Synthesis ← all.

## What this slice must prove
1. Intent → brief extraction works on a real, messy request.
2. Research decision correctly fires (competitor/pricing/consumer-language for a local clinic likely `external_research_needed = TRUE`).
3. Targeted retrieval via the **read-only** Agent V1 adapter returns Strategy-F evidence with provenance and sufficiency.
4. **Method adjudication** picks a governing method per unit and records rejected methods + any conflict resolution (e.g. aggressive capture vs qualify-first for a high-consideration service).
5. Specialists run in DAG order, each honoring its adjudicated method and bounded knowledge bundle (specialists may be **thin stubs** in the first slice — the point is the orchestration, not full specialist depth).
6. Synthesis resolves contradictions and preserves methodology + provenance + assumptions + open questions.
7. MODEL_ROUTER keeps HIGH_REASONING to adjudication/synthesis; cheaper tiers elsewhere.
8. WORKFLOW_STATE is written at each step (resumable; Codex could continue mid-run).

## Acceptance signals for the slice (ASTRA-02+ gates)
- No full-KB dump (CONTEXT_POLICY honored).
- No silent method averaging; every conflict has a recorded outcome.
- Provenance intact end-to-end; source_class never laundered.
- Deterministic portions reproduce; caches used.
- Agent V1 untouched (read-only), verified by adapter allow-list + fingerprint markers.

## Scope discipline
The first slice may stub specialists with minimal, contract-compliant outputs. Full specialist depth is later gates (ASTRA-03+). Do NOT build all 13 specialists to prove the architecture.
