# ASTRA-10R Test Results

- Canonical pre-edit resolver: `RUN`, exact authorization id.
- ASTRA-10R: 14/14 PASS.
- Existing regressions: ASTRA-10 10/10, ASTRA-09 25/25, ASTRA-08C 23/23, ASTRA-08B 36/36, ASTRA-07 23/23.
- Total: 131 passed, 0 failed.
- Real local process: `GET /health` 200; unauthenticated execution 401; authenticated Creative Director 200/COMPLETE; shutdown signal handled and connection drain logged.
- Frozen Strategy-F probe: PASS, 1,454 corpus rows, five returned hits.
- npm lock/dependency install validation: PASS; pinned NumPy validation: PASS.
- Dockerfile/Blueprint static validation: PASS. Docker image build: NOT RUN because Docker and Podman are unavailable; `DOCKER_RUNTIME_VALID=FALSE` is intentionally fail-closed.
- Render deployment/HTTPS: NOT RUN because no Render credential or connector exists; no service URL was invented.
- Supabase state observed: project `ftoxermwkfebmnrudiuu`, `search-kb` ACTIVE v6 and `astra-tools` ACTIVE v2. ASTRA-10 authenticated live-search evidence remains valid; no GPT-facing secret was available for a fresh authenticated call and no contradictory failure was observed.
- Protected hashes: 4/4 exact. Schema/corpus/embedding/cache writes: 0.

These results validate the offline runtime implementation; they do not establish a live Render image, HTTPS endpoint, Supabase runtime wiring, or public GPT execution.
