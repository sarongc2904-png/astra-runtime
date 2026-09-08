# ASTRA_03_TEST_RESULTS

## Result

ASTRA-03 deterministic/offline tests: **11/11 PASS**.

| Test | Result |
|---|---|
| Registry schema valid | PASS |
| Mapped doctrine has evidence refs | PASS |
| Material mapped fields have field-level evidence | PASS |
| Unsupported placeholders remain conservative | PASS |
| Different supported tasks choose different candidates | PASS |
| No method is universally selected | PASS |
| Evidence-poor methods are penalized | PASS |
| Alias ambiguity is handled without silent merge | PASS |
| Confidence/selection is not retrieval-score-only | PASS |
| Unsupported domains return `INSUFFICIENT_METADATA` | PASS |
| No specialists executed | PASS |

Additional validation:

- 14 unique discovery queries; 14/14 results; 5 hits each; 70 preserved evidence hits total.
- Registry loader: 17 valid, 0 invalid; 8 `PARTIALLY_MAPPED`; 9 conservative `DISCOVERED` placeholders.
- 12/12 knowledge-discovery JSON artifacts parse.
- Protected Agent V1 fingerprints unchanged; cache records 20 → 20.

Historical compatibility check: `node astra/tests/run_all.test.js` reports 38/39. The sole failure is `registry loads seed (all DISCOVERED)`, whose premise is intentionally superseded by the authorized ASTRA-03 registry enrichment. The other 38 ASTRA-02 tests pass. No ASTRA-02 test or implementation file was changed.

Canonical machine-readable results: `astra/knowledge_discovery/test_results.json`; protection evidence: `astra/knowledge_discovery/protection_fingerprints.json`.
