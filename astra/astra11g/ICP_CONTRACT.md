# ICP_CONTRACT — ASTRA-11G

Modules: `icp.js`, `buying_roles.js`.

## IdealCustomerProfile (§N)

Describes the **account / organization** fit — NOT the human buyer (§O). For **B2C**
(`mode !== 'B2B'`) the ICP is `{ status: 'NOT_APPLICABLE', note }` and the pipeline still
produces full BuyerPersonas (W40).

For **B2B**:

```
{ icp_id, schema_version, kind: 'IdealCustomerProfile', status: 'ACTIVE', mode: 'B2B',
  industry, business_model, company_size, revenue_range, employees, geography,
  operational_maturity, marketing_maturity, sales_maturity, technology_maturity,
  problem_severity, urgency, budget_fit, solution_fit, implementation_fit,
  decision_complexity, strategic_fit, disqualifiers[], evidence_refs[], confidence,
  unknowns[] }
```

Every attribute is a field `{ value, status: 'KNOWN', source_class, evidence_refs }` **or**
`{ value: null, status: 'UNKNOWN' }`.

- **`revenue_range` and `employees` are `UNKNOWN` unless supplied** — `validateICP` rejects
  either being `KNOWN` with a non-`USER_PROVIDED` source (W38, W39). Neither is required; the
  field must merely exist.
- `problem_severity` may be `COMPUTED` from evidenced pain patterns; all other fields are
  `USER_PROVIDED` or `UNKNOWN`.
- `unknowns[]` lists every field left UNKNOWN.
- ICP carries **no persona fields** (`functional_pains`, `fears`, `buying_language_refs`, …) —
  the ICP/Persona separation is structural (W37).

## Persona vs ICP (§O)

| | question | entity |
|---|---|---|
| **ICP** | which organization / account should we sell to? | `IdealCustomerProfile` |
| **Persona** | which person / buying role are we communicating with? | `BuyerPersona` |

## Buying committee & roles (§O, §P) — `buying_roles.js`

`BUYING_ROLES` (controlled) = `DECISION_MAKER · ECONOMIC_BUYER · CHAMPION · END_USER ·
INFLUENCER · GATEKEEPER · BLOCKER · UNKNOWN`.

`buildBuyingCommittee({ mode, businessInput })`:

- B2C → `{ status: 'NOT_APPLICABLE' }`.
- B2B → one `BuyingRole` per supplied role, each with `basis ∈ {OBSERVED, ANALYTICAL, UNKNOWN}`.
- **Decision authority is never derived from job title alone.** An authority-bearing role
  (`DECISION_MAKER`, `ECONOMIC_BUYER`) with no `authority_evidence_refs` → `basis: 'ANALYTICAL'`,
  `authority_confirmed: false`, note *"job title '…' alone does not prove decision authority"*
  (W42). `validateBuyingRole` rejects `authority_confirmed: true` without authority evidence.
- **Multiple roles / multiple parties are supported** — `distinct_parties`, `roles_present[]`;
  one person is not assumed to hold every role (W41).

## ICP Fit (§Q) — `icp_fit.js`

Deterministic weighted score over 8 dimensions (`problem_fit, urgency_fit, budget_fit,
solution_fit, geographic_fit, implementation_fit, maturity_fit, strategic_fit`), default
weights `cm-icp-fit-w1`, **caller-configurable** (`weights_version: 'custom'`, W44).

Per-dimension scores are `[0,1]` or `null` (not assessable — the module never invents one).
Output: `dimension_scores`, `covered_dimensions`, `missing_dimensions`, `coverage_weight_mass`,
`total_score` (or **`null`**), `fit_band ∈ {IDEAL, GOOD, MARGINAL, POOR, UNKNOWN}`,
`reason_codes[]`.

**When covered weight-mass < 0.5 the score is not computed** — `total_score: null`,
`fit_band: 'UNKNOWN'`, `reason_codes` includes `INSUFFICIENT_FIT_COVERAGE` (W43, W45).
