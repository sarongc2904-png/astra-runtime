# ASTRA-08B — Test Results

**Gate:** ASTRA_08B_CREATIVE_DIRECTOR · **Result:** PASS · Node v22.23.2 · deterministic, no live API.

## Primary suite — `astra/tests/astra08b.test.js` → 36 / 36 PASS

Coverage (each an executed assertion):

- Creative knowledge single source of truth: coverage counts **15/8/4/3**; **8** evidence-backed methods
  with provenance; NONE for mobile/scroll/rhythm; STRONG for concept/SMP/art direction; tag ceilings.
- Creative command normalization: all **16** commands expand to explicit constraints; `/minimalcopy`,
  `/mobilefirst` (NONE-domain limitation), `/fantasma`+`/retro` presets (ASSUMPTION), unrecognized surfaced.
- Contract & modes: SINGLE_CREATIVE full contract; **angle ≠ concept ≠ execution**; CREATIVE_VARIANTS
  (3–6); CREATIVE_SYSTEM (concept + executions).
- Retrieval: **targeted, bounded, provenance-preserving, no full-KB leakage**; offline grounding on real
  ASTRA-08A chunk_ids.
- Limitations: WEAK/NONE surfaced (not hidden); NONE → CURRENT_RESEARCH_REQUIRED; single-source flagged.
- No unsupported doctrine: only evidence-backed methods; **fabricated claim → FAILED**; image-prompt claim scrub.
- Critic: **PASS / PASS_WITH_WARNINGS / FAIL**; empty direction → FAIL (not self-praising); ready flag guarded.
- Image prompt: operational fields complete; **provider not invoked**.
- Meta: current-platform mechanics → CURRENT_RESEARCH_REQUIRED.
- Multi-vertical: 5 verticals all COMPLETE and business-specific.
- Model routing: plan present; HIGH_REASONING not universal.
- Fail-closed: WAITING_FOR_INPUT, BLOCKED (forced unsupported method), empty-evidence planner path.
- Agent V1 protection: adapter read-only + pins corpus/pipeline; apiKey never exposed; no image provider.

## Scenario suite (from `creative_director/scenario_results.json`)

| Scenario | Vertical | Mode | Status | QA | Variants/Exec | Evidence | Ready |
|---|---|---|---|---|---|---|---|
| S1 | laser hair removal clinic | SINGLE_CREATIVE | COMPLETE | PASS | 0 | 16 | true |
| S2 | dental clinic | CREATIVE_VARIANTS | COMPLETE | PASS | 4 | — | true |
| S3 | local restaurant | SINGLE_CREATIVE | COMPLETE | PASS | 0 | — | true |
| S4 | digital infoproduct | CREATIVE_SYSTEM | COMPLETE | PASS | 4 | — | true |
| S5 | B2B marketing service | CREATIVE_VARIANTS | COMPLETE | PASS | 3 | — | true |

## Style validation (from `creative_director/creative_style_validation.json`)

editorial premium, minimalist, high contrast, UGC/native, conceptual advertising, mobile-first
performance creative — all produce a direction with `honestly_bounded=true`. **editorial premium** and
**mobile-first performance creative** are correctly **NOT** claimed strongly-supported (their supporting
domains are WEAK/NONE); the others are.

## Regression

| Suite | Pass | Fail |
|---|---|---|
| `astra07.test.js` | 23 | 0 |
| `astra05.test.js` | 24 | 0 |
| `astra04.test.js` | 20 | 0 |
| `run_all.test.js` (ASTRA-02) | 38 | 1 |

**The 1 remaining `run_all` failure** is `registry loads seed (all DISCOVERED)` — **pre-existing and
expected**: the ASTRA-02 test asserts the pristine seed registry, but the Method Registry was remapped to
`PARTIALLY_MAPPED` in **ASTRA-03E**. `registry.json` is frozen and out of ASTRA-08B scope; it was **not**
modified. ASTRA-08B additionally **fixed** the two previously-red handoff tests (`handoff CURRENT_TASK
complete`, `handoff operational`) by writing compliant handoff docs.

## Protection

Agent V1 modified: **false** · image provider invoked: **false** · new knowledge ingested: **false**.
Canonical state unchanged: 1454 chunks / 1454 embeddings / 11 sources / legacy 7584 / cache 20 / ANN 0.
