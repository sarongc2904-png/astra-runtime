# ASTRA-08B — Creative Director — Report

**Gate:** ASTRA_08B_CREATIVE_DIRECTOR
**Authorization:** HUMAN_AUTHORIZATION_ASTRA_08B_CREATIVE_DIRECTOR_2026-09-07
**Pre-gate:** resolver `REQUIRED_ACTION=RUN` / `latest_authorized_task_is_active` (verified on the canonical `CLAUDE_TASK.md` + `agent_loop/AGENT_STATE.md`).
**Result:** **PASS.**

---

## 1. What was built

An additive, **evidence-bounded Creative Director** orchestration layer that transforms a strategic
marketing brief into a structured, executable creative direction package. It sits **above the frozen
Agent V1** and reads it **read-only** (targeted Strategy-F retrieval through the existing
`AgentV1Adapter`). It **never generates images and never calls an image provider** — the visual output
is a *prompt package* for later generation (ASTRA-08C, separately authorized).

Modules (all new, Node built-ins only), under `astra/src/creative/`:

| Module | Responsibility |
|---|---|
| `creative_knowledge.js` | Single source of truth. Loads the **ASTRA-08A audit artifacts** (domain coverage, 8 evidence-backed methods, readiness/limitations). The Creative Director may only assert design principles that map to a coverage class here → no invented doctrine. |
| `creative_command_parser.js` | Normalizes the 16 creative commands into **explicit machine-usable constraints** (never opaque tokens). Commands touching WEAK/NONE domains attach a limitation + evidence tag; `/retro` and `/fantasma` are user presets (ASSUMPTION), not doctrine. |
| `creative_method_selector.js` | Routes to **evidence-backed methods only** (the 8 from ASTRA-08A), scored by objective/medium/funnel; preserves provenance (chunk_ids + source) and the single-source limitation; fail-closed on a forced unsupported method. |
| `creative_prompt_builder.js` | Assembles an **operational image-generation prompt** + negative prompt from the direction; scrubs claim-risk phrases; `provider_invoked:false`. |
| `creative_critic.js` | Deterministic QA over 17 criteria → **PASS / PASS_WITH_WARNINGS / FAIL** with machine-readable reasons; enforces angle≠concept≠execution and unsupported-claim risk; does **not** self-praise. |
| `creative_director.js` | Orchestrator: brief interpretation → evidence planning → method selection → concept → visual direction → message hierarchy → variation planning → image-prompt → critic. 3 modes; fail-closed. |

Plus one **additive** export `creative_director` in `astra/src/specialists/specialists.js`.

## 2. Core rule: CREATIVE_DIRECTION_MUST_BE_EVIDENCE_BOUNDED

- **Evidence-discipline tags:** every material decision is tagged `DIRECTLY_SUPPORTED` / `INFERENCE` /
  `ASSUMPTION` / `CURRENT_RESEARCH_REQUIRED`, **ceilinged by the domain coverage class** (STRONG →
  DIRECTLY_SUPPORTED, MODERATE → INFERENCE, WEAK → ASSUMPTION, NONE → CURRENT_RESEARCH_REQUIRED).
- **angle ≠ concept ≠ execution** — angle = strategic entry route; concept = one dramatized idea/
  mechanism; execution = concrete art direction + layout. Enforced structurally and by the critic
  (`angle_distinct_from_concept`, `execution_instantiates_concept`).
- The system may interpret evidence, synthesize supported principles, create concepts/variants,
  coordinate visual+copy, write art direction, and build image prompts. It may **not** invent
  unsupported doctrine, hide WEAK/NONE coverage, fabricate current-platform best practices, fabricate
  ad claims, present INFERENCE as DIRECTLY_SUPPORTED, or invent logos/certifications/testimonials/stats.

## 3. Grounding in ASTRA-08A (read-only)

- Readiness: `READY_WITH_LIMITATIONS`. Scope guard: bounded advertising Creative Director; **not** a full
  graphic-design or current-platform authority.
- Domain coverage: **15 STRONG / 8 MODERATE / 4 WEAK / 3 NONE**.
  - NONE: **rhythm, mobile-first creative, scroll-stopping principles** → `CURRENT_RESEARCH_REQUIRED`.
  - WEAK: **grids, balance, editorial design, performance creative** → conservative ASSUMPTION only.
- 8 evidence-backed methods, all **single-source** (*The Advertising Concept Book*) → every direction
  carries a global single-source-concentration limitation.

## 4. Read-minimum-necessary-context

