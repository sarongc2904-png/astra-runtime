# COMPETITOR_OFFER_MESSAGE_PROOF_CONTRACT — ASTRA-11E

Modules: `competitor/offer_profile.js`, `competitor/message_profile.js`,
`competitor/proof_profile.js`, `competitor/funnel_profile.js`, `competitor/creative_profile.js`.

## CompetitorOfferProfile (§E)

```
{ offer_profile_id, competitor_ref, offer_count, multiple_simultaneous_offers,
  offers: [ { offer_id, competitor_ref, source_ref, channel, context, observed_at, recency,
              fields: { core_offer, price, price_type, financing, discount, bonus, guarantee,
                        risk_reversal, trial, implementation, support, delivery_time,
                        scarcity, urgency, bundle, cta },   // each: {value, source_class} OR {status:'NOT_OBSERVED_ON_THIS_SURFACE'}
              evidence_refs[] } ] }
```

- **One `Offer` per distinct `source_ref`** — the homepage offer is *not* assumed to be
  the only market offer. Multiple simultaneous offers are all retained
  (`multiple_simultaneous_offers` when >1 non-historical). (W9, adversarial
  `competitor_multiple_offers`.)
- Each offer tracks `source_ref` / `channel` / `context` and a `recency` label (§C).
- `computeOfferFieldFrequencies(profiles, offerProfiles)` → deterministic per-field
  `{ competitor_count, sample_size, frequency, coverage_caveat }` (W10).
- **Offer conflict:** the same component observed for one competitor with materially
  different detail text (e.g. "30-day guarantee" vs "no refunds") →
  `CATEGORICAL_CONFLICT`, `status: 'OPEN'`, never auto-resolved (adversarial
  `conflicting_offer`).

## CompetitorMessageProfile (§F §M)

```
{ message_profile_id, competitor_ref, message_count, fields_present[], patterns_present[],
  items: [ { message_item_id, message_field,
             raw: { verbatim_text, verbatim_hash, evidence_refs[], source_ref, source_class: 'OBSERVED' },
             analysis: { message_patterns[], taxonomy: 'ucdm-competitor-message-v1', analytical: true, produced_by } } ] }
```

| rule | enforcement |
|---|---|
| exact text stays traceable to ASTRA-11C verbatim | `raw.verbatim_hash` (or `raw.verbatim_text` + `evidence_refs` for attribute-captured fields like CTA); `validateMessageItem` (W11) |
| analytical categorization is **separate** from raw text | `raw` vs `analysis` sub-objects; `analysis.analytical: true` (W12) |
| **message taxonomy is CONTROLLED** | `MESSAGE_PATTERNS` = `{BEST_PRICE, PREMIUM, FAST, PAIN_FREE, RESULTS, TECHNOLOGY, PERSONALIZED, GUARANTEED}` + `UNKNOWN`; deterministic keyword mapping; `validateMessageItem` rejects any other taxonomy (W25) |

Message fields: `headline, hook, promise, pain, desired_outcome, mechanism, proof, cta,
objection, identity, urgency, tone, message_angle`.

## CompetitorProofProfile (§G)

```
{ proof_profile_id, competitor_ref, proof_count, proof_types_present[], has_independent_evidence,
  items: [ { proof_id, proof_type, claim, source_ref, evidence_refs[], quantity, freshness, veracity } ] }
```

**Proof types:** `testimonial · review · rating · case_study · client_logo · before_after ·
quantified_result · credential · certification · guarantee · social_proof · authority ·
demonstration`.

**Veracity (§G):**
| label | when |
|---|---|
| `PUBLISHED_PROOF` | the competitor asserts it (their own page/ad) — default |
| `INDEPENDENT_EVIDENCE` | corroborated by a non-competitor source (e.g. a `REVIEW`-category rating) |
| `UNKNOWN_VERACITY` | present but not independently checkable |

**The engine never validates the truth of a proof** — `validateProofItem` rejects any
`truth` / `is_true` / `verified_true` field (W13, W14). `quantity` is filled only when a
number is *directly observed* in the proof text/fact.

## CompetitorFunnelProfile (§H)

```
{ funnel_profile_id, competitor_ref, steps: [{ step_id, touchpoint, cta, required_commitment,
  next_step, channel, friction, evidence_refs[], source_ref }],
  observed_touchpoints[], touchpoint_status: { <touchpoint>: 'OBSERVED' | 'UNKNOWN' },
  price_visibility, interpretation: { analytical: true, produced_by } }
```

**Touchpoints:** `ad · landing · lead_form · whatsapp_contact · call · booking · checkout ·
webinar · demo · consultation · trial`.

- **No crawling** — built from supplied observations/CTAs only.
- Every touchpoint not seen is `UNKNOWN`, **never `ABSENT`** (`validateFunnelProfile`
  rejects any other status — W16, adversarial `no_funnel_visibility`).
- CTA text → touchpoint / `required_commitment` via a deterministic `CTA_MAP`.
- Funnel ordering / friction is `interpretation.analytical: true`.

## CompetitorCreativeProfile (§I)

```
{ creative_profile_id, competitor_ref, platform_context[], creative_count, angles_present[], formats_present[],
  items: [ { creative_item_id, creative_field, raw: {...traceable...}, analysis: { angles[], message_patterns[], taxonomy: 'ucdm-competitor-creative-v1', analytical: true } } ] }
```

Observed creative patterns **only** — this gate does not generate Creative Strategy.
Angle taxonomy (`PRICE, SPEED, OUTCOME, TECH, RISK_REVERSAL, STATUS, PERSONALIZATION,
COMFORT` + `UNKNOWN`) is a deterministic mapping from the controlled message patterns.
`format` is `UNKNOWN` for text-only fixtures. Each item's raw text is traceable to
ASTRA-11C (W17).
