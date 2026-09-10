# ASTRA-11G — Buyer Persona + ICP + Segmentation Engine — DESIGN

**Mode:** DESIGN + DETERMINISTIC IMPLEMENTATION + ISOLATED OFFLINE BENCHMARKING.
**Boundary:** No ASTRA-11G output may feed production routing or autonomous action.
Deterministic only — no LLM, no network, no DB, no clock (`referenceTime` is caller-supplied).
Reuses ASTRA-11B/C/D/E/F; creates **no** parallel evidence, provenance, VoC, market or
competitor system.

## Pipeline

```
MARKET FACTS (ASTRA-11D)  +  VOC PATTERNS/OBSERVATIONS (ASTRA-11F)  +  BUSINESS INPUT
        -> CUSTOMER ATTRIBUTE EVIDENCE        attribute_evidence.js
        -> SEGMENT DIMENSIONS                 segment_taxonomy.js
        -> SEGMENT CANDIDATES                 segment_candidate.js
        -> SEGMENT VALIDATION / MEMBERSHIP / METRICS   segment_membership.js · segment_metrics.js
        -> BUYER PERSONA  /  ICP              buyer_persona.js · persona_evidence.js · icp.js · buying_roles.js
        -> FIT ASSESSMENT                     icp_fit.js
        -> PRIORITIZATION                     attractiveness.js · priority.js
        -> CUSTOMER MODEL REPORT              coverage.js · completion.js · report.js · engine.js
```

`engine.runCustomerModel({ vocResult, researchResult?, businessInput?, referenceTime })` is the
single orchestrator. Every stage validates fail-closed.

## Modules (`astra/src/commercial/customer_model/`)

| module | responsibility | key spec § |
|---|---|---|
| `attribute_evidence.js` | `CustomerAttributeEvidence`; controlled `ATTRIBUTE_TYPES`; `PROHIBITED_INFERENCE_ATTRIBUTES`; derivation from VoC | A, B |
| `segment_taxonomy.js` | controlled `SEGMENT_DIMENSIONS` + closed value sets; `cm-segment-dimension-v1` | C |
| `segment_candidate.js` | `SegmentCandidate` (SUPPORTED/PARTIAL/HYPOTHESIS/INSUFFICIENT); non-demographic labels | D |
| `segment_membership.js` | `assignMembership` (CONFIRMED/LIKELY_ANALYTICAL/UNKNOWN); overlap report | E |
| `segment_metrics.js` | size discipline — count only; external size UNKNOWN unless supplied | F |
| `buyer_persona.js` | canonical `BuyerPersona`; deterministic narrative; UNKNOWN fields | G, H |
| `persona_evidence.js` | backward-trace evidence map; fail-closed on dangling refs | I |
| `awareness.js` / `urgency.js` / `budget_signal.js` | evidence-backed classifiers; MIXED preserved; no income inference | K, L, M |
| `icp.js` | `IdealCustomerProfile` (org fit); B2C → NOT_APPLICABLE; revenue/employees only when supplied | N, O |
| `buying_roles.js` | controlled `BUYING_ROLES`; title ≠ authority; multi-role committee | O, P |
| `icp_fit.js` | deterministic + configurable weights; coverage < 0.5 → band UNKNOWN | Q |
| `attractiveness.js` | deterministic; strictly separate from market size | R |
| `priority.js` | deterministic; `is_analytical:true`, `triggers_action:false` | S |
| `disqualification.js` | evidence-backed, commercially-relevant only; demographic exclusion rejected | T |
| `conflicts.js` | reuses ASTRA-11F contradiction signal; CONSISTENT/MIXED/POLARIZED/INSUFFICIENT | U |
| `merge_split.js` | similarity on canonical attributes only; conflict → REVIEW_REQUIRED; no destructive merge | V |
| `coverage.js` / `completion.js` | deterministic `CustomerModelCompletion`; LLM cannot mark complete | W |
| `report.js` | 28-section `CustomerModelReport`; evidence appendix + graph validity; caveats | X |
| `engine.js` | orchestrator; `provenance_note` | — |

## Non-negotiable disciplines

- **No demographic / psychographic invention.** `age, gender, marital_status, income, education,
  religion, race, personality_type, medical_status, sexuality, lifestyle, hobbies` (and similar)
  are never derived. They are representable **only** as `USER_PROVIDED`; otherwise `UNKNOWN`.
  A prohibited value on a derived attribute is force-downgraded to `UNKNOWN` at construction.
- **No psychographic fiction in personas.** Persona quality = decision usefulness + evidence
  fidelity, not vividness. The narrative is a pure deterministic rendering of canonical fields;
  `validateNarrative` recomputes and rejects any divergence (an injected "María, 37, casada…"
  fails).
- **Market/segment size is never fabricated.** `observed_sample_count` / `known_customer_count`
  are counted; `estimated_external_market_size` is `UNKNOWN` unless supplied with a source.
- **Overlap is first-class.** A customer may be a CONFIRMED member of several segments.
- **Contradictions are preserved** and flagged as *likely multiple segments*; never averaged.
- **ICP ≠ Persona.** ICP answers "which account?"; Persona answers "which person/role?".
- **Priority is analytical only** — it never creates, targets, or launches a campaign.
- **Determinism.** Same inputs ⇒ identical `report_id` (content hash over canonical JSON).

## Model-knowledge separation (§Y)

The engine reads only ASTRA-11D / ASTRA-11F evidence objects and explicit business input.
It invents no attribute, segment, persona field, quote, size, or role. Absent evidence →
`UNKNOWN` / `INSUFFICIENT`.
