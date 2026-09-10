# astra/benchmarks/astra11d — ASTRA-11D isolated benchmark harness

**Isolated. Offline. Mock-only.** This directory is NOT `astra/benchmarks/astra10ah/`
(which is frozen and hash-gated) and does not touch it.

## What it is

An isolated harness to (a) benchmark the deterministic Market Research Engine over frozen
fixtures, and (b) hold the *contract* for an **experimental** LLM research planner.

## What it does NOT do

- No real LLM call. `llm_planner.js` ships a **deterministic mock planner** only. A real
  LLM planner slot exists but `collect()`/`plan()` on it throws unless a transport is
  injected — which requires a **separate human authorization** with request/cost ceilings
  and secret-redaction discipline modelled on `astra10ah` (`PhysicalRequestLedger`,
  fail-fast on 401/403, frozen hashes). None of that is enabled here.
- No web, no network, no production Supabase, no deploy.
- No output feeds production routing or autonomous action.

## Files

| file | purpose |
|---|---|
| `fixtures.js` | frozen research fixtures — 5 simulated competitor sources (ads, prices, guarantees), customer reviews (aspect-tagged), a directory listing with a deliberate price conflict, and one INFERRED observation that must be excluded from MarketFacts |
| `llm_planner.js` | `ResearchPlanner` interface + `mockPlanner` (deterministic) + `enforceAuthorizedScope` re-export; `llmPlannerStub` throws |
| `run_research_benchmark.js` | runs the deterministic engine over the fixtures and scores: determinism, fact extraction, INFERRED exclusion, conflict detection, claim scope gating, planner-scope enforcement |

## Run

```
node astra/benchmarks/astra11d/run_research_benchmark.js
```

Prints `ASTRA11D_BENCHMARK_RESULT pass=N fail=M`. Exit 1 on any failure. Zero network,
zero LLM, zero cost.
