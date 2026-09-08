"""ASTRA-08A read-only design knowledge audit acquisition.

Reads live kb_chunks_v2 metadata through PostgREST, verifies it against the
canonical local Strategy-F snapshot, embeds only the bounded audit queries, and
writes concise provenance-preserving evidence. It performs no database writes.
"""
from __future__ import annotations

import collections
import datetime as dt
import hashlib
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]
OUT = BASE / "astra" / "design_knowledge_audit"
ENV_PATH = BASE / "transcripciones" / "claude-code-embeddings" / "claude-code-embeddings" / ".env"
sys.path.insert(0, str(BASE))
import retrieval_strategy_f as strategy_f  # noqa: E402

DOMAINS = [
    ("01", "visual composition", ["visual composition advertising", "composition in graphic design", "visual balance layout"]),
    ("02", "visual hierarchy", ["visual hierarchy advertising", "hierarchy graphic design", "focal point hierarchy"]),
    ("03", "layout", ["layout principles graphic design", "advertising layout composition", "organizing elements on a page"]),
    ("04", "grids", ["grid systems graphic design", "advertising layout grid", "columns modular grid design"]),
    ("05", "typography", ["typography hierarchy", "type legibility advertising", "typography visual communication"]),
    ("06", "color", ["color principles advertising", "color graphic design communication", "color palette brand advertising"]),
    ("07", "contrast", ["visual contrast graphic design", "contrast advertising layout", "contrast creates emphasis"]),
    ("08", "balance", ["visual balance design", "asymmetrical balance advertising", "balance composition layout"]),
    ("09", "rhythm", ["visual rhythm graphic design", "rhythm repetition layout", "movement rhythm advertising design"]),
    ("10", "negative space", ["negative space advertising", "white space graphic design", "empty space visual communication"]),
    ("11", "branding", ["branding principles visual communication", "brand consistency advertising", "brand expression design"]),
    ("12", "visual identity", ["visual identity system", "brand identity graphic design", "identity elements logo typography color"]),
    ("13", "art direction", ["art direction principles", "visual direction advertising", "art director advertising execution"]),
    ("14", "advertising concept", ["advertising concept development", "visual advertising idea", "creative concept advertising"]),
    ("15", "single-minded proposition / SMP", ["single minded proposition", "single-minded proposition advertising", "one proposition creative brief"]),
    ("16", "headline-image relationship", ["headline image relationship", "copy and visual relationship advertising"]),
    ("17", "visual metaphor", ["visual metaphor advertising", "metaphor image creative concept"]),
    ("18", "copywriting for visual ads", ["copywriting for visual advertising", "headline body copy visual ad"]),
    ("19", "photography / image direction", ["photography direction advertising", "image selection art direction"]),
    ("20", "editorial design", ["editorial design principles", "magazine page layout typography"]),
    ("21", "print advertising", ["print advertising design", "print ad layout headline visual"]),
    ("22", "digital advertising", ["digital advertising creative design", "online ad creative principles"]),
    ("23", "performance creative", ["performance creative advertising", "conversion-oriented creative"]),
    ("24", "social / Meta ad creative", ["social ad creative", "Meta Facebook ad creative"]),
    ("25", "mobile-first creative", ["mobile-first ad creative", "mobile advertising design"]),
    ("26", "scroll-stopping principles", ["scroll stopping creative", "attention grabbing social advertising"]),
    ("27", "CTA visual hierarchy", ["call to action visual hierarchy", "CTA placement contrast advertising"]),
    ("28", "information density", ["information density graphic design", "reduce clutter advertising layout"]),
    ("29", "readability / legibility", ["readability legibility graphic design", "legible type advertising"]),
    ("30", "creative evaluation / critique", ["evaluate advertising creative", "creative critique criteria"]),
]

