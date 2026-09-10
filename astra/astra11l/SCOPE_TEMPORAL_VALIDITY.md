# ASTRA-11L — SCOPE & TEMPORAL VALIDITY

## Scope (`scope.js`) — NO SILENT GENERALIZATION

`SCOPE_FIELDS` (12): `period, cohort_basis, cohort, channel, segment, offer, geography,
currency, product, campaign, funnel_transition, customer_type`.

`normalizeScope(s)` normalizes each field (reuses `funnel_revenue/time_window` for `period`,
`funnel_revenue/cohort` for `cohort/cohort_basis`, `funnel_revenue/channel.normalizeChannel`
for `channel`). Missing fields stay `undefined` — they are **not** filled with a wildcard.

`scopeHash(s) = sha256Hex(canonicalize(normalizeScope(s)))`.

`compareScope(a,b)` →
```
{ status: 'SCOPE_MATCH' | 'SCOPE_PARTIAL' | 'SCOPE_MISMATCH' | 'SCOPE_UNKNOWN',
  matched_fields, mismatched_fields, partial_fields, unknown_fields }
```
- `SCOPE_MATCH` — every field present on both sides is equal (and period comparable via
  `samePeriod`, cohort via `cohortComparable`, channel via `channelsComparable`).
- `SCOPE_PARTIAL` — overlap but one side is broader / some fields only on one side.
- `SCOPE_MISMATCH` — ≥1 shared field differs (currency/cohort/period incomparable counts).
- `SCOPE_UNKNOWN` — not enough shared fields to decide.

`scopeSpecificity(s)` = count of set fields (weighted: period+cohort+channel heavier) — used
by retrieval to prefer the most specific applicable memory.

A memory's stored claim is never rewritten to drop its scope. Retrieval for a broader query
returns a scoped memory only as `SCOPE_PARTIAL` with the scope attached; it is never presented
as a global truth.

## Temporal validity (`temporal.js`) — MEMORY MUST AGE

`buildTemporal({ observed_at, valid_from, valid_until, referenceTime, superseded, invalidated,
stalenessClass })` → `TEMPORAL_STATUS`:

| status | condition |
|---|---|
| `INVALIDATED` | invalidated flag set |
| `SUPERSEDED` | superseded flag set |
| `EXPIRED` | explicit `valid_until` present and `referenceTime > valid_until` |
| `STALE` | `stalenessClass ∈ {STALE, POTENTIALLY_STALE}` |
| `ACTIVE` | none of the above |

No policy and no `valid_until` ⇒ `staleness_class: 'STALENESS_UNKNOWN'`, `invented_expiry:
false`. The engine never manufactures a `valid_until`; EXPIRED requires one to have been
supplied.

## Staleness (`staleness.js`) — deterministic, never probabilistic

`assessStaleness({ observed_at, referenceTime, staleness_policy, business_cadence,
market_volatility, offer_version, current_offer_version, campaign_version,
current_campaign_version, funnel_version, current_funnel_version })` → `STALENESS_CLASS`:

- `age_days = (referenceTime - observed_at) / 86400000`.
- Version drift (offer/campaign/funnel version ≠ current) ⇒ `STALE` regardless of age.
- `age_days > staleness_policy.max_age_days` ⇒ `STALE`; `> 0.7 * max_age_days` ⇒
  `POTENTIALLY_STALE`.
- No policy but `business_cadence` given ⇒ compare against cadence window.
- `market_volatility === 'HIGH'` shortens the potentially-stale threshold.
- Nothing to compare against ⇒ `UNKNOWN`.

`probabilistic: false` always. No decay curves, no half-lives, no scores.
