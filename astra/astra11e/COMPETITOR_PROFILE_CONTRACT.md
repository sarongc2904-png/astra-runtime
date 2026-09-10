# COMPETITOR_PROFILE_CONTRACT — ASTRA-11E

`competitor_schema_version = ucdm-competitor-1.0.0`. Modules: `competitor/competitor_profile.js`,
`competitor/attribute_model.js`, `competitor/temporal_state.js`.

## CompetitorProfile (§A)

```
{ competitor_id, competitor_ref, name, aliases[], category, sub_category, geography, locations[],
  business_model, audience, products_services[], channels[], source_refs[], evidence_refs[],
  identity_status ∈ {RESOLVED, UNRESOLVED, AMBIGUOUS}, ambiguous_with[],
  identity_resolution_method: 'EXPLICIT_ONLY', confidence, profile_hash, schema_version }
```

| rule | enforcement |
|---|---|
| built only from ASTRA-11D evidence (facts + observations) | `buildProfiles` groups by `subject:Competitor:*` refs |
| **no fuzzy / LLM identity resolution** | `identity_resolution_method` is always `'EXPLICIT_ONLY'`; `validateCompetitorProfile` rejects anything else |
| **competitors are never merged on name similarity** | one `subject_ref` = one profile; two similar names → two profiles |
| ambiguity is preserved | `identityHints.ambiguous = [[refA, refB]]` (human-supplied) → both profiles kept, `identity_status: 'AMBIGUOUS'`, `ambiguous_with` cross-links them |
| `RESOLVED` = the observation carried an explicit `competitor_ref`; `UNRESOLVED` = no id | `parseCompetitorRef` |
| deterministic confidence | ASTRA-11B `confidence.assess` |

`identityHints.aliases` (human-supplied) records a rebrand's prior name without merging
(W3, W37, adversarial `competitor_rebrand`).

## CompetitorAttribute (§B)

```
{ attribute_id, attribute, value, kind ∈ {OBSERVED, ANALYTICAL},
  evidence_refs[], source_refs[], observed_at, verbatim_hash, confidence, note }
```

**Attributes (29):** `audience, category, promise, value_proposition, mechanism,
differentiator, price, pricing_model, offer, guarantee, financing, trial, bonus,
delivery_time, proof, testimonial, rating, review_count, cta, channel, funnel_step,
headline, message, pain, desired_outcome, objection_addressed, identity_language,
creative_angle, creative_format`.

| rule | enforcement |
|---|---|
| every `OBSERVED` attribute carries `evidence_refs` | `validateAttribute` (W4) |
| `INFERRED` material is `kind: 'ANALYTICAL'` with a `note` saying so — **never stamped observed** | `extractAttributes` (W5) |
| mapping is deterministic (fact_type / message_field / offer_component → attribute) | `FACT_TYPE_ATTR`, `MSG_FIELD_ATTR`, `OFFER_COMP_ATTR` |

## CompetitorSnapshot — temporal state (§C)

```
{ content_hash, competitor_ref, domain ∈ {pricing, offer, message, proof, funnel, creative},
  effective_at, observed_at, source_window{start, end}, age_days, recency, supersedes, evidence_refs[], payload }
```

`recency ∈ { CURRENT, HISTORICAL, UNKNOWN_CURRENT }` (`FRESHNESS_DAYS = 180`):

- newest dated snapshot within 180 days of `referenceTime` → `CURRENT`
- older snapshots → `HISTORICAL`, with `supersedes` = the newer snapshot's `content_hash`
- newest snapshot older than 180 days, or undated → `UNKNOWN_CURRENT`

`currentState(snaps)` returns `{ state: 'CURRENT'|'UNKNOWN_CURRENT', snapshot }`. **Old
pricing/offers are never silently treated as current** (W6, W7; completion emits
`STALE_DATA` — W36 — when any competitor's freshest snapshot is not `CURRENT`).
