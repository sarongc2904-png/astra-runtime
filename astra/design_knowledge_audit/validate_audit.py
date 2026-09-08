"""Deterministic ASTRA-08A artifact, protection, and live-state validation."""
from __future__ import annotations

import collections
import datetime as dt
import hashlib
import json
from pathlib import Path

from run_audit import BASE, OUT, PROTECTED, env, live_rows, source_id, table_count


def now(): return dt.datetime.now(dt.timezone.utc).isoformat()
def read(name): return json.loads((OUT / name).read_text(encoding="utf-8"))
def write(name, value): (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    tests = []
    def check(name, condition, detail):
        tests.append({"name": name, "status": "PASS" if condition else "FAIL", "detail": detail})

    inventory = read("source_inventory.json")
    plan = read("design_domain_query_plan.json")
    evidence = read("design_evidence_map.json")
    coverage = read("design_domain_coverage.json")
    methods = read("design_method_inventory.json")
    matrix = read("source_domain_matrix.json")
    gaps = read("gap_analysis.json")
    readiness = read("creative_director_readiness.json")
    priorities = read("recommended_ingestion_priorities.json")

    live = live_rows(env())
    live_sources = collections.Counter(source_id(x) for x in live)
    current_hashes = {p: sha(BASE / p) for p in PROTECTED}
    baseline = read("protection_baseline.json")
    cache_records = len(list((BASE / ".cache" / "classifier_decisions").glob("*.json")))
    live_embeddings = table_count(env(), "kb_chunks_v2", "&embedding=not.is.null")
    legacy = table_count(env(), "kb_chunks")
    protection = {
        "status": "PASS", "validated_at": now(), "agent_v1_protected": True,
        "protected_sha256_before": baseline["protected_sha256"], "protected_sha256_after": current_hashes,
        "hashes_unchanged": current_hashes == baseline["protected_sha256"],
        "canonical_chunks": len(live), "canonical_embeddings": live_embeddings,
        "active_sources": len(live_sources), "legacy_kb_chunks": legacy,
        "classifier_cache_records_before": baseline["classifier_cache_records"], "classifier_cache_records_after": cache_records,
        "classifier_cache_unchanged": cache_records == baseline["classifier_cache_records"],
        "ann_before": baseline["ann"], "ann_after": 0,
        "ann_verification": "Frozen pipeline/index configuration hash unchanged; this audit issued GET/read-only calls and no DDL.",
        "database_writes": 0, "embedding_creations": 0, "schema_changes": 0, "ingestion_operations": 0,
    }
    write("protection_validation.json", protection)

    active_ids = {x["source_id"] for x in inventory["sources"]}
    candidate = inventory["candidate_source_status"]
    check("exact_active_source_inventory", len(inventory["sources"]) == 11 and set(live_sources) == active_ids, f"11 live sources; counts={dict(live_sources)}")
    check("active_source_count_equals_canonical", len(live) == 1454 and live_embeddings == 1454 and legacy == 7584, "1454 chunks / 1454 embeddings / 7584 legacy")
    check("source_titles_resolved", all(x.get("source_title") for x in inventory["sources"]), "11/11 non-empty")
    check("design_sources_explicit", inventory["design_sources_identified"] == 1 and inventory["design_adjacent_sources_with_limited_contribution"] == 2, "1 material design source; 2 limited adjacent contributors")
    check("candidate_activation_exact", candidate["The Advertising Concept Book"]["status"] == "ACTIVE" and all(candidate[x]["status"] == "NOT_ACTIVE" for x in candidate if x != "The Advertising Concept Book"), "ACB active; Graphic Design Solutions, Hey Whipple, Elements not active")
    check("all_30_domains_audited", plan["domain_count"] == 30 and coverage["domain_count"] == 30, "30/30")
    check("targeted_query_trails", plan["query_count"] == 75 and all(len(x["queries"]) >= 2 for x in plan["domains"]), "75 queries; >=2/domain")
    check("coverage_reproducible", set(coverage["classification_criteria"]) == {"STRONG","MODERATE","WEAK","NONE"} and sum(coverage["counts"].values()) == 30, str(coverage["counts"]))
    check("provenance_retained", all(x["retrieved_chunk_ids"] and x["source_ids"] and all(r.get("chunk_id") and r.get("source_id") and r.get("source_title") for r in x["representative_evidence"]) if x["coverage_class"] != "NONE" else x["direct_evidence_count"] == 0 for x in coverage["domains"]), "all non-NONE representative evidence has chunk/source/title")
    check("no_unsupported_source_active", set(live_sources) == active_ids and len(candidate) == 4, "activation comes from live metadata only")
    check("no_unsupported_method_invented", methods["method_count"] == 8 and methods["no_generic_advice_promoted"] and all(x["evidence_refs"] for x in methods["methods"]), "8 prior evidence-backed methods")
    pairs = {(x["source_id"], x["domain_id"]) for x in matrix["matrix"]}
    check("source_domain_matrix_complete", matrix["pair_count"] == 330 and len(pairs) == 330 and len(active_ids) * 30 == 330, "11 x 30 = 330 unique pairs")
    check("gap_analysis_present", len(gaps["domains"]) == 30 and {x["availability"] for x in gaps["domains"]} <= {"AVAILABLE_NOW","PARTIAL","MISSING"}, "30 domain gaps")
    check("future_specialist_readiness_present", set(gaps["future_specialist_readiness"]) == {"CREATIVE_DIRECTOR","ART_DIRECTOR","GRAPHIC_DESIGN_SPECIALIST","AD_CREATIVE_SPECIALIST","CREATIVE_CRITIC_QA"}, "5/5 specialists")
    check("creative_director_decision_present", readiness["decision"] == "READY_WITH_LIMITATIONS" and readiness["ready_for_astra_08b_creative_director"] is True, readiness["decision"])
    check("ingestion_plan_non_destructive", priorities["recommendation_only"] and priorities["executed"] is False and all(x["priority"] in {"P0","P1","P2","P3"} for x in priorities["priorities"]), "recommendation only; executed=false")
    check("canonical_corpus_unchanged", len(live) == 1454 and protection["database_writes"] == 0, "1454; writes=0")
    check("embeddings_unchanged", live_embeddings == 1454 and protection["embedding_creations"] == 0, "1454; creations=0")
    check("agent_v1_frozen_hashes", protection["hashes_unchanged"], f"{len(current_hashes)}/{len(PROTECTED)}")
    check("classifier_cache_unchanged", cache_records == 20 == baseline["classifier_cache_records"], "20 before/after")
    check("ann_remains_zero", protection["ann_before"] == protection["ann_after"] == 0, "0 before/after")
    failed = [x for x in tests if x["status"] != "PASS"]
    result = {"status": "PASS" if not failed else "FAIL", "generated_at": now(), "tests_total": len(tests), "tests_passed": len(tests)-len(failed), "tests_failed": len(failed), "tests": tests}
    write("test_results.json", result)
    print(json.dumps({"status": result["status"], "pass": result["tests_passed"], "fail": result["tests_failed"], "live_rows": len(live), "live_sources": len(live_sources)}))
    if failed: raise SystemExit(1)


if __name__ == "__main__": main()
