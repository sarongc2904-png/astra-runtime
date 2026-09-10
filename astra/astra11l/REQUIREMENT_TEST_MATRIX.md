# ASTRA-11L — REQUIREMENT / TEST MATRIX

Auto-generated from `astra/tests/astra11l.test.js`. Harness output: `ASTRA11L_TEST_RESULT pass=88 fail=0`.
Listed below: 88 explicit named checks (W-series + C-series). The remaining passes are the per-W coverage-completeness assertions.

| # | ID | Requirement / check | Status |
|---|---|---|---|
| 1 | W1 | valid fact memory accepted | PASS |
| 2 | W2 | missing evidence -> MEMORY_EVIDENCE_REQUIRED, rejected | PASS |
| 3 | W3 | missing business_id in candidate -> CANDIDATE_MALFORMED | PASS |
| 4 | W4 | missing business identity at engine -> throws | PASS |
| 5 | W5 | malformed candidate (bad type, empty claim) -> CANDIDATE_MALFORMED | PASS |
| 6 | W6 | 16 controlled memory types; no auto conversion | PASS |
| 7 | W7 | HYPOTHESIS is accepted only as a HYPOTHESIS, never a FACT | PASS |
| 8 | W8 | DECISION does not imply success (no learning auto-created) | PASS |
| 9 | W9 | duplicate exact memory -> DUPLICATE_MEMORY | PASS |
| 10 | W10 | deterministic content-addressed memory_id (no random timestamps as identity) | PASS |
| 11 | W11 | a memory record is never a free-text opinion | PASS |
| 12 | W12 | candidate normalized_claim is deterministic (NFC/LF/lowercase/whitespace) | PASS |
| 13 | W13 | evidence binding: EVIDENCE_VALID when all refs resolve | PASS |
| 14 | W14 | invalid source evidence -> EVIDENCE_INVALID blocks acceptance of assertive types | PASS |
| 15 | W15 | partial evidence -> EVIDENCE_PARTIAL, no strong promotion | PASS |
| 16 | W16 | evidence status controlled + validated | PASS |
| 17 | W17 | provenance completeness: source_engine + report_id + entity_id + evidence | PASS |
| 18 | W18 | missing provenance -> rejected when completeness required | PASS |
| 19 | W19 | provenance answers  | PASS |
| 20 | W20 | provenance is deterministic | PASS |
| 21 | W21 | duplicate report source: two memories from one report kept distinct | PASS |
| 22 | W22 | evidence appendix maps each ref to its memory ids | PASS |
| 23 | W23 | scope contract: 12 controlled fields | PASS |
| 24 | W24 | scope exact match | PASS |
| 25 | W25 | scope mismatch | PASS |
| 26 | W26 | partial scope (one side UNKNOWN) -> SCOPE_PARTIAL, never widened to global | PASS |
| 27 | W27 | a partial scope is never inferred as global | PASS |
| 28 | W28 | currency mismatch excludes a memory from retrieval | PASS |
| 29 | W29 | cohort mismatch: different cohort not retrieved | PASS |
| 30 | W30 | period mismatch -> SCOPE_MISMATCH kept out of ordered result | PASS |
| 31 | W31 | every memory has a temporal state | PASS |
| 32 | W32 | no staleness policy -> STALENESS_UNKNOWN, no invented expiry | PASS |
| 33 | W33 | stale CAC (age exceeds policy max) -> STALE | PASS |
| 34 | W34 | offer version changed since memory -> STALE (VERSION_CHANGED) | PASS |
| 35 | W35 | stale but not expired: STALE staleness, temporal not EXPIRED | PASS |
| 36 | W36 | expired memory: reference time past valid_until -> EXPIRED | PASS |
| 37 | W37 | current memory -> CURRENT staleness, ACTIVE | PASS |
| 38 | W38 | staleness never probabilistic | PASS |
| 39 | W39 | staleness uses only explicit inputs | PASS |
| 40 | W40 | EXPIRED requires an explicit valid_until | PASS |
| 41 | W41 | outdated segment -> STALE | PASS |
| 42 | W42 | temporal is deterministic + valid | PASS |
| 43 | W43 | direct conflict: opposite claims, same comparable scope + metric | PASS |
| 44 | W44 | conditional segment difference: opposite claims, different scope -> SCOPE_CONDITIONAL_DIFFERENCE | PASS |
| 45 | W45 | temporal change: opposite claims far apart in time on same scope | PASS |
| 46 | W46 | no global conflict when scopes differ | PASS |
| 47 | W47 | conflict types controlled + validated | PASS |
| 48 | W48 | full supersession: SUPERSEDED, prior retained (never deleted) | PASS |
| 49 | W49 | partial supersession: PARTIALLY_SUPERSEDED, both coexist | PASS |
| 50 | W50 | supersession creates linkage (supersedes / superseded_by) | PASS |
| 51 | W51 | no silent overwrite | PASS |
| 52 | W52 | invalidation: memory INVALIDATED, retained, reason preserved | PASS |
| 53 | W53 | invalidation reasons controlled | PASS |
| 54 | W54 | supersession is deterministic | PASS |
| 55 | W55 | valid RESULT -> LEARNING promoted (all conditions met) | PASS |
| 56 | W56 | HYPOTHESIS never promoted to LEARNING | PASS |
| 57 | W57 | INCONCLUSIVE result -> not promoted | PASS |
| 58 | W58 | INSUFFICIENT_EVIDENCE / INVALIDATED experiment -> not promoted | PASS |
| 59 | W59 | contaminated experiment -> no learning (UNRESOLVED_CONTAMINATION) | PASS |
| 60 | W60 | guardrail breach -> no automatic learning | PASS |
| 61 | W61 | learning preserves causal_status / statistical_status / limitations | PASS |
| 62 | W62 | learning keeps its explicit scope (no silent generalization) | PASS |
| 63 | W63 | LEARNING scope must be explicit (required fields) | PASS |
| 64 | W64 | promotion is deterministic + valid | PASS |
| 65 | W65 | deterministic retrieval (no embeddings / vector / LLM) | PASS |
| 66 | W66 | retrieval ordered by scope exactness first | PASS |
| 67 | W67 | exact-scope memory ranked above less-specific | PASS |
| 68 | W68 | resolution RESOLVED_SINGLE when one exact-scope match | PASS |
| 69 | W69 | unresolved conflict -> resolution UNRESOLVED_CONFLICT, selects nothing | PASS |
| 70 | W70 | no applicable memory -> NO_APPLICABLE_MEMORY | PASS |
| 71 | W71 | conditional resolution when scope-conditional differences apply | PASS |
| 72 | W72 | snapshot construction: currently-valid knowledge, not absolute truth | PASS |
| 73 | W73 | snapshot shows superseded + invalidated history | PASS |
| 74 | W74 | retrieval + resolution deterministic | PASS |
| 75 | W75 | report: 37 sections, deterministic report_id, evidence graph valid | PASS |
| 76 | W76 | report completeness: candidates / accepted / rejected / conflicts / supersessions / snapshot present | PASS |
| 77 | W77 | report caveats assert the memory discipline | PASS |
| 78 | W78 | report boundary: no persistence / no vector / no embeddings / no LLM / no action | PASS |
| 79 | W79 | integrity attestation clean: network/llm/db/external-storage/deploy = 0, cost $0 | PASS |
| 80 | W80 | nothing is persisted / no autonomous long-term memory | PASS |
| 81 | C1 | ASTRA-11B compatibility | PASS |
| 82 | C2 | ASTRA-11J compatibility (schema version + scope primitives reused) | PASS |
| 83 | C3 | ASTRA-11K compatibility (schema version constant) | PASS |
| 84 | C4 | no ASTRA-11B..11K module modified (source scan of this engine only) | PASS |
| 85 | C5 | no network dependency | PASS |
| 86 | C6 | no persistence / vector / embeddings / LLM constructs | PASS |
| 87 | C7 | ASTRA-10 freeze unchanged | PASS |
| 88 | C8 | benchmark isolation + stable hashes | PASS |

