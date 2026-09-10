# COST_REVENUE_UNIT_ECONOMICS_CONTRACT — ASTRA-11J

Modules: `cost.js`, `unit_economics.js`, `revenue.js`, `margin.js`, `break_even.js`, `ltv.js`,
`payback.js`, `roas_mer.js`.

## CommercialCost (§J) — `cost.js`

`COST_TYPES` (12): `MEDIA_SPEND · SALES_COST · FULFILLMENT_COST · SOFTWARE · AGENCY_FEE ·
COMMISSION · DISCOUNT · PAYMENT_FEE · SUPPORT_COST · VARIABLE_COST · FIXED_COST · OTHER`.
Status `OBSERVED / USER_PROVIDED / COMPUTED / UNKNOWN`. `validateCost` rejects a non-UNKNOWN
cost with no amount and any negative amount. **ASTRA never invents a cost** (W23, W24).
`costCoverage` reports which acquisition cost types are present / missing.

## CPL / CPA / CAC (§K) — `unit_economics.js`

Three **distinct** metric objects (`distinct_from_other_acquisition_metrics: true`):

| metric | formula | notes |
|---|---|---|
| `CPL` | `MEDIA_SPEND / valid_leads` | UNKNOWN without media spend or a valid lead count |
| `CPA` | `sum(configured cost types) / actions` | cost types are caller-configured (`cpa_cost_types`) |
| `CAC` | `sum(declared acquisition cost types) / new_customers` | see below |

**CAC does not silently default to "ad spend / customers".** When the business declares
acquisition cost types (`declared_acquisition_cost_types`) and one is not supplied, CAC is
`COMPUTED_PARTIAL` with `is_lower_bound: true` and a note naming the missing types.
`validateUnitEconomic` rejects a clean `COMPUTED` CAC that has missing declared types
(W20–W22, W27).

## RevenueObservation + AOV / ARPU / ARPA (§L §M) — `revenue.js`

`REVENUE_TYPES` = `GROSS · NET · RECURRING · ONE_TIME · EXPANSION · REFUND · DISCOUNT · TAX`.
Each observation keeps its own type, order/customer/account/user counts, cohort and period
(W28).

- **`deriveNetRevenue`** returns `COMPUTED` only when `gross` is present and every adjustment
  the business marks `*_applicable` is supplied; otherwise `UNKNOWN` with the missing
  component. **Net revenue is never silently derived** (W29–W31). A business-asserted `NET`
  observation stays `USER_PROVIDED` — ASTRA does not relabel it.
- **`aov` / `arpu` / `arpa`** each require their OWN denominator (`order_count` / `user_count`
  / `account_count`) and a positive value; missing → `UNKNOWN` with the precise reason. They
  are never substituted for one another (W32–W35).

## Margins (§N) — `margin.js`

`gross_margin` = `revenue − COGS`; `contribution_margin` = `revenue − variable cost`. Both
COGS and variable cost must be **USER_PROVIDED**; absent → that margin is `UNKNOWN` (no cost
is assumed). `distinct: true` — `validateMargins` requires the two to be represented
distinctly and rejects a COMPUTED margin without its supplied cost (W36–W38).

## Break-even (§O) — `break_even.js`

`break_even_cac` = first-order contribution (`revenue_basis × contribution_margin_ratio`);
`break_even_roas` = `1 / contribution_margin_ratio`; `allowable_acquisition_cost` uses a
supplied lifetime contribution when given, else the first-order contribution. **Only computed
with a USER_PROVIDED contribution-margin ratio and a revenue basis** — else `UNKNOWN`
(W39–W41).

## LTV (§P) — `ltv.js`

`LTV_METHODOLOGIES` = `OBSERVED_COHORT_LTV · HISTORICAL_AVERAGE_LTV · MODELLED_LTV ·
USER_PROVIDED_LTV`. Status `OBSERVED / COMPUTED / MODELLED / USER_PROVIDED / UNKNOWN`.

- `OBSERVED_COHORT_LTV` = `cohort cumulative revenue / cohort customers` — labelled *"a floor,
  not a lifetime projection"* over its window (W45).
- `MODELLED_LTV` (e.g. ARPU / churn) is **only computed when `authorized: true`** and inputs
  valid; it is labelled `MODELLED` / `is_modelled: true` — **never OBSERVED**. Without
  authorization → `UNKNOWN` (`MODEL_NOT_AUTHORIZED`) (W42–W44). `validateLTV` enforces the
  labelling.

## Payback (§Q) — `payback.js`

CAC payback (months) = `CAC / monthly_contribution_margin` (or `monthly_revenue ×
contribution_margin_ratio`). **Only computed with a complete CAC** (not a lower bound) **and a
valid contribution-margin cadence** — else `UNKNOWN` with the reason (W46–W48).

## ROAS / MER (§R) — `roas_mer.js`

`ROAS` = `attributed_revenue / ad_spend` — **requires a non-UNKNOWN attribution basis**, which
it carries. `MER` = `total_revenue / total_media_spend` (blended, no attribution). Both carry
`interchangeable_with_the_other: false`; `validateAdEfficiency` rejects a computed ROAS with an
UNKNOWN attribution basis and rejects interchangeability (W49, W50).
