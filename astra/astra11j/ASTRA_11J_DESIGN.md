# ASTRA-11J — Funnel + Revenue Intelligence Engine — DESIGN

**Mode:** DESIGN + DETERMINISTIC IMPLEMENTATION + ISOLATED OFFLINE BENCHMARKING.
**Boundary:** No ASTRA-11J output may feed production routing or autonomous action.
Deterministic only — no LLM, no network, no DB, no clock (`referenceTime` caller-supplied).
Reuses ASTRA-11B/C/D/E/F/G/H/I; creates **no** parallel market, customer, journey, offer,
evidence, provenance or commercial-identity system.

## Pipeline

```
business-supplied funnel counts / costs / revenue (+ optional 11H/11I refs)
  -> FunnelObservations            funnel_observation.js
  -> scope-validated transitions   transition_metrics.js (uses scope_validation · time_window · cohort · channel)
  -> volume / efficiency summary   dropoff.js
  -> costs / unit economics        cost.js · unit_economics.js
  -> revenue / AOV-ARPU-ARPA / margin   revenue.js · margin.js
  -> LTV / payback / ROAS-MER / break-even   ltv.js · payback.js · roas_mer.js · break_even.js
  -> sales / booking / commerce funnels   sales_pipeline.js · booking_funnel.js · commerce_funnel.js
  -> retention / expansion         retention.js
  -> baselines / deltas            internal_baseline.js · delta.js
  -> bottlenecks / leakage / opportunity value   bottleneck.js · revenue_leakage.js
  -> diagnosis / priority          diagnosis.js · priority.js
  -> completion / report           completion.js · report.js · engine.js
```

`engine.runFunnelRevenue({ businessInput, referenceTime })` is the single orchestrator.
Every stage validates fail-closed.

## Modules (`astra/src/commercial/funnel_revenue/` — 31 modules, ~1,964 LoC, `crypto` only)

| module | responsibility | § |
|---|---|---|
| `funnel_model.js` | configurable `CommercialFunnel`; 30+ `STAGE_TYPES`; no mandatory stage; unknown stage keeps its key | A |
| `funnel_observation.js` | `FunnelObservation` (OBSERVED/USER_PROVIDED/COMPUTED/UNKNOWN); dedupe | B |
| `scope_validation.js` | `compareScope` (period + cohort + channel + segment/offer/geography + currency); `denominatorState` | C |
| `time_window.js` | `normalizePeriod`; `samePeriod` / `periodsComparable`; no silent period comparison | F |
| `cohort.js` | `PERIOD_METRIC / COHORT_METRIC / UNKNOWN_BASIS`; `cohortComparable` | G |
| `channel.js` | provider-neutral `CHANNELS`; `normalizeChannel` | H |
| `attribution.js` | `SOURCE_REPORTED/FIRST_TOUCH/LAST_TOUCH/USER_PROVIDED/UNKNOWN`; `multi_touch_model:'NOT_FABRICATED'`, `causal:false` | I |
| `transition_metrics.js` | `conversion_rate = downstream/upstream` only on matched scope + positive denominator; `causal_claim:false` | C, D |
| `dropoff.js` | volume vs efficiency separated; largest absolute loss / weakest conversion | D, E |
| `cost.js` | `CommercialCost` (12 types); `costCoverage` for acquisition metrics | J |
| `unit_economics.js` | CPL / CPA / CAC — distinct; CAC = `COMPUTED_PARTIAL` lower bound when a declared acquisition cost type is missing | K |
| `revenue.js` | `RevenueObservation`; `deriveNetRevenue` (components required); AOV/ARPU/ARPA — own denominators | L, M |
| `margin.js` | gross vs contribution margin — distinct, from supplied cost definitions only | N |
| `break_even.js` | break-even CAC / ROAS / allowable CAC — only with a supplied contribution-margin ratio | O |
| `ltv.js` | 4 explicit methodologies; MODELLED_LTV needs authorization + is labelled MODELLED | P |
| `payback.js` | CAC payback only with a complete CAC + valid contribution-margin cadence | Q |
| `roas_mer.js` | ROAS (needs attribution basis) vs MER — never interchangeable | R |
| `sales_pipeline.js` | LEAD→…→WON/LOST + custom states; win rate, cycle, win/loss reasons | S |
| `booking_funnel.js` | CONVERSATION→QUALIFIED→BOOKED→ATTENDED→SOLD; qualification / booking / show / close / conversation-to-sale | T |
| `commerce_funnel.js` | declared ECOMMERCE / WEBINAR shapes — no fixed universal funnel | U |
| `retention.js` | activation / repeat / renewal / retention / churn / upsell / cross-sell / expansion; `churn_probability: null` | V |
| `internal_baseline.js` | previous period/cohort/channel/segment/offer/creative/location/salesperson/variant; comparability validated | X |
| `delta.js` | absolute / relative / percentage-point; `statistical_significance:'NOT_ASSESSED'`, `causal:false` | Y, Z |
| `bottleneck.js` | `FunnelBottleneckCandidate` — `is_fact:false`, `causal_claim:false`, internal baseline only | W |
| `revenue_leakage.js` | `RevenueLeakageCandidate` + `OpportunityValue` — explicit methodology; no fabricated "$X lost" | AA, AB |
| `diagnosis.js` | `FunnelDiagnosis` — volume / conversion / economics / retention / data-quality / mixed / insufficient; non-causal | AC |
| `priority.js` | deterministic; `triggers_action:false` | AD |
| `completion.js` | deterministic `FunnelRevenueCompletion`; LLM cannot mark complete | AF |
| `report.js` | 35-section `FunnelRevenueReport`; evidence appendix + graph validity; caveats | AE |
| `engine.js` | orchestrator; `provenance_note` | — |

## Non-negotiable disciplines

- **Denominator + scope discipline.** A conversion rate exists only when numerator and
  denominator share time basis, cohort basis, and channel/segment/offer/geography/currency
  context, and the denominator is > 0. Otherwise `UNKNOWN / INVALID_DENOMINATOR / SCOPE_MISMATCH /
  MISSING_COUNT`.
- **Volume vs efficiency** are reported separately — a weak outcome can be a volume problem.
- **Time / cohort discipline.** Different periods and cohort bases are never silently compared.
- **Attribution** is reported/positional, never causal; multi-touch attribution is never fabricated.
- **CPL / CPA / CAC** are distinct; CAC never silently defaults to "ad spend / customers".
- **Revenue.** Net revenue is never derived without its components; AOV/ARPU/ARPA use their own denominators.
- **Margin.** Gross and contribution margin are distinct; no COGS or variable cost is assumed.
- **LTV** methodology is explicit; a modelled LTV is labelled MODELLED; no silent ARPU/churn formula.
- **Break-even / payback** only with the required supplied margin economics; else UNKNOWN.
- **ROAS / MER** never interchangeable; ROAS carries its attribution basis.
- **Bottlenecks and leakage** are analytical, non-causal; no "$X lost" is fabricated.
- **No statistical significance** is ever claimed.
- **Determinism**: same inputs ⇒ identical `report_id`.

## Model-knowledge separation

`engine.runFunnelRevenue` reads only the business-supplied numeric inputs (and optional
upstream schema-version constants). It invents no count, cost, revenue, margin, LTV, payback,
ROAS, bottleneck cause, or lost-revenue figure. Absent inputs → `UNKNOWN` / `PARTIAL` /
`INSUFFICIENT`.
