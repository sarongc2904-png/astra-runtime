# ASTRA_11A_RUNTIME_BOUNDARY — Runtime Boundary Audit

**Question:** for the ASTRA-11 Commercial Intelligence OS, what must live in deterministic
runtime, what belongs to the LLM, and what must be hybrid?

Design only. No implementation. Ends pending human authorization.

---

## 1. Boundary principles (derived from the existing frozen architecture)

These are not new rules — they are the rules ASTRA-01…10 already enforce, restated so
ASTRA-11 applies them consistently.

| # | Principle | Precedent in the codebase |
|---|---|---|
| P1 | **The LLM never owns a number.** Any value that will be compared, summed, thresholded, or shown as a metric is computed by deterministic code. | `specialists.measurement_cro` leaves targets `POR DEFINIR`; `usage_normalizer` never invents a token count; prompt rule "Never invent benchmark numbers" |
| P2 | **The LLM never owns a routing decision.** Method/model/framework selection is deterministic scoring over metadata + a deterministic gate. | `method_adjudicator` + `method_scorer_v2` (evidence weight < 0.5, conflict detection, `INSUFFICIENT_EVIDENCE` gate); `RETRIEVAL != METHOD SELECTION` (README) |
| P3 | **The LLM never owns state, identity, or storage.** Keys, versions, dedup, persistence, and provenance are deterministic. | `classifier_decision_cache.js` content-addressed keys; `workflow_state.js`; provenance model |
| P4 | **Every LLM output is schema-validated and fail-closed.** No free-text on the critical path without a deterministic guard. | `llm_executor` `validateSchema` + `RETRY_BUDGET=1` + `fail_closed:true`; `rag_answer_policy_runtime` guard; `c3.guardGeneratedOutput` |
| P5 | **An LLM step becomes operationally deterministic via a content-addressed cache.** Same versioned (input) → replay, zero calls. | `classifyEvidenceSufficiency` HIT path |
| P6 | **Evidence classes never merge silently.** `source_class` is preserved end-to-end; INFERENCE is never laundered to INTERNAL_KNOWLEDGE. | `ARCHITECTURE.md` provenance model; synthesis contract |
| P7 | **The runtime does not reach outward.** No scraping, no external fetch on the critical path; external evidence is user-supplied and tagged `EXTERNAL_RESEARCH`. | `RESEARCH_ENGINE_SPEC` source-class separation; Agent V1 adapter is read-only-inward |
| P8 | **Gates fail closed.** Missing evidence, unresolved method, incomplete business info, integrity mismatch → `BLOCKED` / `WAITING_FOR_INPUT` / abstention, never a fabricated pass. | hardened workflow gates; classifier cache fail-closed; answer policy INSUFFICIENT |

### The hybrid pattern (the default for analysis nodes)

```
        ┌─────────────── deterministic ───────────────┐
input → │ assemble bounded evidence bundle (P6, budgets)│
        └──────────────────────┬──────────────────────┘
                               ▼
                 LLM: interpret / articulate / draft   (schema-constrained prompt)
                               ▼
        ┌──────────────────────┴──────────────────────┐
        │ deterministic: schema-validate (P4)          │
        │ evidence-ref check + provenance stamp (P6)   │
        │ numeric fields rejected / recomputed (P1)    │
        │ content-address + cache + version (P3,P5)    │
        │ gate: INSUFFICIENT / conflict → fail closed  │
        └──────────────────────┬──────────────────────┘
                               ▼
                   structured UCDM entity (+ provenance)
```

---

## 2. Per-capability boundary classification

**DET** = deterministic runtime · **LLM** = model on the critical path · **HYB** = hybrid (LLM proposes → deterministic validates/bounds/caches/gates)

### 2.1 Control plane — always DET

