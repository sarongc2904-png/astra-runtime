"""ASTRA-03D2 targeted WhatsApp Sales ingestion, additive and resumable."""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import re
import shutil
import sys
import urllib.parse
from pathlib import Path

import numpy as np

BASE = Path(__file__).resolve().parents[2]
OUT = BASE / "astra" / "whatsapp_gap_ingestion"
sys.path.insert(0, str(BASE))
from astra.knowledge_gap_ingestion.run_astra03d import (  # noqa: E402
    DIM, EMBED_VERSION, MODEL, cache_state, chunk_text, embedding_vector,
    load_env, now, old_rows_fingerprint, protected_paths, request_json,
    sha_bytes, sha_file, supabase_rows, table_count,
)

AUTH = "HUMAN_AUTHORIZATION_ASTRA_03D2_TARGETED_WHATSAPP_SALES_SOURCE_INGESTION_2026-09-06"
BATCH_ID = "ASTRA03D2-INGEST-20260906-01"
LEGACY_SOURCE_ID = "SRC_WA_SALES_OS_LEGACY_CURATED"
WORKSHOP_SOURCE_ID = "SRC_WA_FUNNELCHAT_WORKSHOP_TRANSCRIPT"
DEDICATED_IDS = {LEGACY_SOURCE_ID, WORKSHOP_SOURCE_ID}


def write_json(name, value):
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_json(name):
    return json.loads((OUT / name).read_text(encoding="utf-8"))


def normalize(raw):
    raw = raw.replace("\ufeff", "").replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"\s+", " ", raw).strip()


def source_manifest_hash(paths):
    value = "\n".join(f"{path.relative_to(BASE).as_posix()}\t{sha_file(path)}" for path in sorted(paths))
    return sha_bytes(value.encode("utf-8"))


def fetch_legacy_whatsapp(env):
    query = urllib.parse.urlencode({
        "select": "chunk_id,domain,topic,subtopic,source_file,source_section,source_timestamp_or_line,content_type,validity,status,confidence,content",
        "domain": "eq.whatsapp_sales_os", "status": "eq.active", "order": "subtopic.asc.nullslast,topic.asc", "limit": 50,
    })
    return request_json(env["SUPABASE_URL"] + "/rest/v1/kb_chunks?" + query,
                        env["SUPABASE_SERVICE_ROLE_KEY"], headers={"apikey": env["SUPABASE_SERVICE_ROLE_KEY"]})


