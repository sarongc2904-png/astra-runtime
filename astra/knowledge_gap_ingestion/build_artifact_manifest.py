import datetime as dt
import hashlib
import json
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]
OUT = BASE / "astra" / "knowledge_gap_ingestion"

PURPOSES = {
    "candidate_sources.json": "Targeted local/project candidate inventory",
    "source_admission.json": "Evidence-based ADMIT/DEFER/REJECT decisions",
    "ingestion_batches.json": "Traceable additive batch plan",
    "extraction_qa.json": "Per-source and per-unit extraction validation",
    "chunk_qa.json": "Chunk integrity, size, duplicate and provenance QA",
    "embedding_validation.json": "New-only embedding model/dimension validation",
    "meta_ads_retrieval_validation.json": "Unchanged Strategy-F Meta Ads retrieval evidence",
    "whatsapp_sales_retrieval_validation.json": "Unchanged Strategy-F WhatsApp gap evidence",
    "post_ingestion_gap_coverage.json": "Honest before/after domain coverage",
    "remap_readiness.json": "Later method-remap and downstream readiness decision",
    "protection_snapshot_before.json": "Before-state hashes, counts and prior-vector fingerprint",
    "protection_validation.json": "After-state preservation evidence",
    "ingestion_execution.json": "Additive PostgREST insertion ledger",
    "new_chunks.json": "Validated traceable new chunk payloads",
    "new_embeddings.npy": "Validated new-only embedding vectors",
    "corpus_snapshot.before.json": "Rollback/read-only comparison copy of the prior canonical snapshot",
    "run_astra03d.py": "Resumable gate-specific prepare/embed/ingest/refresh/validate runner",
    "test_astra03d.py": "Deterministic gate artifact tests",
    "transcribe_meta_course.py": "Gate-local offline video transcription runner",
    "build_artifact_manifest.py": "Deterministic artifact inventory and hash generator",
    "meta_course_transcripts/transcription_manifest.json": "Local transcription execution evidence",
    "../ASTRA_03D_TARGETED_GAP_INGESTION_META_ADS_WHATSAPP_REPORT.md": "Human-readable gate report",
    "../ASTRA_03D_TEST_RESULTS.md": "Human-readable test report",
    "../../agent_loop/HANDOFF_ASTRA_03D_TARGETED_GAP_INGESTION_META_ADS_WHATSAPP.md": "Operational closeout handoff",
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

for path in sorted((OUT / "meta_course_transcripts").glob("*.txt")):
    entries.append({"path": path.relative_to(BASE).as_posix(),
                    "purpose": "Local ASR transcript unit for the admitted Meta Ads course",
                    "sha256": digest(path), "created_or_modified": "CREATED"})

manifest = {
    "gate": "ASTRA_03D_TARGETED_GAP_INGESTION_META_ADS_WHATSAPP",
    "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    "entry_count": len(entries) + 1,
    "artifacts": sorted(entries, key=lambda x: x["path"]) + [{
        "path": "astra/knowledge_gap_ingestion/artifact_manifest.json",
        "purpose": "Inventory and hashes for ASTRA-03D artifacts",
        "sha256": None,
        "created_or_modified": "CREATED",
        "hash_note": "Self-hash omitted because embedding it would change the file",
    }],
}
(OUT / "artifact_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"status": "MANIFEST_CREATED", "entries": manifest["entry_count"]}))
