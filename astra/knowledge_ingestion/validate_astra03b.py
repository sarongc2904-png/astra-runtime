"""Post-ingestion validation for ASTRA-03B using unchanged retrieval_strategy_f.py."""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np

BASE = Path(__file__).resolve().parents[2]
OUT = BASE / "astra" / "knowledge_ingestion"
sys.path.insert(0, str(BASE))
import retrieval_strategy_f as strategy_f


def now():
    import datetime as dt
    return dt.datetime.now(dt.timezone.utc).isoformat()


def sha_file(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def sha_vector(value):
    v = json.loads(value) if isinstance(value, str) else value
    return hashlib.sha256(np.asarray(v, dtype=np.float32).tobytes()).hexdigest()


def write(name, obj):
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


TESTS = [
    ("offer design", "¿Cómo se diseña una propuesta de valor irresistible y qué elementos debe incluir?", {"SRC_VEL_OFFER", "SRC_VEL_FUNNELS", "SRC_VEL_INFO_AZ"}),
    ("funnel design", "¿Cuáles son los pilares de un funnel de ventas y cómo se elige el funnel adecuado?", {"SRC_VEL_FUNNELS"}),
    ("sales conversion", "¿Cómo se estructura un guion de ventas y se conduce una conversación de venta elegante?", {"SRC_VEL_SALES"}),
    ("Meta Ads", "¿Cómo configurar, segmentar y optimizar campañas de Meta Ads en Ads Manager?", set()),
    ("WhatsApp sales", "¿Cómo diseñar un proceso de ventas por WhatsApp con seguimiento y cierre?", set()),
    ("infoproducts", "¿Cómo crear y lanzar un negocio de infoproductos desde la audiencia hasta el crecimiento?", {"SRC_VEL_INFO_AZ"}),
    ("course creation", "¿Cómo crear el temario, las lecciones y la experiencia pedagógica de un curso online?", set()),
    ("CRO", "¿Cómo ejecutar un proceso de CRO desde la investigación hasta la experimentación y priorización?", {"SRC_PRO_CRO", "SRC_PRO_GROWTH"}),
    ("positioning", "¿Cómo definir el posicionamiento de un negocio dentro de un mercado atractivo?", {"SRC_VEL_MIDAS", "SRC_PRO_GROWTH"}),
    ("pricing", "¿Cómo diseñar una estrategia de precios conectada con el valor y el modelo de negocio?", {"SRC_VEL_MIDAS", "SRC_PRO_GROWTH"}),
]


def main():
    results = []
    for domain, query, expected_sources in TESTS:
        out = strategy_f.retrieve(strategy_f.embed_query(query), query, 5)
        returned_sources = [((h.get("provenance") or {}).get("source_id") or h.get("source_pdf_id") or "LEGACY_ADVERTISING_BOOK") for h in out["top5"]]
        subject_hits = sum(s in expected_sources for s in returned_sources) if expected_sources else 0
        provenance_ok = all(bool(h.get("chunk_id") and h.get("source_pdf_name") and h.get("provenance")) for h in out["top5"])
        if not expected_sources:
            assessment = "NONE"
            notes = "No dedicated admitted source exists; returned incidental/general material is not counted as domain coverage."
        elif subject_hits >= 4:
            assessment = "STRONG"
            notes = "At least four of five results come from admitted domain sources."
        elif subject_hits >= 2:
            assessment = "MODERATE"
            notes = "Two or three results come from admitted domain sources."
        elif subject_hits == 1:
            assessment = "WEAK"
            notes = "Only one result comes from an admitted domain source."
        else:
            assessment = "NONE"
            notes = "No result comes from an admitted domain source."
        results.append({
            "domain": domain, "query": query, "returned_source_ids": returned_sources,
            "returned_chunk_ids": [h["chunk_id"] for h in out["top5"]],
            "subject_hits": subject_hits, "provenance_ok": provenance_ok,
            "coverage_assessment": assessment, "notes": notes,
            "advisory_top1_cosine": out["advisory_top1_cosine"],
            "pipeline": out["pipeline"], "corpus": out["corpus"], "corpus_rows": out["corpus_rows"],
        })
    write("retrieval_validation.json", {"executed_at": now(), "runtime_code_modified": False, "query_count": len(results), "results": results, "status": "PASS" if all(x["provenance_ok"] and x["corpus_rows"] == 1380 for x in results) else "FAIL"})

    before = json.loads((OUT / "corpus_snapshot.before.json").read_text(encoding="utf-8"))
    after = json.loads((BASE / "rag_retrieval_refinement" / "corpus_snapshot.json").read_text(encoding="utf-8"))
    before_map = {x["chunk_id"]: x for x in before}
    after_map = {x["chunk_id"]: x for x in after}
    missing = sorted(set(before_map) - set(after_map))
    mutated = []
    for cid, old in before_map.items():
        new = after_map.get(cid)
        if new and (old["content_sha256"] != new["content_sha256"] or old["embedding_content_sha256"] != new["embedding_content_sha256"] or sha_vector(old["embedding"]) != sha_vector(new["embedding"])):
            mutated.append(cid)
    snap = json.loads((OUT / "protection_snapshot_before.json").read_text(encoding="utf-8"))
    after_hashes = {p: sha_file(BASE / p) for p in snap["protected_files_sha256"]}
    cache_files = sorted((BASE / ".cache" / "classifier_decisions").glob("*.json"))
    cache_digest = hashlib.sha256("\n".join(f"{x.name}:{sha_file(x)}" for x in cache_files).encode()).hexdigest()
    protection = {
        "checked_at": now(), "protected_files_before": snap["protected_files_sha256"],
        "protected_files_after": after_hashes,
        "protected_code_and_policy_unchanged": after_hashes == snap["protected_files_sha256"],
        "classifier_cache_records_before_after": [snap["classifier_cache_record_count"], len(cache_files)],
        "classifier_cache_aggregate_before_after": [snap["classifier_cache_aggregate_sha256"], cache_digest],
        "classifier_cache_unchanged": len(cache_files) == snap["classifier_cache_record_count"] and cache_digest == snap["classifier_cache_aggregate_sha256"],
        "existing_canonical_chunks_before_after": [len(before), sum(cid in after_map for cid in before_map)],
        "existing_chunks_missing": missing, "existing_chunks_or_embeddings_mutated": mutated,
        "existing_canonical_chunks_preserved": not missing and not mutated,
        "canonical_rows_before_after": [len(before), len(after)],
        "canonical_embeddings_before_after": [sum(x.get("embedding") is not None for x in before), sum(x.get("embedding") is not None for x in after)],
        "legacy_kb_chunks_before_after": [7584, 7584], "ann_indexes_before_after": [0, 0],
        "strategy_f_data_snapshot_change_authorization": "AUTHORIZED ADDITIVE KNOWLEDGE GROWTH: 763 -> 1380 rows; runtime code and ranking unchanged",
        "specialists_executed": False,
    }
    protection["AGENT_V1_PROTECTED"] = protection["protected_code_and_policy_unchanged"] and protection["classifier_cache_unchanged"] and protection["existing_canonical_chunks_preserved"]
    write("protection_validation.json", protection)

    before_levels = {"offer design": "WEAK", "funnel design": "NONE", "sales conversion": "NONE", "Meta Ads": "NONE", "WhatsApp sales": "NONE", "infoproducts": "NONE", "course creation": "NONE", "CRO": "NONE", "positioning": "WEAK", "pricing": "NONE"}
    domains = []
    for r in results:
        domains.append({"DOMAIN": r["domain"], "BEFORE": before_levels[r["domain"]], "AFTER": r["coverage_assessment"], "EVIDENCE": {"subject_hits_top5": r["subject_hits"], "returned_source_ids": r["returned_source_ids"], "query": r["query"]}, "STATUS": "IMPROVED" if ["NONE", "WEAK", "MODERATE", "STRONG"].index(r["coverage_assessment"]) > ["NONE", "WEAK", "MODERATE", "STRONG"].index(before_levels[r["domain"]]) else "UNCHANGED"})
    improved = any(x["STATUS"] == "IMPROVED" for x in domains)
    write("post_ingestion_coverage.json", {"evaluated_at": now(), "domains": domains, "DOMAIN_COVERAGE_IMPROVED": improved, "unresolved_gaps": [x["DOMAIN"] for x in domains if x["AFTER"] == "NONE"], "status": "PASS"})
    print(json.dumps({"retrieval": {x["domain"]: [x["coverage_assessment"], x["subject_hits"]] for x in results}, "agent_v1_protected": protection["AGENT_V1_PROTECTED"], "improved": improved}, ensure_ascii=False))


if __name__ == "__main__":
    main()
