# FUNNEL_MODEL_CONTRACT — ASTRA-11J

Modules: `funnel_model.js`, `funnel_observation.js`, `sales_pipeline.js`, `booking_funnel.js`,
`commerce_funnel.js`. Schema `ucdm-funnel-revenue-1.0.0`.

## CommercialFunnel (§A)

```
{ funnel_id, funnel_kind ∈ {B2C,B2B,LOCAL_SERVICE,BOOKING,ECOMMERCE,WEBINAR,SUBSCRIPTION,CUSTOM},
  stages: [{ stage, label, in_scope, position, custom_key }],
  in_scope_stages[] }
```

- **Configurable stages — there is NO single universal funnel.** `STAGE_TYPES` is a controlled
  list of ~30 (`IMPRESSION · REACH · CLICK · VISIT · PRODUCT_VIEW · ADD_TO_CART · LEAD ·
  CONVERSATION · CONTACTED · QUALIFIED · OPPORTUNITY · BOOKED · ATTENDED · PROPOSAL · CHECKOUT ·
  PURCHASE · SOLD · PAYMENT · ACTIVATED · RETAINED · RENEWED · REPEAT_PURCHASE · UPSELL ·
  CROSS_SELL · REFERRAL · CHURN · WON · LOST · WEBINAR · OFFER · CUSTOM · UNKNOWN`).
- **No stage is mandatory** except those explicitly `in_scope`. `validateFunnel` requires ≥ 2
  stages, ≥ 1 in-scope stage, and unique stage keys.
- An unrecognised stage becomes `CUSTOM` but **keeps its original name as `custom_key`** so
  observations still key to it (W3).

## FunnelObservation (§B)

```
{ observation_id, stage, stage_key, count, status ∈ {OBSERVED,USER_PROVIDED,COMPUTED,UNKNOWN},
  source_class, entity_ref, account_ref, campaign_ref, source_ref,
  period{start,end,tz,aggregation,span_days,valid}, timezone, cohort, cohort_basis,
  channel (normalized), channel_raw, segment, offer, geography, currency, evidence_refs[] }
```

- **Counts are OBSERVED / USER_PROVIDED / COMPUTED from valid canonical inputs — never
  invented.** `validateFunnelObservation` rejects a non-UNKNOWN observation with no count, a
  negative count, and an `INFERRED` source class marked OBSERVED/USER_PROVIDED.
- `cohort_basis` defaults to `PERIOD_METRIC` for a bounded period with no cohort, `COHORT_METRIC`
  when a cohort is named, else `UNKNOWN_BASIS` (§G).
- `dedupeObservations` removes byte-identical observations (same stage_key + period + all
  filter fields + count) and reports the duplicate ids as a `DUPLICATE_OBSERVATIONS`
  data conflict (W16).

## Sales pipeline (§S) — `sales_pipeline.js`

`LEAD → CONTACTED → QUALIFIED → OPPORTUNITY → PROPOSAL` + configurable custom states +
`WON / LOST`. Preserves stage counts, transition rates (scope-validated), `win_rate`
(WON/OPPORTUNITY), `cycle_duration` (days, USER_PROVIDED basis), `win_loss_reasons` (counts by
outcome+reason), and `reps_present` / `teams_present` where supplied (W58).

## Booking funnel (§T) — `booking_funnel.js`

`CONVERSATION → QUALIFIED → BOOKED → ATTENDED → SOLD`. Named rates, each reusing the
scope-validated transition math:

| rate | pair |
|---|---|
| `qualification_rate` | CONVERSATION → QUALIFIED |
| `booking_rate` | QUALIFIED → BOOKED |
| `show_rate` | BOOKED → ATTENDED |
| `close_rate` | ATTENDED → SOLD |
| `conversation_to_sale_rate` | CONVERSATION → SOLD |

Each rate is `VALID` only when both endpoints share scope; otherwise it carries the precise
reason (`SCOPE_MISMATCH`, `INVALID_DENOMINATOR`, `MISSING_COUNT`) and no number (W51–W55).

## Commerce / webinar funnels (§U) — `commerce_funnel.js`

Declared `ECOMMERCE` (`VISIT → PRODUCT_VIEW → ADD_TO_CART → CHECKOUT → PURCHASE`) or `WEBINAR`
(`LEAD → WEBINAR → OFFER → CHECKOUT → PURCHASE → UPSELL`). **No fixed universal funnel — the
caller declares which shape applies** (W56, W57).