PROTECTED = [
    "knowledge.js", "classifier_decision_cache.js", "retrieval_strategy_f.py",
    "rag_retrieval_refinement/recommended_pipeline.json",
    "rag_retrieval_qa/benchmark.json", "rag_retrieval_qa/benchmark_ground_truth.json",
    "e2e_benchmark_evidence_rebuild/rebuilt_evidence.json", "rag_answer_policy_runtime.js",
    "config.json", "evaluator_reselection/selected_evaluator.json",
    "evaluator_reselection/evaluator_rubric.json",
]


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def sha(path: Path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(name: str, obj):
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def env():
    values = {}
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            values[k.strip()] = v.strip().strip('"').strip("'")
    for key in ("OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        values[key] = os.environ.get(key, values.get(key))
        if not values[key]:
            raise RuntimeError(f"required credential unavailable: {key}")
    if "ftoxermwkfebmnrudiuu" not in values["SUPABASE_URL"]:
        raise RuntimeError("unexpected Supabase project")
    return values


def get_json(url: str, key: str, timeout=180):
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + key, "apikey": key})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.load(response)


def table_count(cfg, table, extra=""):
    url = cfg["SUPABASE_URL"] + f"/rest/v1/{table}?select=chunk_id&limit=1" + extra
    req = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + cfg["SUPABASE_SERVICE_ROLE_KEY"],
        "apikey": cfg["SUPABASE_SERVICE_ROLE_KEY"], "Prefer": "count=exact", "Range": "0-0",
    })
    with urllib.request.urlopen(req, timeout=60) as response:
        count = int(response.headers["Content-Range"].rsplit("/", 1)[1])
        response.read()
        return count


def live_rows(cfg):
    fields = "chunk_id,document_id,content,content_sha256,source_pdf_id,source_pdf_name,source_metadata,provenance,pdf_page_refs,rag_decision,quality_status,warning_flags,embedding_version"
    rows = []
    for offset in range(0, 5000, 250):
        query = urllib.parse.urlencode({"select": fields, "order": "chunk_id.asc", "limit": 250, "offset": offset})
        batch = get_json(cfg["SUPABASE_URL"] + "/rest/v1/kb_chunks_v2?" + query, cfg["SUPABASE_SERVICE_ROLE_KEY"])
        rows.extend(batch)
        if len(batch) < 250:
            break
    return rows


