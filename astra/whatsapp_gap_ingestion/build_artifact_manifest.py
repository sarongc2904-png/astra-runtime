import datetime as dt
import hashlib
import json
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]
OUT = BASE / "astra" / "whatsapp_gap_ingestion"

PURPOSES = {
    "candidate_sources.json": "WhatsApp-only project candidate inventory",
    "source_admission.json": "Dedicated-evidence ADMIT/DEFER/REJECT decisions",
    "legacy_source_snapshot.json": "Read-only exact snapshot of the 12 admitted legacy rows",
    "ingestion_batches.json": "Traceable additive batch plan",
    "extraction_qa.json": "Source/unit extraction validation",
    "chunk_qa.json": "Chunk integrity, duplicate, size, topic and provenance QA",
    "embedding_validation.json": "New-only embedding model/dimension validation",
    "whatsapp_retrieval_validation.json": "Unchanged Strategy-F WhatsApp retrieval evidence",
    "post_ingestion_coverage.json": "Conservative before/after WhatsApp coverage",
    "remap_readiness.json": "Meta/WhatsApp remap and ASTRA-03E/04 readiness",
    "protection_snapshot_before.json": "Before-state hashes/counts/prior-vector fingerprint",
    "protection_validation.json": "After-state preservation evidence",
    "ingestion_execution.json": "Additive PostgREST insertion ledger",
    "new_chunks.json": "Validated traceable new chunk payloads",
    "new_embeddings.npy": "Validated new-only embedding vectors",
    "corpus_snapshot.before.json": "Rollback/read-only comparison copy of prior canonical snapshot",
    "run_astra03d2.py": "Resumable gate prepare/embed/ingest/refresh/validate runner",
    "test_astra03d2.py": "Deterministic ASTRA-03D2 artifact tests",
    "build_artifact_manifest.py": "Deterministic manifest and hash generator",
    "../ASTRA_03D2_TARGETED_WHATSAPP_SALES_SOURCE_INGESTION_REPORT.md": "Human-readable gate report",
    "../ASTRA_03D2_TEST_RESULTS.md": "Human-readable test report",
    "../../agent_loop/HANDOFF_ASTRA_03D2_TARGETED_WHATSAPP_SALES_SOURCE_INGESTION.md": "Operational gate handoff",
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


entries = []
for relative, purpose in PURPOSES.items():
    path = OUT / relative
    if not path.is_file():
        raise FileNotFoundError(path)
    entries.append({"path": path.relative_to(BASE).as_posix(), "purpose": purpose,
                    "sha256": digest(path), "created_or_modified": "CREATED"})

manifest = {
    "gate": "ASTRA_03D2_TARGETED_WHATSAPP_SALES_SOURCE_INGESTION",
    "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    "entry_count": len(entries) + 1,
    "artifacts": sorted(entries, key=lambda x: x["path"]) + [{
        "path": "astra/whatsapp_gap_ingestion/artifact_manifest.json",
        "purpose": "Inventory and hashes for ASTRA-03D2 artifacts",
        "sha256": None, "created_or_modified": "CREATED",
        "hash_note": "Self-hash omitted because embedding it would change the file",
    }],
}
(OUT / "artifact_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"status": "MANIFEST_CREATED", "entries": manifest["entry_count"]}))
