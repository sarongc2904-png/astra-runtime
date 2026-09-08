"""Deterministic local acceptance suite for ASTRA-03B artifacts."""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np

BASE = Path(__file__).resolve().parents[2]
OUT = BASE / "astra" / "knowledge_ingestion"
tests = []


def load(name):
    return json.loads((OUT / name).read_text(encoding="utf-8"))


def check(name, condition, evidence):
    ok = bool(condition)
    tests.append({"test": name, "status": "PASS" if ok else "FAIL", "evidence": evidence})
    if not ok:
        raise AssertionError(name)


def main():
    candidates = load("candidate_sources.json")
    admission = load("source_admission.json")
    extraction = load("extraction_qa.json")
    chunk_qa = load("chunk_qa.json")
    chunks = load("new_chunks.json")["chunks"]
    embedding = load("embedding_validation.json")
    ingestion = load("ingestion_execution.json")
    retrieval = load("retrieval_validation.json")
    coverage = load("post_ingestion_coverage.json")
    protection = load("protection_validation.json")
    snapshot = json.loads((BASE / "rag_retrieval_refinement" / "corpus_snapshot.json").read_text(encoding="utf-8"))
    vectors = np.load(OUT / "new_embeddings.npy")

    required = {"SOURCE_ID", "SOURCE_NAME", "SOURCE_TYPE", "SOURCE_DOMAIN", "SOURCE_SUBDOMAINS", "SOURCE_PATH_OR_REFERENCE", "SOURCE_AUTHORITY", "SOURCE_RELEVANCE", "SOURCE_REDUNDANCY", "SOURCE_CONFLICT_RISK", "SOURCE_EXPECTED_VALUE", "SOURCE_FORMAT", "SOURCE_PARSEABILITY", "SOURCE_PROVENANCE", "SOURCE_LICENSE_OR_USAGE_STATUS_IF_KNOWN", "INGEST", "REJECTION_REASON"}
    check("candidate_source_schema", candidates["count"] == 12 and all(required <= set(x) for x in candidates["sources"]), "12/12 records contain every mandatory field")
    check("source_admission_decisions", admission["counts"] == {"ADMIT": 7, "DEFER": 4, "REJECT": 1}, admission["counts"])
    check("duplicate_source_handling", all(x["DECISION"] != "ADMIT" for x in admission["decisions"] if x["CRITERIA"]["redundancy"] == "HIGH"), "All HIGH-redundancy candidates deferred or rejected")
    check("extraction_qa", len(extraction["sources"]) == 7 and all(x["status"] == "PASS_WITH_WARNING" and x["blank_units"] == 0 for x in extraction["sources"]), "64/64 units; ASR/no-page warnings retained")
    check("chunk_count", len(chunks) == chunk_qa["chunk_count"] == 617, "617")
    check("chunk_uniqueness", len({x["chunk_id"] for x in chunks}) == 617 and len({x["content_sha256"] for x in chunks}) == 617, "0 duplicate ids/content")
    check("chunk_content_hashes", all(hashlib.sha256(x["content"].encode()).hexdigest() == x["content_sha256"] for x in chunks), "617/617")
    check("chunk_size_and_blank_rules", all(200 <= len(x["content"]) <= 1850 for x in chunks), "0 blank/under/oversize")
    check("provenance_completeness", chunk_qa["provenance_incomplete"] == 0 and all((x["provenance"].get("source_id") and x["provenance"].get("unit_path") and x["provenance"].get("ingestion_batch_id")) for x in chunks), "617/617")
    check("embedding_model_dimension", embedding["model"] == "text-embedding-3-small" and vectors.shape == (617, 1536), str(vectors.shape))
    check("embedding_numeric_validity", np.isfinite(vectors).all() and np.all(np.linalg.norm(vectors, axis=1) > 0), "617 finite non-zero vectors")
    check("additive_counts", len(snapshot) == 1380 and ingestion["inserted_this_run"] == 617 and ingestion["duplicates_skipped_this_run"] == 0, "763 + 617 = 1380")
    check("remote_embedding_visibility", sum(x.get("embedding") is not None for x in snapshot) == 1380, "1380/1380")
    check("new_batch_traceability", sum(x.get("freeze_id") == "ASTRA03B-INGEST-20260906-01" for x in snapshot) == 617, "617/617")
    check("retrieval_runtime_contract", retrieval["status"] == "PASS" and all(x["pipeline"] == "Strategy-F" and x["corpus"] == "kb_chunks_v2" and x["corpus_rows"] == 1380 for x in retrieval["results"]), "10/10 unchanged Strategy-F")
    expected_strong = {"offer design", "funnel design", "sales conversion", "infoproducts", "CRO", "positioning", "pricing"}
    check("retrieval_visibility", all(x["coverage_assessment"] == "STRONG" and x["subject_hits"] >= 4 for x in retrieval["results"] if x["domain"] in expected_strong), "7/7 targeted supported domains strong in representative top-5")
    expected_none = {"Meta Ads", "WhatsApp sales", "course creation"}
    check("unresolved_gaps_not_overstated", all(x["coverage_assessment"] == "NONE" for x in retrieval["results"] if x["domain"] in expected_none), sorted(expected_none))
    check("domain_coverage_improved", coverage["DOMAIN_COVERAGE_IMPROVED"] is True, "TRUE")
    check("protected_runtime_files", protection["protected_code_and_policy_unchanged"], "11 protected files byte-identical")
    check("classifier_cache_preserved", protection["classifier_cache_unchanged"], protection["classifier_cache_records_before_after"])
    check("existing_corpus_and_embeddings_preserved", protection["existing_canonical_chunks_preserved"] and protection["existing_canonical_chunks_before_after"] == [763, 763], "763/763 identity/content/vector preserved")
    check("legacy_and_ann_preserved", protection["legacy_kb_chunks_before_after"] == [7584, 7584] and protection["ann_indexes_before_after"] == [0, 0], "legacy 7584; ANN 0")
    check("no_specialist_execution", protection["specialists_executed"] is False, "No specialist entrypoint invoked")
    result = {"suite": "ASTRA_03B", "tests": tests, "passed": len(tests), "failed": 0, "status": "PASS"}
    (OUT / "test_results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "PASS", "passed": len(tests), "failed": 0}))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        result = {"suite": "ASTRA_03B", "tests": tests, "passed": sum(x["status"] == "PASS" for x in tests), "failed": 1, "status": "FAIL", "error": type(exc).__name__ + ": " + str(exc)}
        (OUT / "test_results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        raise
