import hashlib
import json
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]
OUT = BASE / "astra" / "knowledge_ingestion"

purposes = {
    "candidate_sources.json": "Bounded local source inventory and evidence fields",
    "source_admission.json": "ADMIT/DEFER/REJECT decisions",
    "source_coverage_plan.json": "Pre-ingestion coverage plan",
    "ingestion_batches.json": "Atomic batch and conflict policy plan",
    "extraction_qa.json": "Per-source extraction quality evidence",
    "chunk_qa.json": "Chunk integrity and distribution evidence",
    "embedding_validation.json": "Canonical model/vector validation and usage",
    "retrieval_validation.json": "Unchanged Strategy-F ten-domain results",
    "post_ingestion_coverage.json": "Before/after domain coverage",
    "protection_snapshot_before.json": "Protected before-state fingerprints",
    "protection_validation.json": "Protected after-state and preservation comparison",
    "ingestion_execution.json": "Remote additive insertion ledger",
    "method_registry_impact.json": "ASTRA-03C evidence readiness without registry mutation",
    "test_results.json": "Machine-readable 23-check acceptance suite",
    "new_chunks.json": "Validated additive chunk payload without vectors",
    "new_embeddings.npy": "Validated vectors for the 617 new chunks",
    "corpus_snapshot.before.json": "Rollback/reconciliation copy of prior 763-row data snapshot",
    "run_astra03b.py": "Gate-specific preparation/embedding/ingestion script",
    "validate_astra03b.py": "Post-ingestion unchanged-Strategy-F and protection validator",
    "test_astra03b.py": "Deterministic local acceptance suite",
    "build_manifest.py": "Deterministic artifact-manifest builder",
}
extra = [
    (BASE / "astra" / "ASTRA_03B_MULTI_DOMAIN_KNOWLEDGE_SOURCE_INGESTION_REPORT.md", "Final gate report", "created"),
    (BASE / "astra" / "ASTRA_03B_TEST_RESULTS.md", "Human-readable test report", "created"),
    (BASE / "astra" / "CURRENT_TASK.md", "Completed operational task state", "modified"),
    (BASE / "astra" / "HANDOFF_LATEST.md", "Latest operational handoff", "modified"),
    (BASE / "agent_loop" / "HANDOFF_ASTRA_03B_MULTI_DOMAIN_KNOWLEDGE_SOURCE_INGESTION.md", "Dedicated final handoff", "created"),
    (BASE / "agent_loop" / "AGENT_STATE.md", "Additive durable execution record", "modified"),
    (BASE / "rag_retrieval_refinement" / "corpus_snapshot.json", "Authorized additive Strategy-F corpus-data snapshot", "modified"),
]


def entry(path, purpose, status):
    return {"path": path.relative_to(BASE).as_posix(), "purpose": purpose, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "created_or_modified": status}


items = []
for p in sorted(OUT.iterdir()):
    if p.is_file() and p.name not in {"artifact_manifest.json"} and not p.name.startswith("__pycache__"):
        items.append(entry(p, purposes.get(p.name, "ASTRA-03B generated evidence artifact"), "created"))
for p, purpose, status in extra:
    items.append(entry(p, purpose, status))
items.append({"path": "astra/knowledge_ingestion/artifact_manifest.json", "purpose": "This manifest", "sha256": None, "created_or_modified": "created", "hash_note": "Self-hash omitted because inclusion changes the file hash"})
(OUT / "artifact_manifest.json").write_text(json.dumps({"gate": "ASTRA_03B_MULTI_DOMAIN_KNOWLEDGE_SOURCE_INGESTION", "artifact_count": len(items), "artifacts": items}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"status": "PASS", "artifact_count": len(items)}))