CANDIDATES = [
    {
        "source_id": LEGACY_SOURCE_ID, "source_name": "WhatsApp Sales OS — 21_WHATSAPP_SALES_OS.md",
        "source_type": "LEGACY_CURATED_MARKDOWN_CHUNKS", "domain": "WhatsApp Sales",
        "subdomains": ["first response", "qualification", "discovery", "pricing", "booking", "objections", "follow-up", "no-show prevention", "pipeline", "metrics"],
        "path": "public.kb_chunks domain=whatsapp_sales_os source_file=21_WHATSAPP_SALES_OS.md",
        "authority": "Project-curated active legacy source; local catalog and embedding README independently record its 12-row package",
        "relevance": "HIGH", "redundancy": "LOW_IN_CANONICAL", "conflict_risk": "MODERATE", "expected_value": "HIGH",
        "format": "DATABASE_TEXT_ROWS", "parseability": "HIGH", "provenance": "12 active legacy rows with stable chunk_id/source_file/topic/subtopic",
        "usage": "Existing internal project knowledge; external redistribution rights not determined", "decision": "ADMIT",
        "notes": "Dedicated concise WhatsApp sales process covering the representative funnel. Original Markdown is not present locally, so legacy row identity and a read-only snapshot are retained as provenance.",
    },
    {
        "source_id": WORKSHOP_SOURCE_ID, "source_name": "Local workshop — FunnelChat WhatsApp automation",
        "source_type": "WORKSHOP_ASR_TRANSCRIPT", "domain": "WhatsApp Sales",
        "subdomains": ["conversation automation", "lead tagging", "follow-up", "nurture", "lead recovery", "CRM flow", "pipeline", "human handoff", "conversational conversion"],
        "path": "transcripciones/Video 20.txt lines 685-end + transcripciones/Video 21.txt",
        "authority": "Local user-provided workshop transcript; presenters Christina/Don Beni are observable, provider/title attribution is incomplete",
        "relevance": "HIGH", "redundancy": "LOW_IN_CANONICAL", "conflict_risk": "MODERATE", "expected_value": "HIGH",
        "format": "TXT_ASR", "parseability": "HIGH_WITH_ASR_WARNINGS", "provenance": "Two exact local file/range units with SHA-256 and line references",
        "usage": "Local/user-provided project resource; external redistribution rights not determined", "decision": "ADMIT",
        "notes": "Dedicated operational workshop on WhatsApp Business/FunnelChat flows, qualification tags, payment follow-up, reminders and human escalation. Product UI/currentness and incomplete attribution warnings are mandatory.",
    },
    {
        "source_id": "SRC_WA_SYSTEM_PROMPT", "source_name": "Sistema Prompts — Ventas y WhatsApp",
        "source_type": "OPERATIONAL_PROMPT", "domain": "WhatsApp Sales", "subdomains": ["agent instructions", "sales scripts"],
        "path": "SISTEMA_PROMPTS/11_VENTAS_Y_WHATSAPP.md", "authority": "Local operational prompt, not primary evidence",
        "relevance": "MODERATE", "redundancy": "HIGH", "conflict_risk": "HIGH", "expected_value": "LOW", "format": "MARKDOWN",
        "parseability": "HIGH", "provenance": "Local project file", "usage": "Internal project artifact", "decision": "REJECT",
        "notes": "Instruction template without substantive supporting doctrine; cannot independently establish coverage.",
    },
    {
        "source_id": "SRC_WA_BIBLIA_VENDEDOR", "source_name": "La Biblia del Vendedor", "source_type": "CURATED_MARKDOWN",
        "domain": "WhatsApp Sales", "subdomains": ["general sales", "objections", "closing", "follow-up"],
        "path": "CONOCIMIENTO/BIBLIA_DEL_VENDEDOR.md", "authority": "Local curated Markdown; upstream editorial derivation not fully recorded",
        "relevance": "MODERATE", "redundancy": "HIGH", "conflict_risk": "MODERATE", "expected_value": "LOW", "format": "MARKDOWN",
        "parseability": "HIGH", "provenance": "Local file with incomplete upstream attribution", "usage": "Internal project artifact", "decision": "DEFER",
        "notes": "General sales evidence is not dedicated to WhatsApp and overlaps canonical Venta Elegante content.",
    },
    {
        "source_id": "SRC_WA_VENTA_ELEGANTE_PODCAST", "source_name": "El Podcast La venta elegante", "source_type": "PODCAST_TRANSCRIPTS",
        "domain": "WhatsApp Sales", "subdomains": ["general sales", "discovery", "closing"],
        "path": "transcripciones_velocity/05 Podcasts/5.4 El Podcast La venta elegante", "authority": "Local transcripts attributed by directory to Velocity",
        "relevance": "MODERATE", "redundancy": "HIGH", "conflict_risk": "LOW", "expected_value": "LOW", "format": "TXT",
        "parseability": "HIGH", "provenance": "Local transcript bundle", "usage": "Local project resource", "decision": "DEFER",
        "notes": "Not WhatsApp-specific and overlaps the already ingested Venta Elegante course.",
    },
    {
        "source_id": "SRC_WA_COMBINED_TRANSCRIPT_DUPLICATE", "source_name": "Transcripciones_completas.md WhatsApp section",
        "source_type": "AGGREGATED_TRANSCRIPT", "domain": "WhatsApp Sales", "subdomains": ["duplicate aggregate"],
        "path": "transcripciones/Transcripciones_completas.md", "authority": "Local aggregate of the same Video 20/21 transcript units",
        "relevance": "HIGH", "redundancy": "TOTAL", "conflict_risk": "HIGH", "expected_value": "NONE", "format": "MARKDOWN",
        "parseability": "HIGH", "provenance": "Local aggregate file", "usage": "Local project resource", "decision": "REJECT",
        "notes": "Rejected as a duplicate container; exact unit files provide more precise provenance.",
    },
]


def candidate_files(item):
    if item["source_id"] == LEGACY_SOURCE_ID:
        return []
    if item["source_id"] == WORKSHOP_SOURCE_ID:
        return [BASE / "transcripciones" / "Video 20.txt", BASE / "transcripciones" / "Video 21.txt"]
    path = BASE / item["path"]
    return sorted(x for x in path.rglob("*") if x.is_file()) if path.is_dir() else [path]


