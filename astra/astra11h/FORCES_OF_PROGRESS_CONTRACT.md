# FORCES_OF_PROGRESS_CONTRACT — ASTRA-11H

Module: `forces.js`. Schema `ucdm-journey-1.0.0`. See also `JTBD_CONTRACT.md` §P.

## The four forces

| force | evidenced by |
|---|---|
| `PUSH_OF_CURRENT_SITUATION` | OBSERVED non-negated `PAIN_EXPERIENCED / SLOW_SERVICE / RESPONSIVENESS_COMPLAINT / PROCESS_UNCLEAR`; or a `PAIN_ESCALATION` / `FAILURE_OF_CURRENT_SOLUTION` journey trigger |
| `PULL_OF_NEW_SOLUTION` | OBSERVED `RESULTS_DESIRED / SPEED_NEED / CONVENIENCE_VALUE / QUALITY_PRAISE / PRICE_ACCEPTANCE` |
| `ANXIETY_OF_NEW_SOLUTION` | OBSERVED `PAIN_FEAR / RESULTS_UNCERTAINTY / TRUST_CONCERN` |
| `HABIT_OF_PRESENT` | a `DO_NOTHING` / `DELAY` / `INTERNAL_SOLUTION` journey alternative |

## Output shape

```
{ forces_id, schema_version, kind: 'ForcesOfProgress',
  forces: { <FORCE>: { status: 'PRESENT', signal_count, concepts[], evidence_refs[], strength_basis }
                    | { status: 'UNKNOWN' } },
  present_forces[], unknown_forces[],
  complete_four_force_model: <bool>, note, confidence }
```

## Discipline

- A force is `PRESENT` **only** with evidence; `validateForces` rejects a `PRESENT` force
  with no `evidence_refs`.
- Each force status is exactly `PRESENT` or `UNKNOWN` — there is no "weak"/"assumed" middle.
- **`complete_four_force_model` is `true` only when `present_forces.length === 4`.** ASTRA
  does **not** manufacture a balanced four-force diagram when the evidence supports one or
  two forces — `note` states *"only N of 4 forces are evidenced — the model is NOT padded to
  four"* (W36).
- `strength_basis` is a label (`OBSERVED_SIGNAL_COUNT` / `TRIGGER` / `ALTERNATIVE`), not a
  fabricated numeric magnitude.

## Traceability

W32 push force grounded · W33 pull force grounded · W34 anxiety force grounded ·
W35 habit force grounded · W36 missing force remains UNKNOWN — all in `forces.js`, asserted
by `tests/astra11h.test.js` W32–W36 and the benchmark dimension
*"force-of-progress discipline: no padded four-force model"*.