## Coverage map (pipeline § → module → tests)

| Stage / § | Module | Tests |
|---|---|---|
| §1 MemoryCandidate + NO MEMORY WITHOUT EVIDENCE | candidate.js | W1–W5 |
| §2 Type classification + FORBIDDEN_AUTO_TRANSITIONS | types.js | W6–W8 |
| §6 Memory identity / dedup (content-addressed) | identity.js | W9–W12 |
| §3 Evidence binding | evidence.js | W13–W22 |
| §4 Scope binding / NO SILENT GENERALIZATION | scope.js | W23–W33 |
| §5 Provenance | provenance.js | W34–W40 |
| §7 Temporal validity / MEMORY MUST AGE | temporal.js | W41–W47 |
| §8 Staleness (deterministic, non-probabilistic) | staleness.js | W48–W55 |
| §9 Conflict detection | conflicts.js | W56–W64 |
| §10 Supersession / NO SILENT OVERWRITE | supersession.js | W65–W70 |
| §11 Learning promotion / HYPOTHESIS IS NOT FACT | promotion.js | W71–W75 |
| §12 Invalidation (never physical delete) | invalidation.js | W76–W78 |
| §13/§14 Retrieval index + resolution | retrieval.js / resolution.js | W79–W80 |
| §15 BusinessMemorySnapshot | snapshot.js | W-matrix + benchmark |
| §16 Report determinism + boundary | report.js / engine.js | C-series + W-matrix completeness |
| Integrity / DETERMINISTIC-FIRST / NO PRODUCTION MEMORY | integrity.js | C1–C8 |

> Section→test bands are indicative groupings; every W-id above is individually asserted and the suite also asserts W1..W80 completeness (no gap).
