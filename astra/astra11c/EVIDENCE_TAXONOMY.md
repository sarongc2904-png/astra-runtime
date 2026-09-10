# EVIDENCE_TAXONOMY — ASTRA-11C

## The four levels (spec §I)

```
SOURCE CONTENT   the raw artifact + its exact text/bytes            ← ASTRA-11C owns
OBSERVATION      a normalized, provenance-bound unit of evidence    ← ASTRA-11C owns
CLAIM            a strategic assertion ASTRA makes                  ← later (analysis)
INSIGHT          a conclusion/diagnosis ASTRA derives              ← later (analysis)
```

**ASTRA-11C stops at OBSERVATION.** It never emits a strategic claim or an insight.

### Worked example

| level | value |
|---|---|
| Source | a Google review row containing the text `"Pregunté precio y nunca me respondieron."` |
| Observation | `{ observation_type: QUOTE, verbatim.verbatim_text: "Pregunté precio y nunca me respondieron.", subject: {type: Business, state: UNRESOLVED}, provenance: OBSERVED + evidence_ref, quality: {attestation: MEDIUM, veracity_support: VERY_LOW}, temporal: {...} }` |
| Claim *(NOT ASTRA-11C)* | "prospects experience slow response times" |
| Insight *(NOT ASTRA-11C)* | "slow first-response is the primary funnel bottleneck" |

The observation faithfully records **that a customer said this sentence**. It does not
assert the sentence is representative, true, or causal — that is downstream analysis.

## Observation types (`OBSERVATION_TYPES`)

Minimal + extensible. A future gate may add types; it must not repurpose these.

| type | carries | meaning |
|---|---|---|
| `TEXT` | `content` | free text captured from the source |
| `QUOTE` | `verbatim` (required) | an exact verbatim quote |
| `CLAIM` | `verbatim` (required) | **the source asserts** something (e.g. ad copy "the fastest on the market"). A record of an assertion — **not** an ASTRA claim/insight. |
| `METRIC` | `numeric` (required) | a canonical numeric observation |
| `EVENT` | `temporal` | something happened at a time |
| `TRANSACTION` | `numeric` + `temporal` | a monetary/commercial event |
| `INTERACTION` | — | a contact between a person and the business |
| `RATING` | `numeric` | a bounded score (stars, NPS-like) |
| `ATTRIBUTE` | `content` / `structured_values` | a key/value fact about a subject |
| `DOCUMENT_FRAGMENT` | `content` | a chunk of a larger document |

`INSIGHT` and `RECOMMENDATION` are **deliberately absent** from this list (test 18).

## Why `CLAIM` is an observation type but not an ASTRA claim

A `CLAIM` observation answers *"what did this source assert?"* — it is still just faithful
capture of source content, with the verbatim preserved. It becomes analysis only when a
later engine evaluates whether the assertion is **supported**, **representative**, or
**actionable**, producing an ASTRA `Insight` / `Recommendation` (ASTRA-11B entities). That
step is not authorized here.

## How observations feed ASTRA-11B later (not built now)

| ASTRA-11C observation | later maps toward (via an analysis gate) |
|---|---|
| `QUOTE` (customer, aspect-tagged by a later VoC engine) | `VoiceOfCustomerObservation` |
| `CLAIM` (advertiser) | evidence for `Positioning` / `Competitor` analysis |
| `METRIC` / `TRANSACTION` | `Sale`, `RevenueEvent`, `FunnelStage` inputs |
| `RATING` | `MarketObservation`, sentiment inputs |
| `ATTRIBUTE` | `Lead` / `ICP` / `Segment` inputs |
| `INTERACTION` / `EVENT` | `Conversation`, `Appointment`, `CustomerJourneyStage` inputs |

The mapping is always: **observation (with provenance + quality) → analysis engine →
ASTRA-11B entity (with `source_class` preserved)**. ASTRA-11C guarantees the left side is
clean, provider-neutral, and traceable.
