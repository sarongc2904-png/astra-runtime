# REPORT_CONTRACT — ASTRA-11K

Modules: `report.js`, `integrity.js`, `engine.js`.

## ExperimentIntelligenceReport (§15) — the 34 sections

`report_metadata · opportunity · evidence_scope · hypothesis · variable_map ·
contamination_status · baseline · metric_contract · primary_metric · secondary_metrics ·
guardrails · guardrail_evaluation · experiment_design · design_conclusion_permitted ·
measurement_contract · risk · time_to_signal · priority · statistical_status · causal_status ·
evaluation · primary_metric_movement · decision · decision_reasons · registry_entry ·
duplicate_id_check · conflicts · unknowns · limitations · integrity_status · boundary ·
evidence_appendix · caveats · section_index`.

- Every section is **either populated or `{ status: 'UNKNOWN' }`** — never silently omitted;
  `section_names.length === 34` always.
- `evidence_graph_valid` is a deterministic check: the hypothesis' `opportunity_id` matches the
  opportunity, and an `ADOPT` decision with a causal claim is backed by a
  `CAUSAL_CLAIM_PERMITTED` policy.

## Boundary section (§ hard constraint)

```
boundary: {
  does_not_execute_experiments: true, does_not_modify_campaigns: true,
  does_not_spend_budget: true, does_not_deploy: true, does_not_write_production: true,
  does_not_feed_production_routing: true, no_autonomous_action: true
}
```

Asserted in every report (W79).

## Integrity attestation — `integrity.js`

`attestIntegrity()` statically scans the engine's own module set for forbidden constructs
(`http`/`https`/`net`/`child_process` requires, `fetch`, `WebSocket`, `supabase`/`createClient`,
`.query(`/`.execute(`, `@vercel`, env secrets) and reports:

```
{ modules_scanned, network_calls: 0, llm_calls: 0, production_db_writes: 0, deploys: 0,
  cost_usd: 0, executes_experiments: false, modifies_campaigns: false, spends_budget: false,
  writes_production: false, issues[], clean }
```

`clean` is `true` when `issues` is empty (W80).

## Reproducibility

`report_id = 'exr_' + sha256(canonical(report without report_id))`; `content_hash ===
report_id`. Identical valid inputs ⇒ identical `report_id` and identical content-addressed
`experiment_id` (W78, C8).

## Caveats (always present)

- ASTRA-11K designs and evaluates experiments; it never runs one.
- The BECAUSE mechanism of a hypothesis is never proven causality.
- No expected lift, significance, causality, sample size, benchmark, conversion, revenue, margin or probabilistic confidence score is fabricated.
- A descriptive before/after difference is never presented as a causal effect.
- Multi-variable contamination makes causal attribution not identifiable.
- INCONCLUSIVE and INSUFFICIENT_EVIDENCE are valid results; no winner is forced.
- No ASTRA-11K output may feed production routing or autonomous action.

## Provenance note

*"Diagnosis → hypothesis → design → priority → evaluation → structured decision. No experiment
is executed. No lift, significance, causality, sample size, benchmark, conversion, revenue,
margin or probabilistic confidence score is fabricated. No LLM. No production routing. No
autonomous action."*