Each task receives only the brief, objective, ICP, offer, funnel context, selected methods, targeted
design evidence, brand/channel/format constraints, optional visual commands, the ASTRA-08A limitations,
and output requirements. Evidence is retrieved **per relevant design domain**, **bounded**
(≤ 4 domain queries; top_k ≤ 5), and **provenance-preserving**. The **whole KB is never passed**
(`whole_kb_passed:false`, verified in tests). Offline (no adapter), the layer still grounds on the
**real ASTRA-08A chunk_ids** so artifacts are reproducible with zero API calls and zero fabrication.

## 5. Operating modes, commands, Meta mode

- **SINGLE_CREATIVE** / **CREATIVE_VARIANTS** (3–6 coherent variants) / **CREATIVE_SYSTEM** (one campaign
  concept, multiple executions) — all validated.
- 16 commands normalized to explicit constraints (`/creativo /editorialad /minimalcopy /oneidea
  /highcontrast /mobilefirst /3secondread /safezone /ugcstyle /creator-ad /native-content
  /direct-to-camera /napkin-sketch /strategy-sketch /retro /fantasma`).
- **Meta Ads mode:** supports scroll-stop concept/first-glance/angle/proof/qualification/CTA direction,
  but **current** Meta mechanics (UI, Advantage+, CAPI, attribution defaults) are always emitted as
  `CURRENT_RESEARCH_REQUIRED` — never fabricated.

## 6. Model routing

Uses the existing `MODEL_ROUTER`. Command normalization / schema / QA / formatting →
`DETERMINISTIC_TRANSFORM`; copy & prompt cleanup → `LOW_COST_EXECUTION`; layout/art direction →
`MEDIUM_REASONING`; complex concept / conflict / final synthesis → `HIGH_REASONING` **only when
justified** (not universal). The deterministic default path needs no LLM at all.

## 7. Fail-closed behavior (validated)

- Insufficient brief → `WAITING_FOR_INPUT` (+ missing fields).
- Forced non-evidence-backed method → `BLOCKED`.
- Empty design-evidence bundle → `BLOCKED`.
- Fabricated/unsupported ad claim detected by the critic → `FAILED`.

## 8. Base vs Creative Director

Against the ASTRA-04/05 deterministic `CREATIVE_STRATEGY_SPECIALIST` base, the Creative Director
materially outperforms on art-direction depth (0 → 1), composition, visual hierarchy, copy/visual
coordination, image-prompt usefulness (0 → 1) and creative-QA usefulness — **without increasing
unsupported-claim risk** (claim scrub + coverage-bounded tags + fail-closed). See
`creative_director/base_vs_director_comparison.json`.

## 9. Tests & regression

- `astra/tests/astra08b.test.js` — **36 / 36 PASS**.
- Regression: `astra07` 23/23, `astra05` 24/24, `astra04` 20/20 PASS.
- `run_all` (ASTRA-02) **38 / 40** — the 2 handoff tests are now green (fixed by this gate's compliant
  handoff docs); the **1 remaining** red is the **pre-existing, expected** `registry loads seed (all
  DISCOVERED)` assertion, stale since the ASTRA-03E registry remap (registry.json is frozen and out of
  scope — not modified).

## 10. Protection / no breakage

Agent V1 / Strategy-F / classifier / cache / corpus / embeddings / benchmark / answer policy / evaluator
/ Supabase / registry.json: **unchanged**. Canonical state remains 1454 chunks / 1454 embeddings / 11
sources / legacy kb_chunks 7584 / classifier cache 20 / ANN 0. The adapter stays read-only and never
exposes the API key. No image was generated; no image provider was invoked. See
`creative_director/protection_validation.json`.

## 11. Artifacts

`astra/creative_director/`: `creative_director_contract.json`, `creative_command_map.json`,
`creative_method_routing_validation.json`, `creative_evidence_validation.json`, `scenario_results.json`,
`creative_style_validation.json`, `base_vs_director_comparison.json`, `creative_qa_validation.json`,
`prompt_builder_validation.json`, `limitations_validation.json`, `protection_validation.json`,
`test_results.json`, `artifact_manifest.json`.

## 12. Final flags

```
ASTRA_08B_CREATIVE_DIRECTOR = PASS
CREATIVE_DIRECTOR_OPERATIONAL = TRUE
CREATIVE_COMMANDS_VALID = TRUE
DESIGN_EVIDENCE_GROUNDING_VALID = TRUE
MULTI_VERTICAL_CREATIVE_VALIDATION = PASS
CREATIVE_QA_VALID = TRUE
IMAGE_PROMPT_BUILDER_VALID = TRUE
DESIGN_LIMITATIONS_PRESERVED = TRUE
AGENT_V1_PROTECTED = TRUE
CODEX_HANDOFF_OPERATIONAL = TRUE
READY_FOR_ASTRA_08C_CREATIVE_GENERATION_AND_QA = TRUE
```

**STOP after ASTRA-08B.** ASTRA-08C, automatic image generation, and new ingestion require separate
explicit human authorization.
