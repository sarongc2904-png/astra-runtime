# ASTRA-03D Test Results

## Result

`PASS — 25/25 deterministic tests`

Command:

```powershell
$env:PYTHONPATH='C:\Users\saro_\Documents\Codex\2026-09-06\files-pasted-by-the-user-you\work\faster_whisper_vendor'
py astra\knowledge_gap_ingestion\test_astra03d.py
```

Validated groups:

- Candidate schema and target-domain confinement.
- Admission counts and only the dedicated Meta course admitted.
- No WhatsApp source falsely admitted.
- Extraction 6/6; chunk count/integrity/content hashes/provenance/warnings.
- New-only embedding model, dimensions, finite/nonzero vectors and persisted array shape.
- Additive 1,380 + 35 = 1,415 counts; zero failures and duplicate-safe no-overwrite policy.
- Meta Strategy-F visibility in 11/11 queries and explicit `PARTIAL_PIXEL_ONLY` handling for CAPI/Advantage+.
- WhatsApp `NONE` with 0 dedicated hits.
- Conservative remap, ASTRA-03E and ASTRA-04 readiness rules.
- Exact preservation of all 1,380 prior chunk contents and vector bytes.
- Protected runtime/cache/legacy/ANN invariants and no specialist execution.

Additional live validations:

- Resolver pre-gate: PASS.
- Local transcription: 6/6 completed.
- Embedding API: 35/35 at 1,536 dimensions; 0 failures.
- PostgREST ingestion: 35 inserted; 0 skipped; 0 failures.
- Canonical refresh/live recount: 1,415 rows, 1,415 embeddings, 9 sources.
- Strategy-F retrieval: Meta 11/11 queries visible, 42 dedicated top-five hits; WhatsApp 0/10 dedicated hits.
- Final protection: `AGENT_V1_PROTECTED = TRUE`.

Full machine-readable evidence is under `astra/knowledge_gap_ingestion/`.

