# ASTRA_11D_DESIGN — Market Research Engine

**Authorization:** `HUMAN_AUTHORIZATION_ASTRA_11D_MARKET_RESEARCH_ENGINE_2026-09-09`
**Mode:** design + implementation + offline benchmarking. Experimental LLM use permitted
**only** inside the isolated `astra/benchmarks/astra11d/` harness if required — and it was
not required; the core engine is fully deterministic. **No ASTRA-11D output may feed
production routing or autonomous action.**

## 1. Purpose

ASTRA's canonical Market Research Engine: transforms **normalized commercial evidence**
(ASTRA-11C `NormalizedObservation` objects) into **structured, evidence-backed market
intelligence** — facts → aggregates → claims → conflicts → insights → a report.

**Core invariant:** *model knowledge is never observed market evidence.* A `MarketFact` is
`OBSERVED` or `COMPUTED` only. An `INFERRED` observation is excluded from facts and tallied
in `excluded_inferred`.

## 2. Pipeline (as built — `research/engine.js`)

```
MarketResearchRequest          research/request.js      — 12 objectives, UNKNOWN valid
        ↓
ResearchPlan                   research/plan.js         — deterministic; enforceAuthorizedScope() gates any LLM plan
        ↓
Evidence collection            research/source_provider.js — FIXTURE providers only; LIVE providers throw
        ↓
ASTRA-11C ingestion            (reused) ingestion/pipeline.js — provider payloads pass through 11C
        ↓
NormalizedObservations         (from 11C)
        ↓
Market fact extraction         research/market_fact.js  — OBSERVED/USER_PROVIDED obs → OBSERVED MarketFact; INFERRED excluded
        ↓
Conflict detection             research/conflict.js     — VALUE / CATEGORICAL / PRESENCE; status OPEN, never auto-resolved
        ↓
Evidence aggregation           research/aggregate.js    — grouping + COMPUTED roll-up facts ("N of M", ranges)
        ↓
Claim formation                research/market_claim.js — SUPPORTED / PARTIALLY_SUPPORTED / CONFLICTED / INSUFFICIENT; scope gate
        ↓
Market insights                research/insight.js      — evidence-bound findings tied to authorized objectives; never a recommendation
        ↓
Confidence                     (reused) validation/confidence.js — deterministic ConfidenceAssessment on every fact/aggregate/claim
        ↓
MarketResearchReport           research/report.js       — reproducible container; content_hash; no-autonomy caveat
```

`referenceTime` is caller-supplied throughout — the engine never reads the system clock.

## 3. Files created (all new — nothing modified)

`astra/src/commercial/research/` (12 modules, ~1,000 LoC, `crypto` only, **no LLM**):
`request.js` · `plan.js` · `source_provider.js` · `market_fact.js` · `conflict.js` ·
`aggregate.js` · `market_claim.js` · `insight.js` · `report.js` · `engine.js` · `index.js`.

`astra/benchmarks/astra11d/` (isolated harness — **not** `astra10ah`): `README.md` ·
`fixtures.js` (frozen) · `llm_planner.js` (deterministic `mockPlanner` + inert
`llmPlannerStub`) · `run_research_benchmark.js` (**8/8 pass**, zero network/LLM/cost).

`astra/tests/astra11d.test.js` — **21 offline deterministic tests, 21 pass / 0 fail**.

## 4. Reuse (no duplication)

| reused | for |
|---|---|
| ASTRA-11C `ingestion/pipeline.js` + observations | evidence collection → normalized observations (11D invents **no** second ingestion system) |
| ASTRA-11B `validation/confidence.js` | every `ConfidenceAssessment` — deterministic, LLM never invents confidence |
| ASTRA-11B `validation/canonical.js` | all hashing / identity / freezing |
| ASTRA-11B `provenance/provenance.js` | `SOURCE_CLASSES`, `CANONICAL_NUMERIC_CLASSES` |
| ASTRA-11C `ingestion/raw_source.js` `SOURCE_CATEGORIES` | plan's preferred-category validation |

## 5. LLM boundary (spec: "experimental LLM use permitted ONLY inside an isolated harness")

- The **core engine has zero LLM code**. Claim/insight statements are templated
  deterministically (`statement_source: 'deterministic:ucdm/research'`).
- The **only** place an LLM would ever appear is a research *planner* — `llm_planner.js`
  `llmPlannerStub`, which **throws** when invoked. Enabling a real LLM planner needs a
  **separate human authorization** with request/cost ceilings and secret-redaction
  discipline modelled on `astra10ah` (`PhysicalRequestLedger`, fail-fast on 401/403,
  frozen hashes). None of that is wired here.
- If, under that future authorization, an LLM produces a candidate plan, it must pass
  `plan.enforceAuthorizedScope(candidate, request)` — a deterministic gate that fails
  closed on any added objective, widened scope, or sub-minimum threshold. Tested (11D
  test "B", benchmark "B6").

## 6. Scope discipline (spec sections B, E)

- A `ResearchPlan` may only pursue objectives the `MarketResearchRequest` authorized, and
  its scope (`SAMPLE < LOCAL < CATEGORY < GLOBAL`) may not exceed the request's.
- A `MarketClaim` broader than `SAMPLE` scope requires corroboration
  (`SCOPE_MIN_SOURCES`: SAMPLE 2, LOCAL 3, CATEGORY 5, GLOBAL 8) **and** aggregate
  confidence ≥ `plan.min_evidence_coverage`. Thin evidence → scope downgraded to `SAMPLE`
  with a recorded warning, status demoted from `SUPPORTED` to `PARTIALLY_SUPPORTED` — the
  engine never asserts a global claim from a thin local sample.

## 7. Conflict handling (spec section F)

`detectConflicts` compares facts of the same `fact_type` + `subject_ref`. Numeric values
outside a 2% relative tolerance → `VALUE_CONFLICT`; mismatched categoricals →
`CATEGORICAL_CONFLICT`. Every `MarketConflict` is `status: 'OPEN'`, `resolution: null` —
**surfaced, never auto-resolved**. A claim over conflicted facts is `CONFLICTED`.

## 8. Not in this gate

No production integration; no CRM/Meta/WhatsApp; no production Supabase write; no deploy;
no autonomous commercial action; no live web research; no real LLM call; no change to
`READY_FOR_PRODUCTION_ROUTING` (FALSE), the ASTRA-10AX `QUALITY_GATE` (FAIL),
`BENCHMARK_WINNER` (NOT_DECLARED), or any frozen ASTRA-10 artifact (including
`astra/benchmarks/astra10ah/`).