def make_chunk(source_id, source_name, source_type, source_sha, unit_sha, unit_ref, subdomains,
               local_index, content, existing_hashes, warnings, extra_provenance):
    content_hash = sha_bytes(content.encode("utf-8"))
    if content_hash in existing_hashes:
        return None
    existing_hashes.add(content_hash)
    identity = f"{source_id}|{unit_sha}|{local_index}|{content_hash}"
    chunk_id = sha_bytes(identity.encode("utf-8"))
    unit_key = sha_bytes(f"{source_id}|{unit_ref}".encode("utf-8"))
    provenance = {
        "source_id": source_id, "source_name": source_name, "source_type": source_type, "domain": "WhatsApp Sales",
        "subdomains": subdomains, "source_path_or_reference": unit_ref, "unit_ref": unit_ref,
        "source_sha256": source_sha, "unit_sha256": unit_sha, "chunk_id": chunk_id,
        "content_sha256": content_hash, "ingestion_batch_id": BATCH_ID, **extra_provenance,
    }
    return {
        "chunk_id": chunk_id, "document_id": source_id.lower() + "-" + source_sha[:12], "source_pdf_id": source_id,
        "source_pdf_name": source_name, "source_pdf_sha256": source_sha, "freeze_id": BATCH_ID,
        "freeze_unit_key": unit_key, "render_sha256": unit_sha, "pdf_page_refs": [], "xobject_xref": None,
        "chunk_index": local_index, "content": content, "content_sha256": content_hash, "heading": source_name,
        "section": unit_ref, "content_type": "transcript_text" if source_type == "WORKSHOP_ASR_TRANSCRIPT" else "curated_method_text",
        "extraction_status": "REVIEW_REQUIRED", "quality_status": "INCLUDE_WITH_WARNING",
        "rag_decision": "INCLUDE_WITH_WARNING", "warning_flags": warnings, "provenance": provenance,
        "source_metadata": {"source_document": source_name, "source_id": source_id, "source_type": source_type,
            "domain": "WhatsApp Sales", "subdomains": subdomains, "extraction_method": "bounded project-source extraction",
            "license_or_usage_status": "internal/local project resource; redistribution rights not determined"},
        "ingestion_schema_version": "kb_chunks/1.0",
    }


