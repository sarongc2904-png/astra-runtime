# REGRESSION_RISKS — ASTRA-11A

Risks that ASTRA-11 work could regress something already proven. Ranked by
(likelihood × blast radius). Each carries a guardrail. None of these are being fixed or
built now — this is the watch-list for the ASTRA-11B+ authorizations.

## R1 — Agent V1 / Strategy-F / classifier mutation (CRITICAL)
**Risk:** an ASTRA-11 node needs "slightly different retrieval" or "one more classifier
state" and edits `knowledge.js`, `retrieval_strategy_f.py`, `classifier_decision_cache.js`,
or the classifier prompt/version tags.
**Impact:** invalidates the frozen corpus lineage, the decision cache (every key changes),
the ASTRA-10 benchmark baseline, and the grounded-QA guarantees.
**Guardrail:** all internal-knowledge access via `AgentV1Adapter` only; new evidence
classes live in new modules; adapter's `corpus=kb_chunks_v2`/`pipeline=Strategy-F`
fail-closed check stays. Any need to change Agent V1 → separate authorization, not ASTRA-11.

## R2 — Frozen benchmark harness drift (CRITICAL)
**Risk:** ASTRA-11 adds nodes/models and someone edits `astra/benchmarks/astra10ah/*`
(fixtures, `run_benchmark.js`, `quality_checks.js`, `pricing.js`, `transport.js`).
**Impact:** `freeze.json` hash gate trips; the 12-case baseline and the ASTRA-10AX
adjudication become non-reproducible.
**Guardrail:** ASTRA-11 secondary-node benchmark is a **new directory** under a **new
authorization**; the `10ah` tree is read-only. Recompute `harness_hash`/`fixture_hash`/
`manifest_hash` before any paid run and refuse on drift (existing rule).

## R3 — Promoting an LLM node to a decision while QUALITY_GATE = FAIL (HIGH)
**Risk:** ASTRA-11 wires an LLM analysis node's output into a routing/model/spend
decision before the LLM-specialist evidence-discipline defect (ASTRA-10AX:
`restaurant__creative_strategy__gpt-4.1-mini`, 3 `DIRECTLY_SUPPORTED` mis-citations) is
resolved.
**Impact:** ships the exact defect the benchmark was built to catch, now in a commercial
context (persona/positioning/offer facts).
**Guardrail:** `READY_FOR_PRODUCTION_ROUTING = FALSE` holds; LLM nodes may be *built and
offline-tested* but not promoted; the deterministic guard (schema + evidence-ref +
provenance) is the gate, and it must be proven per node.

## R4 — Provenance dilution across new evidence classes (HIGH)
**Risk:** `EXTERNAL_RESEARCH` (competitor/market) and `USER_PROVIDED_FACTS` (transactions,
reviews) get merged into the same bundle as `INTERNAL_KNOWLEDGE` and the LLM (or
synthesis) launders `INFERENCE` → fact.
**Impact:** the whole grounded-answer guarantee ("we only assert what evidence supports")
breaks silently.
**Guardrail:** `source_class` mandatory on every UCDM field; synthesis preserves it;
deterministic guard rejects a `DIRECTLY_SUPPORTED`/fact-class field without a matching
evidence ref (the ASTRA-10AW check, applied support-class-aware this time).

## R5 — LLM-authored numbers entering the UCDM (HIGH)
**Risk:** a persona/offer/market node returns `"tam": "$4.2B"`, `"cac": 180`,
`"churn": 0.06` and it gets stored.
**Impact:** fabricated commercial metrics presented with the authority of computed ones.
**Guardrail:** P1 — the deterministic guard strips/rejects numeric fields from LLM node
output; numbers only enter via the deterministic analytics module over user-supplied
inputs; schema marks which fields are DET-only.

## R6 — Non-deterministic orchestration from parallel waves + shared state (MEDIUM)
**Risk:** ASTRA-11 adds ~14 nodes; parallel wave execution + a new shared UCDM store
introduces read-after-write races or order-dependent results.
**Impact:** same input → different plan; breaks the "content-addressed determinism"
inheritance.
**Guardrail:** UCDM writes are append-only + content-addressed (decision-cache pattern);
each node reads a frozen snapshot of its dependencies (hardened workflow already passes
`done[]` payloads, not live state); wave membership stays a pure function of the DAG.

