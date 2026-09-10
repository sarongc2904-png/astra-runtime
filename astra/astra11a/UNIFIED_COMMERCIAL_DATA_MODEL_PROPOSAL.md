# UNIFIED_COMMERCIAL_DATA_MODEL (UCDM) — Proposal for ASTRA-11B

Proposal only. Not a schema to implement now. It exists so the ASTRA-11B authorization has
a concrete target to approve, amend, or reject.

## 1. Purpose

One provenance-tagged, versioned, tenant-scoped representation of everything ASTRA-11
analyzes — so that: the deterministic analytics module, the hybrid analysis nodes, the
synthesis engine, and business memory all read/write the **same** entities, and every
field can be traced to its evidence.

## 2. Design rules (inherited, not invented)

1. **Every field carries provenance.** `{value, source_class, evidence_refs[], confidence, as_of}` — `source_class ∈ {INTERNAL_KNOWLEDGE, EXTERNAL_RESEARCH, USER_PROVIDED_FACTS, INFERENCE, COMPUTED}`. `COMPUTED` is new for ASTRA-11 (deterministic analytics output) and is the **only** class a numeric field may hold besides `USER_PROVIDED_FACTS`.
2. **Append-only, content-addressed versions.** `entity_version_id = sha256(canonical(entity_body without meta))`. A new version never overwrites; it records `supersedes`, `reason`, `actor`. (decision-cache `putIfAbsent` pattern.)
3. **Deterministic identity.** Entity `id` = stable natural key hash (e.g. `tenant + entity_type + slug`). Dedup is a deterministic key match, never fuzzy.
4. **Tenant scoping is mandatory** on every entity and every read.
5. **DET-only fields are marked in the schema.** The write guard rejects a non-`COMPUTED`/`USER_PROVIDED_FACTS` value in a DET-only field.
6. **Conflicts are surfaced, not resolved.** Two live versions with incompatible values → a `Conflict` record; downstream reads see both until a human/authorized step picks one.
7. **No secrets.** Same rule as everywhere: no keys, tokens, raw credentials, or full PII dumps in stored evidence text (redact on ingest).

## 3. Core entities

```
Tenant
  id, name, created_at

EvidenceItem            (the raw material; never mutated after ingest)
  id, tenant_id
  kind: REVIEW | INTERVIEW_TRANSCRIPT | SUPPORT_TICKET | ANALYTICS_EXPORT |
        TRANSACTION_EXPORT | COMPETITOR_PAGE | INTERNAL_DOC | USER_STATEMENT
  source_class            # EXTERNAL_RESEARCH | USER_PROVIDED_FACTS | INTERNAL_KNOWLEDGE
  content_hash, text_redacted, uri_or_label, ingested_at
  # INTERNAL_KNOWLEDGE items reference Agent V1 chunk_ids instead of storing text

ProvenanceValue         (embedded, not a table)
  value, source_class, evidence_refs[]      # -> EvidenceItem.id or Agent V1 chunk_id
  confidence: 0..1, as_of, produced_by      # node id or "deterministic:<module>"

--- MARKET & CUSTOMER ---

MarketProfile           tenant_id; category, trends[PV], tam_notes[PV], constraints[PV]
CompetitorProfile       tenant_id; name, positioning[PV], strengths[PV], weaknesses[PV],
                        pricing_notes[PV]; source_class fixed = EXTERNAL_RESEARCH
VoCTheme                tenant_id; label, description[PV], sentiment,
                        supporting_quotes[{evidence_ref, quote}], frequency_bucket
                        # frequency_bucket is COMPUTED (count of citing EvidenceItems), not LLM
Job (JTBD)              tenant_id; statement[PV], type: FUNCTIONAL|EMOTIONAL|SOCIAL,
                        context[PV], current_solution[PV], linked_voc_themes[]
Persona                 tenant_id; name, narrative[PV], goals[PV], pains[PV],
                        objections[PV], triggers[PV], linked_jobs[]
                        firmographics/demographics -> USER_PROVIDED_FACTS or POR_DEFINIR only
ICP                     tenant_id; qualification_signals[PV], disqualification_signals[PV],
                        fit_thresholds (POR_DEFINIR until USER_PROVIDED_FACTS)
Segment                 tenant_id; name, axis[PV], rule (deterministic predicate),
                        size COMPUTED, metrics{...} COMPUTED
AwarenessAssessment     tenant_id; level ∈ {UNAWARE,PROBLEM_AWARE,SOLUTION_AWARE,
                        PRODUCT_AWARE,MOST_AWARE}, rationale[PV], confidence
SophisticationAssessment tenant_id; stage ∈ {1..5}, rationale[PV], confidence

--- POSITIONING → OFFER → GTM ---

PositioningStatement    tenant_id; frame[PV], alternative[PV], differentiator[PV],
                        proof_points[{claim[PV], proof_ref}], POR_VALIDAR flags
Offer                   tenant_id; core[PV], value_stack[PV], mechanism[PV],
                        risk_reversal[PV], bonuses[PV], price_framing[PV]
                        price/margin/capacity -> USER_PROVIDED_FACTS only
AcquisitionPlan         tenant_id; channels[], per-channel approach[PV];
                        unit_economics{cac, cac_payback, ltv_cac} COMPUTED
Funnel                  tenant_id; stages[], transitions[];
                        stage_metrics{count, conv_rate, dropoff, time_in_stage} COMPUTED
JourneyStage / ContactJourneyState   deterministic state machine per contact
CRMState                tenant_id; contacts[{id, stage, attributes, activities[]}]  DET

--- REVENUE & GROWTH ---

RevenueSnapshot         tenant_id; period; {mrr, arr, new_mrr, expansion_mrr,
                        contraction_mrr, churned_mrr, nrr, arpa}  ALL COMPUTED
RetentionCohort         tenant_id; cohort_period; retention_curve[], logo_churn,
                        revenue_churn  ALL COMPUTED
UpsellPath              tenant_id; from_offer, to_offer, trigger[PV],
                        eligible_count COMPUTED
Bottleneck              tenant_id; location (funnel stage / journey step),
                        lost_volume COMPUTED, lost_value COMPUTED,
                        hypotheses[PV], remedy_options[PV]
Experiment              tenant_id; hypothesis[PV], unit, variants[],
                        assignment: deterministic hash(unit+experiment_id),
                        result{lift, p_value, ci, decision}  ALL COMPUTED

--- MEMORY & AUDIT ---

CommercialFact          tenant_id; entity_ref, field_path, ProvenanceValue,
                        version_id, supersedes, reason, actor, created_at   (append-only)
Conflict                tenant_id; field_path, version_a, version_b, detected_at, status
WorkflowRun             tenant_id; dag, node_results[], cost{tokens, usd},
                        context_budget_usage, gate_events[]
```

