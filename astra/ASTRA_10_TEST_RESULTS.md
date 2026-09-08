# ASTRA-10 Test Results

- ASTRA-10: 10/10 PASS.
- ASTRA-09: 25/25 PASS.
- ASTRA-08C: 23/23 PASS.
- ASTRA-08B: 36/36 PASS.
- ASTRA-07: 23/23 PASS.
- Live `searchKnowledgeBase`: HTTP 200, results present.
- Live Edge negative auth: 401; CORS: 204.
- Live ASTRA gateway with valid auth: HTTP 503 `ENVIRONMENT_NOT_AVAILABLE`.
- OpenRouter local health: READY.
- Full local campaign attempt: stopped after more than 70 seconds without response; not PASS.
- Protected hashes: PASS. Database/schema/corpus writes: 0.

Tests establish correct partial deployment and fail-closed behavior; they do not satisfy full ASTRA-10 readiness because the public Node+Python runtime and GPT UI configuration are absent.
