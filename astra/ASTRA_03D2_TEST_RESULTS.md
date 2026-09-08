# ASTRA-03D2 Test Results

## Result

`PASS — 25/25 deterministic tests`

Command:

```powershell
$env:PYTHONPATH='C:\Users\saro_\Documents\Codex\2026-09-06\files-pasted-by-the-user-you\work\faster_whisper_vendor'
$env:PYTHONIOENCODING='utf-8'
$env:PYTHONUTF8='1'
py astra\whatsapp_gap_ingestion\test_astra03d2.py
```

Verified:

- Candidate schema and WhatsApp-only scope.
- Exact 2 ADMIT / 2 DEFER / 2 REJECT decisions.
- Dedicated-source rule; prompts/generic sales/duplicate aggregate excluded.
- Exact 12 active legacy rows and read-only snapshot.
- Extraction 14/14 and chunk QA 39/39.
- Content hashes, provenance, source distribution and warning retention.
- New-only embedding model/shape/finite/nonzero validation.
- Additive 1,415 + 39 = 1,454 counts; zero duplicates/failures; no-overwrite policy.
- Dedicated evidence in 10/10 Strategy-F queries with 40 top-five subject hits.
- Conservative `MODERATE` coverage and recorded remaining gaps.
- WhatsApp and Meta remap evidence readiness TRUE; ASTRA-03E readiness TRUE; ASTRA-04 FALSE.
- Exact preservation of the prior 1,415 chunks and vector bytes.
- Protected runtime/cache, legacy/ANN invariants and no specialists.

Additional live checks: resolver PASS; canonical live recount 1,454 rows/embeddings and 11 sources; final protection `AGENT_V1_PROTECTED=TRUE`.

