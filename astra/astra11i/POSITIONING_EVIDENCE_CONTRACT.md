# POSITIONING_EVIDENCE_CONTRACT — ASTRA-11I

Module: `positioning_evidence.js`. Schema `ucdm-positioning-offer-1.0.0`.

## PositioningEvidence (§A)

```
{ positioning_evidence_id, schema_version, kind: 'PositioningEvidence',
  evidence_kind, summary, detail, source_class, scope, segment_refs[],
  evidence_refs[], origin_ref, origin_module, generated_by }
```

- **`evidence_kind`** ∈ `MARKET_FACT · COMPETITOR_CLAIM · COMPETITOR_OFFER · COMPETITOR_PRICE ·
  VOC_PATTERN · BUYING_LANGUAGE · SEGMENT · PERSONA · ICP · JOURNEY_FRICTION · PROOF_REQUIREMENT ·
  ALTERNATIVE · JTBD · FORCE_OF_PROGRESS · BUSINESS_CAPABILITY · BUSINESS_CONSTRAINT`.
- **`source_class`** ∈ ASTRA-11B `SOURCE_CLASSES`.
- **`scope`** ∈ `MARKET · SAMPLE · SEGMENT · CUSTOMER · COMPETITOR · BUSINESS · UNKNOWN`.
- **`origin_module` / `origin_ref`** name the upstream artifact (`research/market_fact`,
  `voc/pattern`, `customer_model/segment`, `journey/friction`, `business_input/capability`, …).
- **`evidence_refs`** point back to existing upstream `evidence_ref`s — **this module creates no
  new evidence and no parallel provenance system** (§ hard constraint).

## `collectPositioningEvidence({ researchResult, competitorResult, vocResult, customerModel, journeyResult, businessInput })`

Deterministically projects, in a fixed order:

| upstream | → evidence_kind |
|---|---|
| `researchResult.facts` | `MARKET_FACT` (OBSERVED, MARKET) |
| `researchResult.message_observations` | `COMPETITOR_CLAIM` (OBSERVED, COMPETITOR) |
| `researchResult.offer_items` | `COMPETITOR_OFFER` |
| `researchResult.pricing_observations` | `COMPETITOR_PRICE` |
| `competitorResult.profiles` | `COMPETITOR_CLAIM` |
| `vocResult.patterns` (non-INSUFFICIENT) | `VOC_PATTERN` (COMPUTED, SAMPLE) |
| `vocResult.buyingLanguage.library` | `BUYING_LANGUAGE` (OBSERVED, SAMPLE) |
| `customerModel.segments` / `personas` / `icp` | `SEGMENT` / `PERSONA` / `ICP` |
| `journeyResult.frictions` / `proofRequirements` / `alternatives` / `jobs` / `forces` | `JOURNEY_FRICTION` / `PROOF_REQUIREMENT` / `ALTERNATIVE` / `JTBD` / `FORCE_OF_PROGRESS` |
| `businessInput.capabilities` / `constraints` | `BUSINESS_CAPABILITY` / `BUSINESS_CONSTRAINT` (USER_PROVIDED, BUSINESS) |

`validatePositioningEvidence` checks the controlled `evidence_kind` and a valid
`source_class`. Business constraints are always preserved as `BUSINESS_CONSTRAINT` items and
flow through to the offer architecture as `CONSTRAINT` components (§AA, W67).
