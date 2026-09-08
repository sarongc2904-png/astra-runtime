# ASTRA-07 Test Results

## ASTRA-07 suite

Command: `node astra/tests/astra07.test.js`

Final result: `ASTRA07_TEST_RESULT pass=23 fail=0`.

Coverage includes runtime configuration, invalid URL/numeric bounds, missing credential/model, sanitized diagnostics, redaction, provider factory, mocked OpenRouter health and structured completion, mocked LM Studio model discovery and structured completion, unavailable local health behavior, full workflow through an injected provider, CLI config/usage/text/file/JSON/health/state propagation, no secret output, and read-only Agent V1 adapter markers.

Initial interrupted-state run was 17 PASS / 3 FAIL. The two missing-key failures had one cause: implicit project-config credential fallback. The workflow mock failure had one cause: an invalid empty assumptions fixture. Both ASTRA-07-only defects were corrected; the validated workflow/synthesis logic was not relaxed.

## Live/provider validation

- OpenRouter smoke: `READY`; authenticated `/models` reached and configured model found. No completion/campaign call was made.
- OpenRouter CLI: `node astra/run_campaign_360.js --health --json` returned `health.ok=true`, `status=READY`, and `model_available=true`; diagnostics contained key-presence boolean only.
- LM Studio smoke: `ENVIRONMENT_NOT_AVAILABLE`; `http://127.0.0.1:1234/v1/models` was unreachable. This is recorded as environment unavailability, not product failure.

## Regression commands

| Suite | Command | Result |
|---|---|---|
| ASTRA-06 | `node astra/orchestrator_e2e_qa/run_qa.js` | 15/15 PASS, offline deterministic |
| ASTRA-05 | `node astra/tests/astra05.test.js` | 24/24 PASS |
| ASTRA-04 | `node astra/tests/astra04.test.js` | 20/20 PASS |
| ASTRA-03E | `node astra/tests/astra03e.test.js` | 23/23 PASS |
| router-core | `node astra/tests/run_all.test.js` | 38/39; sole known obsolete all-DISCOVERED assertion |

New regressions: 0.

## Security and protection

- 24 ASTRA-07 runtime/package deliverables scanned.
- Exact project credential leaks: 0.
- Literal secret assignments: 0.
- `.env.example` OpenRouter key: empty placeholder.
- Frozen runtime hashes: 4/4 match ASTRA-06 baseline.
- Agent V1 protected: TRUE.