| Capability | Mode | Rationale |
|---|---|---|
| Intent analysis → task brief | DET | already DET (`intent_analyzer`, `DETERMINISTIC_TRANSFORM`) |
| Task decomposition → node DAG | DET | already DET (`task_decomposer`) |
| Knowledge query planning | DET | already DET; bounded (P6) |
| Method registry + adjudication + scoring | DET | P2 |
| Model routing (task_class → plan) | DET | P2 |
| Workflow state machine + wave scheduling | DET | P3 |
| Dependency / evidence-required / WAITING_FOR_INPUT gates | DET | P8 |
| Provenance stamping (`source_class`, evidence refs) | DET | P6 |
| UCDM entity keying / versioning / dedup / persistence | DET | P3 |
| Production cost/token ledger | DET | P1 |
| Caching (decision cache pattern, extended to analysis nodes) | DET | P5 |
| Tenant scoping / access control | DET | P3 |

### 2.2 Numeric / analytics — always DET (P1)

| ASTRA-11 area | Mode | What deterministic code computes |
|---|---|---|
| revenue | DET | MRR/ARR, new/expansion/contraction/churned MRR, net revenue retention, ARPA — from user-supplied transactions/subscriptions only |
| retention | DET | cohort retention curves, logo vs revenue churn, survival by cohort |
| upsell (eligibility) | DET | rule-based eligibility (plan, tenure, usage thresholds) |
| funnel | DET | stage counts, stage→stage conversion, drop-off %, time-in-stage |
| bottlenecks (detection) | DET | conversion delta vs target/benchmark, ranked by lost volume × value |
| acquisition (unit economics) | DET | CAC, blended vs paid CAC, CAC payback, LTV\:CAC (LTV from retention math) |
| experimentation (assignment + stats) | DET | deterministic bucket assignment (hash of unit+experiment), sample-size / significance / confidence-interval math |
| segmentation (partitioning) | DET | apply segment rules to a customer set; segment sizes and per-segment metrics |
| customer journey (state) | DET | per-contact stage, transitions, dwell time — a state machine, not a list |
| CRM (state) | DET | contact / stage / activity records, derived rollups |

> **Rule:** an LLM may *name* a metric, *explain* a movement, or *propose* a threshold to a human — it may never emit the metric's value into the UCDM.

### 2.3 Interpretation / articulation — LLM (schema-constrained), then DET guard → HYB overall

| ASTRA-11 area | Node mode | LLM job | Deterministic guard |
|---|---|---|---|
| Voice of Customer | HYB | extract recurring themes / sentiment / language from user-supplied reviews & transcripts | each theme must cite ≥1 source quote (evidence-ref check); no counts invented (P1); schema-valid `VoCTheme` |
| Jobs To Be Done | HYB | articulate functional/emotional/social jobs from VoC + persona evidence | every job `INFERENCE` unless quote-backed; schema-valid `Job` |
| buyer persona (narrative) | HYB | write the persona narrative + qualitative fields | structured fields (firmographics, budget, geography) stay `USER_PROVIDED_FACTS` or `POR DEFINIR`; never fabricated (existing `icp` rule) |
| ICP (fit criteria) | HYB | propose qualification / disqualification signals | signals marked `INFERENCE`; thresholds `POR DEFINIR` |
| awareness level | HYB | classify audience awareness from copy/context | output constrained to the 5-value Schwartz enum; low-confidence → `AMBIGUOUS` (mirrors classifier) |
| market sophistication | HYB | classify stage from competitive language | constrained to 5-stage enum; `AMBIGUOUS` on low confidence |
| positioning | HYB | draft positioning statement (frame / alternative / differentiator) | differentiator claims need proof refs or → `POR VALIDAR` (`c3` claim-guard pattern) |
| offer (structure & copy) | HYB | draft value stack / risk reversal / bonuses / price framing | price, margin, capacity stay `USER_PROVIDED_FACTS`; guarantees not invented (existing `offer` rule) |
| competitors (synthesis) | HYB | synthesize a `CompetitorProfile` from user-supplied evidence | strictly `EXTERNAL_RESEARCH` source_class; never merged with internal knowledge (P6, P7); no in-runtime lookup |
| market research (framing) | HYB | frame market context, trends, assumptions | trends without evidence → `CURRENT_RESEARCH_REQUIRED` (existing `market_context` behavior) |
| segmentation (axes) | HYB | propose candidate segmentation axes / segment names | the actual partition + metrics are DET (§2.2); axes marked `INFERENCE` |
| upsell (paths) | HYB | propose upsell/cross-sell paths from offer + journey | eligibility + sizing are DET (§2.2) |
| retention (diagnosis) | HYB | hypothesize churn drivers from cohort math + VoC | the curves/rates are DET (§2.2); hypotheses `INFERENCE` |
| bottlenecks (hypothesis) | HYB | hypothesize *why* a computed bottleneck exists + remedy options | the bottleneck itself is DET-detected (§2.2); ranked by DET impact |
| experimentation (hypotheses) | HYB | propose experiment hypotheses + variant ideas | assignment + significance are DET (§2.2); "winner" declared by DET stats only |
| creative strategy / creative | HYB | existing `creative_strategy` node + Creative Director | unchanged; hands off to ASTRA-08B/08C |
| final synthesis | DET | — | `synthesis_engine_v2` reconciles LLM node outputs; **no extra LLM call** (existing) |