`[PV]` = a `ProvenanceValue` (or array of them). `COMPUTED` fields are written **only** by
the deterministic analytics module; the write guard enforces this.

## 4. Write path (the guard)

```
node output (LLM or DET)
  → schema validate (reject unknown fields, wrong types)
  → for each field: check declared source_class is allowed for that field
       - COMPUTED field + non-deterministic producer            → REJECT
       - fact-class value + no evidence_refs                     → REJECT (→ INFERENCE or POR_VALIDAR)
       - numeric value from an LLM node                          → REJECT
  → attach ProvenanceValue (evidence_refs resolved to EvidenceItem/chunk ids)
  → content-address → entity_version_id
  → putIfAbsent (append-only; EEXIST = idempotent no-op)
  → diff vs prior live version → Conflict if incompatible
  → emit CommercialFact rows
```

## 5. Read path

- By entity id (latest live version) or by `entity_version_id` (pinned/reproducible).
- Filtered by `source_class` (e.g. "positioning using only user-provided + computed facts").
- Business memory retrieval = deterministic key/filter/recency query over `CommercialFact`.
- Synthesis reads the pinned version set for a `WorkflowRun` so a plan is reproducible.

## 6. Persistence options (for ASTRA-11B to choose)

| Option | Fit | Notes |
|---|---|---|
| Local JSON files, content-addressed (like `classifier_decision_cache`) | good for single-tenant / offline dev / tests | zero new infra; matches existing pattern; weak multi-tenant querying |
| Supabase table `commercial_facts` (+ RLS by tenant) | production multi-tenant | **new table only** — must not touch `kb_chunks`/`kb_chunks_v2` or existing migrations; its own migration; RLS mandatory |
| SQLite per tenant | middle ground | like the `biblioteca.py` staging pattern |

Recommendation: **start with content-addressed local JSON** for ASTRA-11B (keeps the
offline-testable, no-new-infra property that made ASTRA-04…08 fast), design the Supabase
table in parallel, migrate when multi-tenant is real.

## 7. What this proposal deliberately leaves open for ASTRA-11B

- Exact field lists per entity (above is indicative).
- The deterministic analytics module's formula set (CAC/LTV/NRR definitions) — needs a spec of its own.
- Whether `Persona` and `ICP` are one entity or two (proposed: two).
- Retention/cohort granularity and the canonical `RevenueSnapshot` period.
- The experiment-assignment hash and significance test choice.
- Telemetry/cost-ledger schema (related but separate deliverable).
