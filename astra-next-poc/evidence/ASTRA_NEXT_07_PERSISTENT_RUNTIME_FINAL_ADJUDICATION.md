# ASTRA-NEXT-07 — Persistent Runtime Final Adjudication

Date: 2026-09-17
Branch: `astra-next-poc`
Runtime commit: `bdcdd3eecff8b59d794d106f90b092a4319c49f2`
Render service: `astra-next-anythingllm-docker-poc`
Persistent disk mount: `/app/server/storage`
Disk size: `1 GB`

## Final verdict

`ASTRA_NEXT_07_PERSISTENT_RUNTIME = PASS`

## Objective

Prove that ASTRA NEXT survives real Render redeploys without recreating runtime state or needlessly re-embedding unchanged knowledge.

## Persistence checks

Validated across successive redeploys on the paid Render instance with persistent disk:

| Check | Result |
|---|---|
| SQLite database reused | PASS |
| No database recreation on subsequent redeploy | PASS |
| Prisma migrations reused | PASS — `No pending migrations to apply.` |
| Workspace persisted | PASS — `workspace_exists name=ASTRA NEXT` |
| Encryption state persisted | PASS — existing key and salt loaded |
| Agent Flow persisted | PASS |
| Agent Flow UUID unchanged | PASS — `30734e2b-21ee-411a-bcd4-8e6e07f09858` |
| Agent Flow active | PASS |
| Knowledge manifest persisted | PASS |
| Unchanged KB re-ingestion prevented | PASS |
| Campaign360 auto-execution disabled | PASS |
| Agent Flow auto-execution disabled | PASS |
| Service returned live | PASS |

## Knowledge persistence gate

A deterministic knowledge fingerprint gate was added to the runtime bootstrap.

Manifest:

`ASTRA_NEXT_POC_KB_V1`

Observed fingerprint:

`388b20fe7b1087f566b9eac6ed15d01591c61d0dcd6cd5792c5239a0420af059`

The first deployment after adding the gate performed the controlled seven-file ingestion and wrote the persistent marker only after all seven files passed:

```text
[ASTRA_NEXT_BOOTSTRAP] kb_ingestion_complete status=PASS manifest=ASTRA_NEXT_POC_KB_V1 total=7 passed=7 failed=0 marker_saved=true
```

A second redeploy of the exact same runtime commit then produced:

```text
[ASTRA_NEXT_BOOTSTRAP] workspace_exists name=ASTRA NEXT
[ASTRA_NEXT_BOOTSTRAP] agent_flow_exists name=ASTRA_NEXT_Campaign360_Handoff uuid=30734e2b-21ee-411a-bcd4-8e6e07f09858
[ASTRA_NEXT_BOOTSTRAP] agent_flow_materialization status=PASS uuid=30734e2b-21ee-411a-bcd4-8e6e07f09858 active=true blocks=1 side_effects=0
[ASTRA_NEXT_BOOTSTRAP] kb_manifest_match manifest=ASTRA_NEXT_POC_KB_V1 fingerprint=388b20fe7b1087f566b9eac6ed15d01591c61d0dcd6cd5792c5239a0420af059
[ASTRA_NEXT_BOOTSTRAP] kb_ingestion_skipped reason=manifest_unchanged manifest=ASTRA_NEXT_POC_KB_V1 total=7
[ASTRA_NEXT_BOOTSTRAP] campaign360_skipped run=false kb_total=7 kb_fail=0
[ASTRA_NEXT_BOOTSTRAP] agent_flow_execution_skipped run=false uuid=30734e2b-21ee-411a-bcd4-8e6e07f09858 active=yes
[ASTRA_NEXT_BOOTSTRAP] bootstrap_complete
```

The database startup also showed:

```text
Datasource "db": SQLite database "anythingllm.db" at "file:../storage/anythingllm.db"
40 migrations found in prisma/migrations
No pending migrations to apply.
```

No `SQLite database anythingllm.db created` event appeared in the validated redeploy.

## Runtime behavior

If the seven-file KB is unchanged:

`fingerprint match -> skip upload/embed -> reuse persisted vectors`

If the KB changes:

`fingerprint mismatch -> ingest 7 files -> require 7/7 PASS -> save new marker`

A failed or incomplete ingestion does not update the marker.

## Safety

- Legacy ASTRA was not modified.
- Campaign360 was not started.
- Agent Flow execution was not started.
- No WhatsApp, CRM, n8n, Meta Ads or other external business action was executed.
- Persistent state is now stored at the intended AnythingLLM boundary: `/app/server/storage`.

## Decision

The infrastructure blocker documented in the original ASTRA-NEXT-07 readiness gate is resolved.

`ASTRA_NEXT_07_PERSISTENCE_DESIGN = PASS`

`ASTRA_NEXT_07_PERSISTENT_RUNTIME = PASS`

ASTRA NEXT can now proceed to production/channel integration readiness without depending on runtime reconstruction after every Render redeploy.