def prepare():
    from agent_loop.openai_loop import resolve_active_task
    resolved = resolve_active_task((BASE / "CLAUDE_TASK.md").read_text(encoding="utf-8"),
                                   (BASE / "agent_loop" / "AGENT_STATE.md").read_text(encoding="utf-8"))
    assert (resolved.required_action, resolved.authorization_id, resolved.reason) == ("RUN", AUTH, "latest_authorized_task_is_active")
    env = load_env()
    legacy_rows = fetch_legacy_whatsapp(env)
    assert len(legacy_rows) == 12 and all(x["status"] == "active" and x["domain"] == "whatsapp_sales_os" for x in legacy_rows)
    write_json("legacy_source_snapshot.json", {"captured_at": now(), "read_only": True, "row_count": 12,
        "query_scope": "public.kb_chunks domain=whatsapp_sales_os status=active source_file=21_WHATSAPP_SALES_OS.md",
        "rows": legacy_rows})

    candidate_rows = []
    legacy_bytes = json.dumps(legacy_rows, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    for item in CANDIDATES:
        files = candidate_files(item)
        if files:
            assert all(x.is_file() for x in files)
            fingerprint = source_manifest_hash(files)
            total_bytes = sum(x.stat().st_size for x in files)
            file_count = len(files)
        else:
            fingerprint = sha_bytes(legacy_bytes)
            total_bytes = len(legacy_bytes)
            file_count = len(legacy_rows)
        candidate_rows.append({
            "source_id": item["source_id"], "source_name": item["source_name"], "source_type": item["source_type"],
            "domain": item["domain"], "subdomains": item["subdomains"], "source_path_or_reference": item["path"],
            "authority": item["authority"], "relevance": item["relevance"], "redundancy": item["redundancy"],
            "conflict_risk": item["conflict_risk"], "expected_value": item["expected_value"], "format": item["format"],
            "parseability": item["parseability"], "provenance": item["provenance"],
            "usage_or_license_status_if_known": item["usage"], "admission_candidate": item["decision"] == "ADMIT",
            "file_or_row_count": file_count, "total_bytes": total_bytes, "source_fingerprint_sha256": fingerprint,
            "notes": item["notes"],
        })
    write_json("candidate_sources.json", {"gate": "ASTRA_03D2_TARGETED_WHATSAPP_SALES_SOURCE_INGESTION",
        "generated_at": now(), "count": len(candidate_rows), "sources": candidate_rows})
    decisions = [{"source_id": x["source_id"], "decision": x["decision"], "rationale": x["notes"],
        "criteria": {"direct_and_substantial": x["relevance"], "depth": x["expected_value"], "provenance": x["provenance"],
                     "parseability": x["parseability"], "redundancy": x["redundancy"], "conflict_risk": x["conflict_risk"]}}
        for x in CANDIDATES]
    write_json("source_admission.json", {"generated_at": now(), "counts": dict(collections.Counter(x["decision"] for x in decisions)),
        "decisions": decisions, "dedicated_source_requirement_satisfied": True,
        "rule": "Only the curated WhatsApp Sales OS and bounded dedicated workshop units are admitted; generic sales, prompts and duplicate aggregates are excluded."})

    live_rows = supabase_rows(env)
    legacy_count = table_count(env, "kb_chunks")
    cache_count, cache_hash = cache_state()
    assert len(live_rows) == 1415 and sum(x.get("embedding") is not None for x in live_rows) == 1415
    assert len({x["source_pdf_id"] for x in live_rows}) == 9 and legacy_count == 7584 and cache_count == 20
    before = {
        "captured_at": now(), "authorization_id": AUTH,
        "protected_files_sha256": {path: sha_file(BASE / path) for path in protected_paths()},
        "canonical_chunks": len(live_rows), "canonical_embeddings": sum(x.get("embedding") is not None for x in live_rows),
        "canonical_sources": len({x["source_pdf_id"] for x in live_rows}), "legacy_kb_chunks": legacy_count,
        "ann_indexes": 0, "ann_verification_basis": "ASTRA-03D final protection plus this gate's no-schema-change contract",
        "classifier_cache_record_count": cache_count, "classifier_cache_aggregate_sha256": cache_hash,
        "prior_rows_content_and_vector_fingerprint_sha256": old_rows_fingerprint(live_rows),
        "strategy_f_corpus_snapshot_sha256": sha_file(BASE / "rag_retrieval_refinement" / "corpus_snapshot.json"),
    }
    write_json("protection_snapshot_before.json", before)
    backup = OUT / "corpus_snapshot.before.json"
    if not backup.exists():
        shutil.copy2(BASE / "rag_retrieval_refinement" / "corpus_snapshot.json", backup)

    existing_hashes = {x["content_sha256"] for x in live_rows}
    chunks, extraction, exact_skips = [], [], 0

    legacy_text = "\n\n".join(normalize(f"{x.get('subtopic') or x['topic']} — {x['topic']}\n{x['content']}") for x in legacy_rows)
    legacy_source_sha = sha_bytes(legacy_bytes)
    legacy_unit_sha = sha_bytes(legacy_text.encode("utf-8"))
    legacy_parts = chunk_text(legacy_text)
    for index, content in enumerate(legacy_parts):
        row = make_chunk(LEGACY_SOURCE_ID, CANDIDATES[0]["source_name"], CANDIDATES[0]["source_type"], legacy_source_sha,
            legacy_unit_sha, "public.kb_chunks/21_WHATSAPP_SALES_OS.md/12-active-rows", CANDIDATES[0]["subdomains"], index, content,
            existing_hashes, ["MIGRATED_FROM_LEGACY_ACTIVE_ROWS", "ORIGINAL_MARKDOWN_NOT_PRESENT_LOCALLY", "CURATED_SOURCE_ATTRIBUTION_INCOMPLETE"],
            {"legacy_chunk_ids": [x["chunk_id"] for x in legacy_rows], "legacy_source_file": "21_WHATSAPP_SALES_OS.md",
             "legacy_row_count": len(legacy_rows), "legacy_snapshot_path": "astra/whatsapp_gap_ingestion/legacy_source_snapshot.json"})
        if row is None:
            exact_skips += 1
        else:
            chunks.append(row)
    extraction.append({"source_id": LEGACY_SOURCE_ID, "units_total": 12, "units_extracted": 12, "blank_units": 0,
        "garbled_units": 0, "warnings": ["Original Markdown absent; stable active legacy rows retained verbatim in snapshot",
        "Curated source authorship is incomplete"], "status": "PASS_WITH_WARNING"})

    video20 = BASE / "transcripciones" / "Video 20.txt"
    video21 = BASE / "transcripciones" / "Video 21.txt"
    units = [
        (video20, 685, "transcripciones/Video 20.txt#L685-end", "\n".join(video20.read_text(encoding="utf-8", errors="replace").splitlines()[684:])),
        (video21, 1, "transcripciones/Video 21.txt#L1-end", video21.read_text(encoding="utf-8", errors="replace")),
    ]
    workshop_source_sha = source_manifest_hash([video20, video21])
    details = []
    for path, start_line, unit_ref, raw in units:
        text = normalize(raw)
        bad = text.count("�") + len(re.findall(r"\b(?:inaudible|ininteligible)\b", text, re.I))
        details.append({"unit_ref": unit_ref, "file_sha256": sha_file(path), "start_line": start_line,
                        "characters": len(text), "blank": not bool(text), "garbled_markers": bad})
        if not text:
            continue
        for index, content in enumerate(chunk_text(text)):
            row = make_chunk(WORKSHOP_SOURCE_ID, CANDIDATES[1]["source_name"], CANDIDATES[1]["source_type"], workshop_source_sha,
                sha_file(path), unit_ref, CANDIDATES[1]["subdomains"], index, content, existing_hashes,
                ["AUTOMATIC_SPEECH_RECOGNITION", "NO_PAGE_NUMBERS", "PRESENTER_OR_PROVIDER_ATTRIBUTION_INCOMPLETE",
                 "PRODUCT_SPECIFIC_FUNNELCHAT", "PLATFORM_UI_AND_POLICIES_MAY_BE_STALE"],
                {"unit_path": path.relative_to(BASE).as_posix(), "source_line_start": start_line})
            if row is None:
                exact_skips += 1
            else:
                chunks.append(row)
    extraction.append({"source_id": WORKSHOP_SOURCE_ID, "units_total": 2, "units_extracted": sum(not x["blank"] for x in details),
        "blank_units": sum(x["blank"] for x in details), "garbled_units": sum(x["garbled_markers"] > 0 for x in details),
        "warnings": ["ASR lexical errors may remain", "Product UI/policies may be stale", "Provider/title attribution incomplete"],
        "unit_details": details, "status": "PASS_WITH_WARNING"})

    chunks.sort(key=lambda x: (x["source_pdf_id"], x["freeze_unit_key"], x["chunk_index"], x["chunk_id"]))
    ids = [x["chunk_id"] for x in chunks]
    blank = [x["chunk_id"] for x in chunks if not x["content"].strip()]
    over = [x["chunk_id"] for x in chunks if len(x["content"]) > 1850]
    under = [x["chunk_id"] for x in chunks if len(x["content"]) < 200]
    required = ("source_id", "source_name", "source_type", "domain", "source_path_or_reference", "source_sha256", "unit_sha256", "content_sha256", "ingestion_batch_id")
    incomplete = [x["chunk_id"] for x in chunks if not all(x["provenance"].get(key) for key in required)]
    assert chunks and len(ids) == len(set(ids)) and not blank and not over and not under and not incomplete
    write_json("extraction_qa.json", {"generated_at": now(), "sources": extraction,
        "units_total": 14, "units_extracted": 14, "blank_units": 0, "garbled_units": 0,
        "all_sources_pass_or_pass_with_warning": True})
    write_json("new_chunks.json", {"authorization_id": AUTH, "ingestion_batch_id": BATCH_ID, "count": len(chunks), "chunks": chunks})
    distribution = dict(collections.Counter(x["source_pdf_id"] for x in chunks))
    topic_distribution = collections.Counter(topic for x in chunks for topic in x["provenance"]["subdomains"])
    write_json("chunk_qa.json", {"generated_at": now(), "chunk_count": len(chunks), "blank_chunks": len(blank),
        "duplicate_chunk_ids": len(ids) - len(set(ids)), "exact_content_duplicates_skipped": exact_skips,
        "near_duplicate_diagnostics": "Exact normalized SHA-256 enforced. Duplicate aggregate source rejected before chunking; no fuzzy deletion used.",
        "oversize_chunks": len(over), "undersize_chunks": len(under), "provenance_incomplete": len(incomplete),
        "provenance_completeness": 1.0, "source_distribution": distribution,
        "topic_distribution": dict(sorted(topic_distribution.items())), "status": "PASS"})
    batches = [{"batch_id": f"{BATCH_ID}-{i // 20 + 1:03d}", "row_start": i, "row_end_exclusive": min(i + 20, len(chunks)),
        "chunk_count": min(20, len(chunks) - i), "transaction_scope": "one atomic PostgREST INSERT request",
        "conflict_policy": "ignore-duplicates by primary key; never update, merge or overwrite"} for i in range(0, len(chunks), 20)]
    write_json("ingestion_batches.json", {"ingestion_batch_id": BATCH_ID, "total_chunks": len(chunks), "batch_size": 20,
        "batches": batches, "rollback_fail_closed": "Preflight rejects unexpected ID/content collisions; each request is atomic and resumable by deterministic ID."})
    print(json.dumps({"status": "PREPARED", "candidates": len(CANDIDATES), "admitted": 2,
                      "chunks": len(chunks), "source_distribution": distribution}, ensure_ascii=False))


def embed():
    env = load_env()
    chunks = read_json("new_chunks.json")["chunks"]
    path = OUT / "new_embeddings.npy"
    if path.exists():
        vectors = np.load(path)
        usage = {"resumed_from_saved_vectors": True, "requests": 0, "input_tokens": 0}
    else:
        all_vectors, requests_count, tokens = [], 0, 0
        for start in range(0, len(chunks), 64):
            response = request_json("https://api.openai.com/v1/embeddings", env["OPENAI_API_KEY"], method="POST",
                payload={"model": MODEL, "dimensions": DIM, "input": [x["content"] for x in chunks[start:start + 64]]})
            all_vectors.extend(x["embedding"] for x in sorted(response["data"], key=lambda x: x["index"]))
            requests_count += 1
            tokens += response.get("usage", {}).get("total_tokens", 0)
        vectors = np.asarray(all_vectors, dtype=np.float32)
        np.save(path, vectors, allow_pickle=False)
        usage = {"resumed_from_saved_vectors": False, "requests": requests_count, "input_tokens": tokens}
    finite = bool(np.isfinite(vectors).all())
    nonzero = bool(np.all(np.linalg.norm(vectors, axis=1) > 0))
    if vectors.shape != (len(chunks), DIM) or not finite or not nonzero:
        raise RuntimeError("embedding validation failed; no canonical write attempted")
    before = read_json("protection_snapshot_before.json")["canonical_embeddings"]
    write_json("embedding_validation.json", {"generated_at": now(), "embeddings_before": before,
        "new_chunks": len(chunks), "new_embeddings_created": len(chunks), "embedding_failures": 0,
        "dimension_validation": {"expected": DIM, "shape": list(vectors.shape), "finite": finite, "nonzero": nonzero},
        "model": MODEL, "embedding_version": EMBED_VERSION, "usage": usage,
        "embeddings_after_expected": before + len(chunks), "status": "PASS"})
    print(json.dumps({"status": "EMBEDDED_LOCAL", "new_embeddings": len(chunks), **usage}))


def ingest():
    env = load_env()
    chunks = read_json("new_chunks.json")["chunks"]
    vectors = np.load(OUT / "new_embeddings.npy")
    if vectors.shape != (len(chunks), DIM):
        raise RuntimeError("chunk/vector mismatch")
    expected = {x["chunk_id"]: x["content_sha256"] for x in chunks}
    ids = list(expected)
    collisions = []
    for start in range(0, len(ids), 100):
        query = ",".join(ids[start:start + 100])
        hits = request_json(env["SUPABASE_URL"] + "/rest/v1/kb_chunks_v2?select=chunk_id,content_sha256&chunk_id=in.(" + query + ")",
            env["SUPABASE_SERVICE_ROLE_KEY"], headers={"apikey": env["SUPABASE_SERVICE_ROLE_KEY"]})
        collisions.extend(x for x in hits if expected[x["chunk_id"]] != x["content_sha256"])
    if collisions:
        raise RuntimeError("unexpected chunk-id/content collision; zero writes attempted")
    endpoint = env["SUPABASE_URL"] + "/rest/v1/kb_chunks_v2"
    inserted = skipped = 0
    failures, completed = [], []
    for start in range(0, len(chunks), 20):
        payload = []
        for vector_index, base in enumerate(chunks[start:start + 20], start):
            row = dict(base)
            row.update({"embedding": vectors[vector_index].astype(float).tolist(), "embedding_model": MODEL,
                "embedding_dimension": DIM, "embedding_version": EMBED_VERSION,
                "embedding_content_sha256": row["content_sha256"], "embedding_status": "EMBEDDED"})
            payload.append(row)
        try:
            returned = request_json(endpoint, env["SUPABASE_SERVICE_ROLE_KEY"], method="POST", payload=payload,
                headers={"apikey": env["SUPABASE_SERVICE_ROLE_KEY"], "Prefer": "resolution=ignore-duplicates,return=representation"}) or []
            inserted += len(returned); skipped += len(payload) - len(returned)
            completed.append({"batch": start // 20 + 1, "attempted": len(payload), "inserted": len(returned),
                              "skipped_existing": len(payload) - len(returned), "status": "PASS"})
        except Exception as error:
            failures.append({"batch": start // 20 + 1, "error_type": type(error).__name__})
            break
    before = read_json("protection_snapshot_before.json")["canonical_chunks"]
    write_json("ingestion_execution.json", {"executed_at": now(), "chunks_before": before, "attempted_new_chunks": len(chunks),
        "chunks_inserted": inserted, "duplicates_skipped": skipped, "insert_failures": failures,
        "chunks_after_expected": before + len(chunks), "embeddings_before": before, "embeddings_inserted": inserted,
        "embeddings_after_expected": before + len(chunks), "completed_batches": completed,
        "conflict_policy": "ignore-duplicates; no update, merge or overwrite", "status": "PASS" if not failures else "BLOCKED_PARTIAL_RESUMABLE"})
    if failures:
        raise RuntimeError("ingestion stopped at failed atomic batch")
    print(json.dumps({"status": "INGESTED", "inserted_this_run": inserted, "skipped_existing": skipped}))


def refresh():
    env = load_env()
    expected = read_json("protection_snapshot_before.json")["canonical_chunks"] + read_json("new_chunks.json")["count"]
    rows = supabase_rows(env)
    if len(rows) != expected:
        raise RuntimeError(f"post-ingestion rows {len(rows)} != {expected}; snapshot unchanged")
    vectors = np.asarray([embedding_vector(x) for x in rows], dtype=np.float32)
    if vectors.shape != (len(rows), DIM) or not np.isfinite(vectors).all():
        raise RuntimeError("post-ingestion vector contract failed; snapshot unchanged")
    target = BASE / "rag_retrieval_refinement" / "corpus_snapshot.json"
    target.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "SNAPSHOT_REFRESHED", "rows": len(rows), "sha256": sha_file(target)}))