### 2.4 Pure LLM (no useful deterministic core) — the short list

Only where the deliverable *is* prose and there is no structured artifact to validate against:

- free-text executive summary of an already-structured plan (still: no new facts, no new numbers — a rendering step)
- clarifying-question generation when a gate returns `WAITING_FOR_INPUT`

Everything else that "feels" like an LLM task is actually **HYB** — it produces a UCDM
entity that deterministic code must be able to schema-check and provenance-stamp.

### 2.5 business memory — DET store, HYB write path

| Aspect | Mode |
|---|---|
| storage, keys, versions, retention, tenant scope | DET (P3) |
| retrieval by key / filter / recency | DET |
| deciding *what* is worth remembering from a workflow | HYB (LLM proposes candidate facts → DET dedup against existing versions, provenance required, human-visible) |
| conflict between a new fact and a stored version | DET detects → surfaced (never auto-overwritten; append-only, like the decision cache) |

---

## 3. Boundary summary table

| Layer | Mode | Count of ASTRA-11 areas |
|---|---|---|
| Control plane | DET | all orchestration |
| Numeric / analytics | DET | 10 (revenue, retention, funnel, bottleneck-detection, acquisition econ, experiment stats, segmentation-partition, journey-state, CRM-state, upsell-eligibility) |
| Interpretation / articulation | HYB | 15 (VoC, JTBD, persona, ICP, awareness, sophistication, positioning, offer, competitors, market-research, segmentation-axes, upsell-paths, retention-diagnosis, bottleneck-hypothesis, experiment-hypothesis) |
| Pure prose | LLM | 2 (exec summary rendering, clarifying questions) |
| Business memory | DET store + HYB write | 1 |

**No ASTRA-11 area is "LLM decides and we trust it."** Every LLM output either (a) is
schema-validated + provenance-stamped + cached, or (b) is a rendering of already-validated
structure.

---

## 4. What ASTRA-11B should build first (boundary-driven order)

1. **UCDM schema + deterministic persistence + provenance** (the spine — see `UNIFIED_COMMERCIAL_DATA_MODEL_PROPOSAL.md`).
2. **Deterministic analytics module** (§2.2) — testable offline with fixture transactions/events; zero model calls; this is where P1 lives.
3. **Production cost/token ledger** — `usage_normalizer` → durable sink.
4. **One HYB analysis node end-to-end** (recommend: VoC → `VoCTheme[]`) as the reference implementation of the hybrid pattern, behind its own gate, offline-tested, deterministic guard proven — *before* the LLM-specialist benchmark gate is even relevant, because the guard is what's being validated.
5. Remaining HYB nodes, each behind its own authorized gate, each with a deterministic-baseline comparison, none promoted to a routing/production decision while `QUALITY_GATE = FAIL` / `READY_FOR_PRODUCTION_ROUTING = FALSE`.

---

## 5. Explicit non-goals for ASTRA-11 (boundary edges)

- No in-runtime scraping / crawling / third-party API calls for competitor or market data (P7). Evidence is user-supplied.
- No mutation of Agent V1, Strategy-F, the classifier, the answer policy, the corpus, embeddings, Supabase, or the frozen benchmark.
- No LLM-authored metric, threshold-as-fact, or "the winner is X" verdict.
- No auto-overwrite of a stored commercial fact (append-only + surfaced conflict).
- No flip of `READY_FOR_PRODUCTION_ROUTING` without an explicit human authorization clause.
