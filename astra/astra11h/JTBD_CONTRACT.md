# JTBD_CONTRACT — ASTRA-11H

Modules: `jtbd.js`, `job_statement.js`, `job_outcome.js`. Schema `ucdm-journey-1.0.0`.

## JobToBeDone (§N)

```
{ job_id, schema_version, kind: 'JobToBeDone', job_kind,
  segment_refs[], persona_refs[],
  situation, trigger_context, functional_job, emotional_job, social_job,
  desired_progress, current_alternative, constraints, anxieties, habits_inertia,
  success_criteria, evidence_refs[], confidence, unknowns[] }
```

- **A JTBD is not a persona trait.** It is built from the segment's confirmed-member VoC
  observations + journey triggers + journey alternatives + the ASTRA-11G persona's canonical
  fields.
- Every job carries `evidence_refs`; `validateJob` rejects a job with none (W27). A job with
  zero supporting evidence is **not asserted** (the engine skips it).
- **`functional_job`** may be `OBSERVED` (from desire concepts) or `ANALYTICAL` (reconstructed
  from the primary problem) — always evidence-linked when present (W28).
- **`emotional_job` / `social_job`** are `UNKNOWN` unless there is **explicit customer
  language** (emotional: `PAIN_FEAR / RESULTS_UNCERTAINTY / TRUST_CONCERN`; social: a
  reputation/image phrase). `validateJob` requires `basis === 'OBSERVED'` + evidence for
  either — no "wants to feel successful" fiction (W29, W30, §Q).
- `unknowns[]` lists every field left UNKNOWN; a job whose every field is UNKNOWN raises the
  `LOW_JTBD_COVERAGE` completion reason (W58).

### Job kinds (§S) — never collapsed

`JOB_KINDS` = `BUYING_JOB · USAGE_JOB · IMPLEMENTATION_JOB · RETENTION_JOB · EXPANSION_JOB`.
One customer/segment may hold several — each is a separate `JobToBeDone` with its own
`job_id`. The buying job is never merged with the usage / retention / expansion job
(W39–W42).

## Job statement (§O) — `job_statement.js`

Deterministic template: **"When [situation], I want to [motivation/action], so I can
[desired progress]."** Every component is interpolated from canonical `JobToBeDone` fields via
the controlled `CONCEPT_PHRASE` map. An unknown component renders literally as `[unknown]` —
**never filled with fabricated prose**. `renderJobStatement` is pure; `validateJobStatement`
recomputes the text and rejects any divergence, and rejects age/marital/"feel successful"
filler (W31).

## JobOutcome (§R) — `job_outcome.js`

```
{ outcome_id, desired_outcome, success_criterion, current_performance,
  importance_signal, satisfaction_signal, evidence_refs[] }
```

- Built from OBSERVED VoC observations for the segment; each outcome is evidence-backed
  (`validateJobOutcome`, W37).
- `current_performance` reports a **qualitative** direction (`MEETING / NOT_MEETING / MIXED`)
  from observed sentiment only.
- **`importance_signal` is `UNKNOWN`** and `satisfaction_signal` carries `numeric_score:
  null` — **no fabricated numeric ODI-style score** (`validateJobOutcome` rejects any
  non-null numeric score, W38).

## Forces of progress (§P) — `forces.js`

`FORCES` = `PUSH_OF_CURRENT_SITUATION · PULL_OF_NEW_SOLUTION · ANXIETY_OF_NEW_SOLUTION ·
HABIT_OF_PRESENT`.

Each force is `PRESENT` (with `signal_count`, `concepts`, `evidence_refs`, `strength_basis`)
**only** when its controlled concept signals (or, for PUSH, a `PAIN_ESCALATION`/`FAILURE`
trigger; for HABIT, a `DO_NOTHING`/`DELAY`/`INTERNAL_SOLUTION` alternative) are evidenced —
otherwise `UNKNOWN`. `validateForces` requires a `PRESENT` force to carry evidence.

**`complete_four_force_model` is `true` only when all four are independently evidenced.** The
model is **never padded to four** — `present_forces.length < 4` is reported honestly with
`unknown_forces[]` (W32–W36).