def embed_queries(cfg, queries):
    body = json.dumps({"model": "text-embedding-3-small", "input": queries, "dimensions": 1536}).encode()
    req = urllib.request.Request("https://api.openai.com/v1/embeddings", data=body,
        headers={"Authorization": "Bearer " + cfg["OPENAI_API_KEY"], "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=180) as response:
        payload = json.load(response)
    ordered = sorted(payload["data"], key=lambda x: x["index"])
    return [x["embedding"] for x in ordered], payload.get("usage", {})


def source_id(row):
    return (row.get("provenance") or {}).get("source_id") or row.get("source_pdf_id") or row.get("source_pdf_name")


def source_title(row):
    meta = row.get("source_metadata") or {}
    prov = row.get("provenance") or {}
    return meta.get("source_document") or prov.get("source_name") or row.get("source_pdf_name")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cfg = env()
    before = {
        "captured_at": now(), "authorization": "HUMAN_AUTHORIZATION_ASTRA_08A_DESIGN_KNOWLEDGE_COVERAGE_AUDIT_2026-09-06",
        "protected_sha256": {p: sha(BASE / p) for p in PROTECTED},
        "classifier_cache_records": len(list((BASE / ".cache" / "classifier_decisions").glob("*.json"))),
        "ann": 0, "mutation_operations": 0,
    }
    write("protection_baseline.json", before)

    live = live_rows(cfg)
    local = json.loads((BASE / "rag_retrieval_refinement" / "corpus_snapshot.json").read_text(encoding="utf-8"))
    live_by_id = {x["chunk_id"]: x for x in live}
    local_by_id = {x["chunk_id"]: x for x in local}
    id_match = set(live_by_id) == set(local_by_id)
    content_hash_match = id_match and all(
        (live_by_id[k].get("content_sha256") or hashlib.sha256(live_by_id[k]["content"].encode()).hexdigest()) ==
        (local_by_id[k].get("content_sha256") or hashlib.sha256(local_by_id[k]["content"].encode()).hexdigest())
        for k in live_by_id
    )
    if len(live) != 1454 or not id_match or not content_hash_match:
        raise RuntimeError("live corpus does not match canonical Strategy-F snapshot")

    grouped = collections.defaultdict(list)
    for row in live:
        grouped[source_id(row)].append(row)
    sources = []
    for sid, rows in sorted(grouped.items()):
        sample = rows[0]; meta = sample.get("source_metadata") or {}; prov = sample.get("provenance") or {}
        sources.append({
            "source_id": sid, "source_title": source_title(sample), "source_pdf_name": sample.get("source_pdf_name"),
            "source_type": meta.get("source_type") or prov.get("source_type") or "PDF_BOOK",
            "category": meta.get("domain") or prov.get("domain") or "advertising creative/design",
            "subdomains": meta.get("subdomains") or prov.get("subdomains") or [], "chunk_count": len(rows),
            "activation_evidence": "current live public.kb_chunks_v2 metadata",
        })
    candidates = {
        "The Advertising Concept Book": next((s["source_id"] for s in sources if "Advertising-Concept-Book" in (s.get("source_title") or "")), None),
        "Graphic Design Solutions": next((s["source_id"] for s in sources if "Graphic Design Solutions" in (s.get("source_title") or "")), None),
        "Hey, Whipple, Squeeze This": next((s["source_id"] for s in sources if "Whipple" in (s.get("source_title") or "")), None),
        "The Elements of Graphic Design": next((s["source_id"] for s in sources if "Elements of Graphic Design" in (s.get("source_title") or "")), None),
    }
    write("source_inventory.json", {
        "status": "LIVE_VERIFIED", "captured_at": now(), "project_ref": "ftoxermwkfebmnrudiuu",
        "corpus": "public.kb_chunks_v2", "active_source_count": len(sources), "chunk_count": len(live),
        "embedding_count": table_count(cfg, "kb_chunks_v2", "&embedding=not.is.null"),
        "legacy_kb_chunks": table_count(cfg, "kb_chunks"), "live_local_chunk_ids_match": id_match,
        "live_local_content_hashes_match": content_hash_match, "sources": sources,
        "candidate_source_status": {k: {"status": "ACTIVE" if v else "NOT_ACTIVE", "source_id": v} for k, v in candidates.items()},
    })
    write("design_domain_query_plan.json", {
        "generated_at": now(), "pipeline": "Strategy-F", "corpus": "kb_chunks_v2", "top_k_per_query": 5,
        "read_minimum_necessary_context": True, "domain_count": len(DOMAINS),
        "query_count": sum(len(x[2]) for x in DOMAINS),
        "domains": [{"domain_id": i, "domain_name": n, "queries": q} for i, n, q in DOMAINS],
    })

    source_id_by_pdf_name = {row.get("source_pdf_name"): source_id(row) for row in live}
    queries = [q for _, _, qs in DOMAINS for q in qs]
    vectors, usage = embed_queries(cfg, queries)
    cursor = 0; evidence_domains = []
    for did, name, qs in DOMAINS:
        results = []
        for query in qs:
            result = strategy_f.retrieve(strategy_f.np.array(vectors[cursor], dtype=strategy_f.np.float64), query, 5)
            cursor += 1
            hits = []
            for h in result["top5"]:
                prov = h.get("provenance") or {}
                hits.append({
                    "rank": h["rank"], "chunk_id": h["chunk_id"],
                    "source_id": prov.get("source_id") or h.get("source_pdf_id") or source_id_by_pdf_name.get(h.get("source_pdf_name")) or h.get("source_pdf_name"),
                    "source_title": h.get("source_pdf_name"), "pdf_page_refs": h.get("pdf_page_refs"),
                    "original_query_cosine": h.get("original_query_cosine"),
                    "representative_excerpt": " ".join((h.get("content") or "").split())[:360],
                })
            results.append({"query": query, "top5": hits, "advisory_top1_cosine": result["advisory_top1_cosine"]})
        evidence_domains.append({"domain_id": did, "domain_name": name, "queries": results})
    write("design_evidence_map.json", {
        "generated_at": now(), "pipeline": "Strategy-F", "corpus": "kb_chunks_v2", "corpus_rows": len(local),
        "domain_count": len(DOMAINS), "query_count": len(queries), "retrieved_slots": len(queries) * 5,
        "embedding_model": "text-embedding-3-small", "embedding_usage": usage, "domains": evidence_domains,
    })
    print(json.dumps({"status": "PASS", "sources": len(sources), "rows": len(live), "queries": len(queries), "retrieved_slots": len(queries) * 5, "embedding_usage": usage}))


if __name__ == "__main__":
    main()