## R7 — Context-budget blowout (MEDIUM)
**Risk:** more evidence classes × more nodes → assembled inputs exceed
`context_budgets.js` caps; cost and latency regress; reasoning quality drops (noise).
**Impact:** `CONTEXT_POLICY` "read-minimum-necessary" violated; the router is supposed to
fail-closed on overage but new code paths might bypass it.
**Guardrail:** every new node routes evidence through the query planner + budget check;
budget overage = routing defect, logged, forces a summarize/re-scope pass.

## R8 — Answer-policy bypass on the commercial-plan output path (MEDIUM)
**Risk:** ASTRA-11's larger output schema is emitted without going through
`enforceSufficiencyOutput` / an equivalent guard, so `INSUFFICIENT`/`PARTIAL` states
don't produce the canonical abstention.
**Impact:** a plan is delivered as confident when the evidence was insufficient.
**Guardrail:** every terminal output path (per node and final synthesis) passes a
sufficiency guard; `PARTIAL` appends an evidence-specific limitation; no global
abstention leaks into a `PARTIAL` (existing invariants).

## R9 — Cost ledger only exists in the benchmark (MEDIUM)
**Risk:** ASTRA-11 runs many LLM nodes in production with no hard ceiling — the
`PhysicalRequestLedger` is benchmark-only.
**Impact:** unbounded spend on a multi-node commercial analysis; no per-tenant accounting.
**Guardrail:** ASTRA-11B builds a production ledger *before* the first multi-node LLM
workflow ships; per-workflow and per-tenant ceilings, fail-closed on breach (mirror the
benchmark ledger semantics).

## R10 — `diag.js` left in / turned into a telemetry sink carelessly (LOW)
**Risk:** the temporary `[ASTRA-DIAG]` console tracer becomes the ASTRA-11 telemetry
path and starts logging bodies/keys.
**Impact:** secret leakage; noisy logs.
**Guardrail:** ASTRA-11 telemetry is a new, reviewed contract: timing + counters +
provenance only, never bodies/headers/keys (the `diag.js` doc rule, enforced).

## R11 — Business memory as silent overwrite (LOW→MEDIUM)
**Risk:** "update the customer's ICP" overwrites the stored version.
**Impact:** loss of the prior fact + its provenance; non-auditable drift.
**Guardrail:** append-only versions; a superseding write records the supersession +
reason + actor; conflicts surfaced, never auto-resolved (decision-cache "singular winner,
never overwrite" pattern).

## R12 — Deployment freeze disturbed (LOW, external-blocked anyway)
**Risk:** ASTRA-11 changes to the runtime image / `render.yaml` / `astra-runtime/` while
ASTRA-10R is still externally blocked.
**Impact:** the frozen deploy package no longer matches its evidence.
**Guardrail:** ASTRA-11 code ships in the same image but as additive modules; the ASTRA-10R
package hashes are re-verified; no digest-pin or base-image change without its own gate.

## R13 — Test-suite regression masked (LOW)
**Risk:** 21 `astra/tests/*.test.js` + root RAG/policy tests + `run_all.test.js` (known
35/4 — 4 pre-existing failures) — a new failure gets lost in the known-failing noise.
**Guardrail:** ASTRA-11B records the exact pre-change pass/fail per file; any *new*
failure blocks; the 4 known `run_all` failures (obsolete registry assertion + 3 handoff
doc-section checks) stay explicitly enumerated.

---

## Regression-safety checklist for every ASTRA-11B+ change

- [ ] No file under §3 of `CURRENT_RUNTIME_MAP.md` (frozen list) modified
- [ ] `astra/benchmarks/astra10ah/` byte-identical
- [ ] All internal-knowledge reads via `AgentV1Adapter`
- [ ] Every new fact field carries `source_class`
- [ ] No numeric value originates from an LLM
- [ ] Every LLM node output schema-validated + fail-closed
- [ ] Context budget check on every new evidence path
- [ ] Terminal output passes a sufficiency guard
- [ ] Pre/post `astra/tests` + root test pass/fail recorded, no new failure
- [ ] `READY_FOR_PRODUCTION_ROUTING` unchanged (still FALSE) unless the authorization explicitly flips it