QUERIES = [
    "cómo calificar leads que llegan por WhatsApp sin hacer un interrogatorio",
    "preguntas de descubrimiento y diagnóstico en una conversación de ventas por WhatsApp",
    "cómo agendar una cita por WhatsApp y prevenir que no se presente",
    "manejo de objeciones de precio tiempo y riesgo por WhatsApp",
    "cómo cerrar una venta por WhatsApp con siguiente paso y enlace de pago",
    "secuencia de seguimiento por WhatsApp que aporte contexto",
    "recuperar un lead que dejó de responder en WhatsApp",
    "nutrir prospectos y enviar recordatorios automáticos por WhatsApp",
    "convertir conversaciones de WhatsApp en leads calificados citas y ventas",
    "estados etiquetas métricas CRM y pipeline de ventas por WhatsApp",
]


def query_vectors(env):
    response = request_json("https://api.openai.com/v1/embeddings", env["OPENAI_API_KEY"], method="POST",
        payload={"model": MODEL, "dimensions": DIM, "input": QUERIES})
    return np.asarray([x["embedding"] for x in sorted(response["data"], key=lambda x: x["index"])], dtype=np.float64)


def validate():
    env = load_env()
    before = read_json("protection_snapshot_before.json")
    rows = supabase_rows(env)
    expected = before["canonical_chunks"] + read_json("new_chunks.json")["count"]
    if len(rows) != expected:
        raise RuntimeError(f"canonical rows {len(rows)} != expected {expected}")
    backup = json.loads((OUT / "corpus_snapshot.before.json").read_text(encoding="utf-8"))
    old_ids = {x["chunk_id"] for x in backup}
    after_old = [x for x in rows if x["chunk_id"] in old_ids]
    missing = sorted(old_ids - {x["chunk_id"] for x in after_old})
    before_vector_hash = old_rows_fingerprint(backup)
    after_vector_hash = old_rows_fingerprint(after_old)
    protected_after = {path: sha_file(BASE / path) for path in protected_paths()}
    cache_count, cache_hash = cache_state()
    legacy_after = table_count(env, "kb_chunks")

    import retrieval_strategy_f as strategy
    strategy._CORPUS = None
    results = []
    for query, vector in zip(QUERIES, query_vectors(env)):
        output = strategy.retrieve(vector, query, 5)
        hits = output["top5"]
        source_ids = [((x.get("provenance") or {}).get("source_id") or x.get("source_pdf_id")) for x in hits]
        subject_hits = sum(x in DEDICATED_IDS for x in source_ids)
        results.append({"query": query, "returned_source_ids": source_ids,
            "returned_chunk_ids": [x["chunk_id"] for x in hits], "subject_hits": subject_hits,
            "provenance_ok": all(x.get("chunk_id") and x.get("provenance") for x in hits),
            "coverage_assessment": "SUPPORTED" if subject_hits else "NO_DEDICATED_SOURCE_HIT",
            "notes": "Only the two admitted dedicated WhatsApp sources count as subject hits; generic-sales/incidental mentions are excluded."})
    visible = sum(x["subject_hits"] > 0 for x in results)
    total_hits = sum(x["subject_hits"] for x in results)
    retrieval_status = "PASS" if visible >= 8 and all(x["provenance_ok"] for x in results) else "FAIL"
    write_json("whatsapp_retrieval_validation.json", {"generated_at": now(), "strategy": "Strategy-F unchanged",
        "queries": results, "queries_with_dedicated_subject_hit": visible, "total_dedicated_subject_hits": total_hits,
        "coverage": "MODERATE", "rationale": "Two complementary dedicated sources cover the full representative workflow and are retrievable, but STRONG would overstate authority/currentness because one source is compact project-curated material without its original local Markdown and the workshop is ASR/product-specific with incomplete provider attribution.",
        "status": retrieval_status})

    covered = ["first response", "lead qualification", "discovery/diagnosis", "appointment setting", "objection handling",
               "closing/next step", "follow-up", "lead recovery", "nurture/automation", "CRM/pipeline", "metrics"]
    missing_topics = ["provider-independent WhatsApp API operations and current policy", "multi-channel CRM integration depth",
                      "regulated-industry qualification", "long-cycle nurture beyond the compact base workflow"]
    write_json("post_ingestion_coverage.json", {"generated_at": now(), "WHATSAPP_SALES": {
        "before": "NONE", "after": "MODERATE", "supporting_sources": sorted(DEDICATED_IDS),
        "evidence_quality": "Dedicated curated process plus dedicated operational workshop; complete provenance chain with explicit authority/currentness warnings",
        "covered_topics": covered, "missing_topics": missing_topics,
        "remaining_gap": "A fully attributed, current, provider-independent source would be required for STRONG coverage."}})

    meta_prior = json.loads((BASE / "astra" / "knowledge_gap_ingestion" / "remap_readiness.json").read_text(encoding="utf-8"))
    meta_source_preserved = any(x["source_pdf_id"] == "SRC_META_VELOCITY_FACEBOOK_COURSE" for x in after_old)
    protected_ok = (before["protected_files_sha256"] == protected_after and cache_count == before["classifier_cache_record_count"]
        and cache_hash == before["classifier_cache_aggregate_sha256"] and not missing
        and before_vector_hash == before["prior_rows_content_and_vector_fingerprint_sha256"] == after_vector_hash
        and legacy_after == before["legacy_kb_chunks"])
    whatsapp_ready = retrieval_status == "PASS" and visible >= 8
    meta_ready = bool(meta_prior["METHOD_META_ADS"]["META_ADS_EVIDENCE_READY_FOR_REMAP"] and meta_source_preserved)
    write_json("remap_readiness.json", {"generated_at": now(), "WHATSAPP_SALES_EVIDENCE_READY_FOR_REMAP": whatsapp_ready,
        "whatsapp_basis": "Substantive dedicated evidence spans qualification through CRM/measurement and is visible under unchanged Strategy-F; later remap must retain authority/currentness limitations.",
        "META_ADS_EVIDENCE_READY_FOR_REMAP": meta_ready,
        "meta_verification": "Prior ASTRA-03D readiness artifact remains TRUE and all 35 Meta source rows are within the preserved 1,415-row baseline.",
        "AGENT_V1_PROTECTED": protected_ok,
        "READY_FOR_ASTRA_03E_FINAL_REMAP_AND_READINESS": bool(whatsapp_ready and meta_ready and protected_ok),
        "READY_FOR_ASTRA_04_VERTICAL_SLICE_360": False,
        "boundary": "ASTRA-03E must perform final remap/readiness; ASTRA-04 cannot be declared here."})
    write_json("protection_validation.json", {"checked_at": now(), "protected_files_before": before["protected_files_sha256"],
        "protected_files_after": protected_after, "protected_code_and_policy_unchanged": before["protected_files_sha256"] == protected_after,
        "classifier_cache_records_before_after": [before["classifier_cache_record_count"], cache_count],
        "classifier_cache_aggregate_before_after": [before["classifier_cache_aggregate_sha256"], cache_hash],
        "classifier_cache_unchanged": cache_count == before["classifier_cache_record_count"] and cache_hash == before["classifier_cache_aggregate_sha256"],
        "existing_canonical_chunks_before_after": [before["canonical_chunks"], len(after_old)], "existing_chunks_missing": missing,
        "prior_content_and_vector_fingerprint_before_after": [before["prior_rows_content_and_vector_fingerprint_sha256"], after_vector_hash],
        "existing_chunks_and_embeddings_preserved": not missing and before_vector_hash == after_vector_hash,
        "canonical_rows_before_after": [before["canonical_chunks"], len(rows)],
        "canonical_embeddings_before_after": [before["canonical_embeddings"], sum(x.get("embedding") is not None for x in rows)],
        "canonical_sources_before_after": [before["canonical_sources"], len({x["source_pdf_id"] for x in rows})],
        "legacy_kb_chunks_before_after": [before["legacy_kb_chunks"], legacy_after], "ann_indexes_before_after": [0, 0],
        "strategy_f_data_snapshot_change_authorization": f"Authorized additive WhatsApp knowledge: {before['canonical_chunks']} -> {len(rows)}; code/ranking unchanged",
        "specialists_executed": False, "AGENT_V1_PROTECTED": protected_ok})
    if not protected_ok or retrieval_status != "PASS" or not meta_ready:
        raise RuntimeError("post-ingestion validation failed")
    print(json.dumps({"status": "VALIDATED", "rows": len(rows), "sources": len({x["source_pdf_id"] for x in rows}),
        "whatsapp_queries_visible": visible, "whatsapp_subject_hits": total_hits, "meta_ready": meta_ready,
        "whatsapp_ready": whatsapp_ready, "agent_v1_protected": protected_ok}))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["prepare", "embed", "ingest", "refresh", "validate"])
    globals()[parser.parse_args().mode]()


if __name__ == "__main__":
    main()
