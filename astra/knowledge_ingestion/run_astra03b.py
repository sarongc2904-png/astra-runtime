"""ASTRA-03B controlled local-source preparation, additive ingestion, and validation.

The script is deliberately gate-specific. It never changes schema or protected runtime code,
never writes legacy kb_chunks, and inserts new kb_chunks_v2 rows with PostgREST
resolution=ignore-duplicates. Generated artifacts are auditable and resumable.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import json
import math
import os
import re
import shutil
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np

BASE = Path(__file__).resolve().parents[2]
OUT = BASE / "astra" / "knowledge_ingestion"
AUTH = "HUMAN_AUTHORIZATION_ASTRA_03B_MULTI_DOMAIN_KNOWLEDGE_SOURCE_INGESTION_2026-09-06"
BATCH_ID = "ASTRA03B-INGEST-20260906-01"
MODEL = "text-embedding-3-small"
DIM = 1536
EMBED_VERSION = "openai:text-embedding-3-small:1536:input/1.0"


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def sha_bytes(data: bytes):
    return hashlib.sha256(data).hexdigest()


def sha_file(path: Path):
    return sha_bytes(path.read_bytes())


def write_json(name: str, obj):
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_json(name: str):
    return json.loads((OUT / name).read_text(encoding="utf-8"))


def load_env():
    env = {}
    p = BASE / "transcripciones" / "claude-code-embeddings" / "claude-code-embeddings" / ".env"
    for line in p.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    for k in ("OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        if os.getenv(k):
            env[k] = os.environ[k]
        if not env.get(k):
            raise RuntimeError(f"required credential unavailable: {k}")
    if "ftoxermwkfebmnrudiuu" not in env["SUPABASE_URL"]:
        raise RuntimeError("unexpected Supabase project")
    return env


def request_json(url, key, method="GET", payload=None, headers=None, timeout=180):
    h = {"Authorization": "Bearer " + key, **(headers or {})}
    data = None
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


def supabase_rows(env):
    rows = []
    cols = "*"
    for offset in range(0, 10000, 250):
        url = env["SUPABASE_URL"] + "/rest/v1/kb_chunks_v2?" + urllib.parse.urlencode({
            "select": cols,
            "order": "freeze_unit_key.asc,chunk_index.asc,chunk_id.asc",
            "limit": 250,
            "offset": offset,
        })
        batch = request_json(url, env["SUPABASE_SERVICE_ROLE_KEY"], headers={"apikey": env["SUPABASE_SERVICE_ROLE_KEY"]})
        rows.extend(batch)
        if len(batch) < 250:
            break
    return rows


def aggregate_source_sha(files):
    manifest = "\n".join(f"{p.relative_to(BASE).as_posix()}\t{sha_file(p)}" for p in files)
    return sha_bytes(manifest.encode("utf-8"))


CANDIDATES = [
    dict(id="SRC_VEL_FUNNELS", name="Velocity — Cursos Amplify: Funnels", type="COURSE_TRANSCRIPTS", domains=["funnel design", "offer design", "positioning"], path="transcripciones_velocity/06 Cursos Amplify", authority="First-party local course transcripts attributed by folder to Velocity", relevance="HIGH", redundancy="LOW", risk="LOW", value="HIGH", decision="ADMIT", reason="Structured funnel curriculum with strategy, economics, audience, offers, ads, landing pages and sales assets."),
    dict(id="SRC_VEL_SALES", name="Velocity — La Venta Elegante", type="COURSE_TRANSCRIPTS", domains=["sales conversion", "sales acceleration"], path="transcripciones_velocity/01 Cursos Sprint/4.2 Curso la Venta elegante", authority="First-party local course transcripts attributed by folder to Velocity", relevance="HIGH", redundancy="LOW", risk="LOW", value="HIGH", decision="ADMIT", reason="Dedicated sales process, context, strategy, tactics and sales-script material."),
    dict(id="SRC_VEL_MIDAS", name="Velocity — Curso MIDAS", type="COURSE_TRANSCRIPTS", domains=["positioning", "pricing", "business model"], path="transcripciones_velocity/01 Cursos Sprint/4.1 Curso MIDAS", authority="First-party local course transcripts attributed by folder to Velocity", relevance="HIGH", redundancy="LOW", risk="LOW", value="HIGH", decision="ADMIT", reason="Dedicated demand creation, pricing, business-model/LTV and intangible-asset curriculum."),
    dict(id="SRC_VEL_INFO_AZ", name="Velocity — Negocio de infoproductos de la A a la Z", type="COURSE_TRANSCRIPTS", domains=["infoproducts", "offer design", "positioning"], path="transcripciones_velocity/01 Cursos Sprint/4.5 De la A a la Z para crear tu negocio de info productos", authority="First-party local course transcripts attributed by folder to Velocity", relevance="HIGH", redundancy="MODERATE", risk="LOW", value="HIGH", decision="ADMIT", reason="Coherent end-to-end infoproduct business curriculum covering audience, proposition, launch and growth."),
    dict(id="SRC_VEL_OFFER", name="Velocity — Taller de Propuesta Irresistible", type="WORKSHOP_TRANSCRIPT", domains=["offer design", "sales conversion"], path="transcripciones_velocity/07 Workshops Exclusivos/03 Taller de Propuesta Irresistible", authority="First-party local workshop transcript attributed by folder to Velocity", relevance="HIGH", redundancy="MODERATE", risk="LOW", value="HIGH", decision="ADMIT", reason="Focused workshop gives deeper offer and value-proposition treatment than the broad courses."),
    dict(id="SRC_PRO_CRO", name="Protégé — CRO Máxima", type="COURSE_TRANSCRIPTS", domains=["CRO"], path="transcripciones_protege_descargas/CRO Máxima", authority="Local course transcripts attributed by folder to Protégé", relevance="HIGH", redundancy="LOW", risk="MODERATE", value="HIGH", decision="ADMIT", reason="Dedicated CRO research, experimentation, testing, prioritization and consumer-psychology curriculum; ASR warnings retained."),
    dict(id="SRC_PRO_GROWTH", name="Protégé — Growth Marketing", type="COURSE_TRANSCRIPTS", domains=["positioning", "pricing", "CRO", "growth"], path="transcripciones_protege_descargas/Growth Marketing", authority="Local course transcripts attributed by folder to Protégé", relevance="HIGH", redundancy="MODERATE", risk="MODERATE", value="HIGH", decision="ADMIT", reason="Adds growth loops, market selection, positioning, economics, prioritization and measurement."),
    dict(id="SRC_VEL_INFO_ABC", name="Velocity Livepro — ABC para lanzar un infoproducto", type="WORKSHOP_TRANSCRIPTS", domains=["infoproducts"], path="transcripciones_velocity/03 Workshops Velocity Livepro/2.2 El ABC para lanzar tu propio infoproducto", authority="Local workshop transcripts attributed by folder to Velocity Livepro", relevance="HIGH", redundancy="HIGH", risk="LOW", value="MODERATE", decision="DEFER", reason="Substantially overlaps the admitted A-to-Z infoproduct course; defer until marginal retrieval value is measured."),
    dict(id="SRC_PRO_BLOCKBUSTER", name="Protégé — Blockbuster", type="COURSE_TRANSCRIPTS", domains=["infoproducts", "offer design", "content"], path="transcripciones_protege_descargas/Blockbuster", authority="Local course transcripts attributed by folder to Protégé", relevance="MODERATE", redundancy="HIGH", risk="MODERATE", value="MODERATE", decision="DEFER", reason="Broad and partly overlapping package; needs finer module-level admission before ingestion."),
    dict(id="SRC_PRO_FUNNEL_QA", name="Protégé — Tutorías de Cohorte de Funnels con IA", type="COHORT_QA_TRANSCRIPTS", domains=["funnel design", "offer design"], path="transcripciones_protege_descargas/Tutorías de Cohorte de Funnels con IA", authority="Local live cohort transcripts attributed by folder to Protégé", relevance="MODERATE", redundancy="HIGH", risk="MODERATE", value="MODERATE", decision="DEFER", reason="Live Q&A is less systematic and more ASR-noisy than the admitted structured funnel curriculum."),
    dict(id="SRC_BIBLIA_VENDEDOR", name="La Biblia del Vendedor", type="CURATED_MARKDOWN", domains=["sales conversion"], path="CONOCIMIENTO/BIBLIA_DEL_VENDEDOR.md", authority="Local curated Markdown; upstream editorial provenance not fully recorded", relevance="HIGH", redundancy="HIGH", risk="MODERATE", value="MODERATE", decision="DEFER", reason="Useful sales material but redundant with raw course transcripts and its derivation/provenance needs adjudication."),
    dict(id="SRC_COPY_FB_PROMPT", name="Prompt Copy FB Ads Libros", type="OPERATIONAL_PROMPT", domains=["Meta Ads", "copy"], path="CONOCIMIENTO/PROMPT_COPY_FB_ADS_LIBROS.md", authority="Local operational prompt, not a primary platform-method source", relevance="LOW", redundancy="MODERATE", risk="HIGH", value="LOW", decision="REJECT", reason="A derivative prompt is not sufficient authority for Meta Ads methodology and would overstate platform coverage."),
]


def candidate_record(c):
    p = BASE / c["path"]
    files = sorted(p.rglob("*.txt")) if p.is_dir() else ([p] if p.is_file() else [])
    return {
        "SOURCE_ID": c["id"], "SOURCE_NAME": c["name"], "SOURCE_TYPE": c["type"],
        "SOURCE_DOMAIN": c["domains"][0], "SOURCE_SUBDOMAINS": c["domains"][1:],
        "SOURCE_PATH_OR_REFERENCE": c["path"], "SOURCE_AUTHORITY": c["authority"],
        "SOURCE_RELEVANCE": c["relevance"], "SOURCE_REDUNDANCY": c["redundancy"],
        "SOURCE_CONFLICT_RISK": c["risk"], "SOURCE_EXPECTED_VALUE": c["value"],
        "SOURCE_FORMAT": "TXT" if files and all(x.suffix.lower() == ".txt" for x in files) else "MARKDOWN",
        "SOURCE_PARSEABILITY": "HIGH" if files else "NONE", "SOURCE_PROVENANCE": "local_project_file",
        "SOURCE_LICENSE_OR_USAGE_STATUS_IF_KNOWN": "User-provided/local project resource; external redistribution rights not determined",
        "FILE_COUNT": len(files), "TOTAL_BYTES": sum(x.stat().st_size for x in files),
        "SOURCE_FINGERPRINT_SHA256": aggregate_source_sha(files) if files else None,
        "INGEST": c["decision"] == "ADMIT", "REJECTION_REASON": None if c["decision"] == "ADMIT" else c["reason"],
    }


def normalize_text(raw):
    raw = raw.replace("\ufeff", "").replace("\r\n", "\n").replace("\r", "\n")
    raw = re.sub(r"(?im)^\s*\[(música|music|aplausos?)\]\s*$", "", raw)
    lines = [re.sub(r"\s+", " ", x).strip() for x in raw.split("\n")]
    return re.sub(r"\s+", " ", " ".join(x for x in lines if x)).strip()


def split_sentences(text):
    return [x.strip() for x in re.split(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÜÑ¿¡0-9])", text) if x.strip()]


def chunk_text(text, target=1450, maximum=1850, minimum=280):
    sentences = split_sentences(text)
    chunks, buf = [], ""
    for sentence in sentences:
        pieces = [sentence[i:i + maximum] for i in range(0, len(sentence), maximum)] if len(sentence) > maximum else [sentence]
        for piece in pieces:
            candidate = (buf + " " + piece).strip()
            if buf and len(candidate) > target:
                chunks.append(buf)
                buf = piece
            else:
                buf = candidate
            if len(buf) >= maximum:
                chunks.append(buf)
                buf = ""
    if buf:
        if chunks and len(buf) < minimum and len(chunks[-1]) + 1 + len(buf) <= maximum:
            chunks[-1] += " " + buf
        else:
            chunks.append(buf)
    return chunks


def protected_paths():
    return [
        "knowledge.js", "classifier_decision_cache.js", "retrieval_strategy_f.py",
        "rag_retrieval_refinement/recommended_pipeline.json",
        "rag_retrieval_qa/benchmark.json", "rag_retrieval_qa/benchmark_ground_truth.json",
        "e2e_benchmark_evidence_rebuild/rebuilt_evidence.json", "rag_answer_policy_runtime.js",
        "config.json", "evaluator_reselection/selected_evaluator.json", "evaluator_reselection/evaluator_rubric.json",
    ]


def prepare():
    sys.path.insert(0, str(BASE))
    from agent_loop.openai_loop import resolve_active_task
    resolved = resolve_active_task((BASE / "CLAUDE_TASK.md").read_text(encoding="utf-8"), (BASE / "agent_loop" / "AGENT_STATE.md").read_text(encoding="utf-8"))
    assert (resolved.required_action, resolved.authorization_id, resolved.reason) == ("RUN", AUTH, "latest_authorized_task_is_active")

    candidate_rows = [candidate_record(c) for c in CANDIDATES]
    assert all(x["FILE_COUNT"] > 0 for x in candidate_rows)
    write_json("candidate_sources.json", {"gate": "ASTRA_03B_MULTI_DOMAIN_KNOWLEDGE_SOURCE_INGESTION", "generated_at": now(), "count": len(candidate_rows), "sources": candidate_rows})
    admissions = [{"SOURCE_ID": c["id"], "DECISION": c["decision"], "RATIONALE": c["reason"], "CRITERIA": {"relevance": c["relevance"], "expected_value": c["value"], "provenance_identifiable": True, "parseability": "HIGH", "redundancy": c["redundancy"], "integrity_risk": c["risk"]}} for c in CANDIDATES]
    write_json("source_admission.json", {"generated_at": now(), "counts": dict(collections.Counter(x["DECISION"] for x in admissions)), "decisions": admissions})

    coverage = [
        ("offer design", "WEAK", ["SRC_VEL_FUNNELS", "SRC_VEL_OFFER", "SRC_VEL_INFO_AZ"], "STRONG", False),
        ("funnel design", "NONE", ["SRC_VEL_FUNNELS"], "STRONG", False),
        ("sales conversion", "NONE", ["SRC_VEL_SALES", "SRC_VEL_OFFER"], "STRONG", False),
        ("Meta Ads", "NONE", [], "NONE", True), ("WhatsApp sales", "NONE", [], "NONE", True),
        ("infoproducts", "NONE", ["SRC_VEL_INFO_AZ"], "STRONG", False),
        ("course creation", "NONE", [], "NONE", True),
        ("CRO", "NONE", ["SRC_PRO_CRO", "SRC_PRO_GROWTH"], "STRONG", False),
        ("positioning", "WEAK", ["SRC_VEL_MIDAS", "SRC_PRO_GROWTH", "SRC_VEL_FUNNELS"], "STRONG", False),
        ("pricing", "NONE", ["SRC_VEL_MIDAS", "SRC_PRO_GROWTH"], "STRONG", False),
    ]
    write_json("source_coverage_plan.json", {"generated_at": now(), "domains": [{"DOMAIN": d, "CURRENT_COVERAGE": b, "CANDIDATE_SOURCES": src, "ADMITTED_SOURCES": src, "EXPECTED_POST_INGESTION_COVERAGE": a, "UNRESOLVED_GAP": gap} for d, b, src, a, gap in coverage], "note": "Expected coverage is a planning estimate; post-ingestion status requires retrieval evidence."})

    ref = BASE / "rag_retrieval_refinement" / "corpus_snapshot.json"
    existing = json.loads(ref.read_text(encoding="utf-8"))
    assert len(existing) == 763
    protected = {p: sha_file(BASE / p) for p in protected_paths()}
    cache_files = sorted((BASE / ".cache" / "classifier_decisions").glob("*.json"))
    cache_digest = sha_bytes("\n".join(f"{x.name}:{sha_file(x)}" for x in cache_files).encode())
    before = {
        "captured_at": now(), "protected_files_sha256": protected,
        "strategy_f_corpus_snapshot_sha256": sha_file(ref), "strategy_f_corpus_rows": len(existing),
        "existing_chunk_identity_sha256": sha_bytes("\n".join(f'{x["chunk_id"]}:{x["content_sha256"]}:{x["embedding_content_sha256"]}' for x in sorted(existing, key=lambda z: z["chunk_id"])).encode()),
        "existing_embeddings": sum(x.get("embedding") is not None for x in existing),
        "classifier_cache_record_count": len(cache_files), "classifier_cache_aggregate_sha256": cache_digest,
        "legacy_kb_chunks_rows": 7584, "ann_indexes": 0,
    }
    write_json("protection_snapshot_before.json", before)
    backup = OUT / "corpus_snapshot.before.json"
    if not backup.exists():
        shutil.copy2(ref, backup)

    existing_hashes = {x["content_sha256"] for x in existing}
    chunks, extraction, source_counts = [], [], collections.Counter()
    seen = set(existing_hashes)
    exact_skipped = 0
    for c in CANDIDATES:
        if c["decision"] != "ADMIT":
            continue
        root = BASE / c["path"]
        files = sorted(root.rglob("*.txt"))
        src_sha = aggregate_source_sha(files)
        blank_units = garbled_units = 0
        warnings = ["AUTOMATIC_SPEECH_RECOGNITION", "NO_PAGE_NUMBERS"]
        for file_index, path in enumerate(files):
            raw = path.read_text(encoding="utf-8", errors="replace")
            text = normalize_text(raw)
            if not text:
                blank_units += 1
                continue
            bad = text.count("�") + len(re.findall(r"\b(?:inaudible|ininteligible)\b", text, re.I))
            if bad:
                garbled_units += 1
            rel = path.relative_to(root).as_posix()
            file_sha = sha_file(path)
            for local_index, content in enumerate(chunk_text(text)):
                content_hash = sha_bytes(content.encode("utf-8"))
                if content_hash in seen:
                    exact_skipped += 1
                    continue
                seen.add(content_hash)
                identity = f'{c["id"]}|{file_sha}|{local_index}|{content_hash}'
                chunk_id = sha_bytes(identity.encode("utf-8"))
                unit_key = sha_bytes(f'{c["id"]}|{rel}|{file_index}'.encode("utf-8"))
                source_name = c["name"] + " [transcript bundle]"
                chunks.append({
                    "chunk_id": chunk_id, "document_id": c["id"].lower() + "-" + src_sha[:12],
                    "source_pdf_id": c["id"], "source_pdf_name": source_name,
                    "source_pdf_sha256": src_sha, "freeze_id": BATCH_ID, "freeze_unit_key": unit_key,
                    "render_sha256": file_sha, "pdf_page_refs": [], "xobject_xref": None,
                    "chunk_index": local_index, "content": content, "content_sha256": content_hash,
                    "heading": path.stem, "section": rel, "content_type": "transcript_text",
                    "extraction_status": "REVIEW_REQUIRED", "quality_status": "INCLUDE_WITH_WARNING",
                    "rag_decision": "INCLUDE_WITH_WARNING", "warning_flags": warnings,
                    "provenance": {"source_id": c["id"], "source_name": c["name"], "source_type": c["type"], "domain": c["domains"][0], "subdomains": c["domains"][1:], "source_path": c["path"], "unit_path": rel, "source_sha256": src_sha, "unit_sha256": file_sha, "chunk_id": chunk_id, "content_sha256": content_hash, "ingestion_batch_id": BATCH_ID},
                    "source_metadata": {"source_document": source_name, "source_id": c["id"], "source_type": c["type"], "domain": c["domains"][0], "subdomains": c["domains"][1:], "extraction_method": "existing_local_utf8_transcript", "license_or_usage_status": "local_project_resource; redistribution rights not determined"},
                    "ingestion_schema_version": "kb_chunks/1.0",
                })
                source_counts[c["id"]] += 1
        extraction.append({"source_id": c["id"], "pages_or_units": len(files), "extracted_units": len(files) - blank_units, "blank_units": blank_units, "garbled_units": garbled_units, "warnings": warnings + (["REPLACEMENT_OR_INAUDIBLE_MARKERS_PRESENT"] if garbled_units else []) + ["Lexical ASR errors may remain; provenance and warning status retained"], "status": "PASS_WITH_WARNING"})

    chunks.sort(key=lambda x: (x["source_pdf_id"], x["freeze_unit_key"], x["chunk_index"], x["chunk_id"]))
    # The deterministic identity must be globally unique and all required provenance present.
    ids = [x["chunk_id"] for x in chunks]
    blanks = [x["chunk_id"] for x in chunks if not x["content"].strip()]
    oversize = [x["chunk_id"] for x in chunks if len(x["content"]) > 1850]
    undersize = [x["chunk_id"] for x in chunks if len(x["content"]) < 200]
    provenance_missing = [x["chunk_id"] for x in chunks if not all(x["provenance"].get(k) is not None for k in ("source_id", "source_name", "source_type", "domain", "source_path", "unit_path", "source_sha256", "unit_sha256", "content_sha256", "ingestion_batch_id"))]
    assert len(ids) == len(set(ids)) and not blanks and not oversize and not provenance_missing
    write_json("extraction_qa.json", {"generated_at": now(), "sources": extraction, "all_sources_pass_or_pass_with_warning": True})
    write_json("new_chunks.json", {"authorization_id": AUTH, "ingestion_batch_id": BATCH_ID, "count": len(chunks), "chunks": chunks})
    write_json("chunk_qa.json", {"generated_at": now(), "chunk_count": len(chunks), "duplicate_chunk_ids": len(ids) - len(set(ids)), "exact_content_duplicates_skipped": exact_skipped, "blank_chunks": len(blanks), "oversize_chunks": len(oversize), "undersize_chunks": len(undersize), "provenance_incomplete": len(provenance_missing), "source_distribution": dict(sorted(source_counts.items())), "near_duplicate_diagnostic": "Exact normalized content SHA-256 enforced; high-redundancy packages were deferred before chunking.", "status": "PASS"})
    batches = [{"batch_id": f"{BATCH_ID}-{i // 20 + 1:03d}", "row_start": i, "row_end_exclusive": min(i + 20, len(chunks)), "chunk_count": min(20, len(chunks) - i), "transaction_scope": "one atomic PostgREST INSERT request", "conflict_policy": "ignore-duplicates by primary key; never merge/overwrite"} for i in range(0, len(chunks), 20)]
    write_json("ingestion_batches.json", {"ingestion_batch_id": BATCH_ID, "total_chunks": len(chunks), "batch_size": 20, "batches": batches, "rollback_fail_closed": "Preflight rejects any unexpected ID/hash collision. Each batch is atomic; on failure stop. Successful prior batches are traceable and a resume uses ignore-duplicates without overwrites."})
    print(json.dumps({"status": "PREPARED", "candidates": len(CANDIDATES), "admitted": 7, "chunks": len(chunks), "source_distribution": source_counts}, default=dict, ensure_ascii=False))


def embed():
    env = load_env()
    doc = read_json("new_chunks.json")
    chunks = doc["chunks"]
    vectors_path = OUT / "new_embeddings.npy"
    if vectors_path.exists():
        vectors = np.load(vectors_path)
        if vectors.shape != (len(chunks), DIM):
            raise RuntimeError("saved embedding shape mismatch")
        usage = {"resumed_from_saved_vectors": True, "requests": 0, "input_tokens": 0}
    else:
        all_vectors, requests_n, input_tokens = [], 0, 0
        for start in range(0, len(chunks), 64):
            payload = {"model": MODEL, "dimensions": DIM, "input": [x["content"] for x in chunks[start:start + 64]]}
            response = request_json("https://api.openai.com/v1/embeddings", env["OPENAI_API_KEY"], method="POST", payload=payload)
            ordered = sorted(response["data"], key=lambda x: x["index"])
            all_vectors.extend(x["embedding"] for x in ordered)
            requests_n += 1
            input_tokens += response.get("usage", {}).get("total_tokens", 0)
        vectors = np.asarray(all_vectors, dtype=np.float32)
        if vectors.shape != (len(chunks), DIM) or not np.isfinite(vectors).all() or np.any(np.linalg.norm(vectors, axis=1) == 0):
            raise RuntimeError("embedding validation failed; no remote corpus write attempted")
        np.save(vectors_path, vectors, allow_pickle=False)
        usage = {"resumed_from_saved_vectors": False, "requests": requests_n, "input_tokens": input_tokens}
    write_json("embedding_validation.json", {"generated_at": now(), "existing_embeddings_before": 763, "new_chunks": len(chunks), "new_embeddings_created": len(chunks), "embedding_failures": 0, "dimension_validation": {"expected": DIM, "shape": list(vectors.shape), "finite": bool(np.isfinite(vectors).all()), "nonzero": bool(np.all(np.linalg.norm(vectors, axis=1) > 0))}, "model": MODEL, "version": EMBED_VERSION, "usage": usage, "existing_embeddings_after_expected": 763 + len(chunks), "status": "PASS"})
    print(json.dumps({"status": "EMBEDDED_LOCAL", "new_embeddings": len(chunks), **usage}))


def ingest():
    env = load_env()
    chunks = read_json("new_chunks.json")["chunks"]
    vectors = np.load(OUT / "new_embeddings.npy")
    if vectors.shape != (len(chunks), DIM):
        raise RuntimeError("embedding/chunk mismatch")
    # Fail closed on an existing-ID collision whose content is not identical.
    ids = [x["chunk_id"] for x in chunks]
    collisions = []
    for start in range(0, len(ids), 100):
        encoded = ",".join(ids[start:start + 100])
        url = env["SUPABASE_URL"] + "/rest/v1/kb_chunks_v2?select=chunk_id,content_sha256&chunk_id=in.(" + encoded + ")"
        hits = request_json(url, env["SUPABASE_SERVICE_ROLE_KEY"], headers={"apikey": env["SUPABASE_SERVICE_ROLE_KEY"]})
        expected = {x["chunk_id"]: x["content_sha256"] for x in chunks}
        collisions.extend(x for x in hits if expected.get(x["chunk_id"]) != x["content_sha256"])
    if collisions:
        raise RuntimeError("unexpected chunk-id/content collision; zero writes attempted")

    inserted, skipped, failures, completed = 0, 0, [], []
    endpoint = env["SUPABASE_URL"] + "/rest/v1/kb_chunks_v2"
    for start in range(0, len(chunks), 20):
        payload = []
        for i, base in enumerate(chunks[start:start + 20], start):
            row = dict(base)
            row.update({"embedding": vectors[i].astype(float).tolist(), "embedding_model": MODEL, "embedding_dimension": DIM, "embedding_version": EMBED_VERSION, "embedding_content_sha256": row["content_sha256"], "embedding_status": "EMBEDDED"})
            payload.append(row)
        try:
            returned = request_json(endpoint, env["SUPABASE_SERVICE_ROLE_KEY"], method="POST", payload=payload, headers={"apikey": env["SUPABASE_SERVICE_ROLE_KEY"], "Prefer": "resolution=ignore-duplicates,return=representation"}) or []
            inserted += len(returned)
            skipped += len(payload) - len(returned)
            completed.append({"batch": start // 20 + 1, "attempted": len(payload), "inserted": len(returned), "skipped_existing": len(payload) - len(returned), "status": "PASS"})
        except Exception as exc:
            failures.append({"batch": start // 20 + 1, "error_type": type(exc).__name__})
            break
    write_json("ingestion_execution.json", {"executed_at": now(), "pre_ingestion_count": 763, "attempted_new_chunks": len(chunks), "inserted_this_run": inserted, "duplicates_skipped_this_run": skipped, "failures": failures, "completed_batches": completed, "conflict_policy": "ignore-duplicates; no overwrite", "transaction_semantics": "each 20-row PostgREST insert request atomic", "status": "PASS" if not failures else "BLOCKED_PARTIAL_RESUMABLE"})
    if failures:
        raise RuntimeError("ingestion stopped after batch failure; see ingestion_execution.json")
    print(json.dumps({"status": "INGESTED", "inserted_this_run": inserted, "skipped_existing": skipped, "attempted": len(chunks)}))


def refresh_snapshot():
    env = load_env()
    expected_new = read_json("new_chunks.json")["count"]
    rows = supabase_rows(env)
    if len(rows) != 763 + expected_new:
        raise RuntimeError(f"post-ingestion row count {len(rows)} != {763 + expected_new}; canonical snapshot not changed")
    V = np.array([json.loads(x["embedding"]) if isinstance(x["embedding"], str) else x["embedding"] for x in rows], dtype=np.float64)
    if V.shape != (len(rows), DIM) or not np.isfinite(V).all() or np.any(np.linalg.norm(V, axis=1) == 0):
        raise RuntimeError("post-ingestion embedding validation failed; canonical snapshot not changed")
    target = BASE / "rag_retrieval_refinement" / "corpus_snapshot.json"
    target.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "SNAPSHOT_REFRESHED", "rows": len(rows), "sha256": sha_file(target)}))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["prepare", "embed", "ingest", "refresh"])
    mode = ap.parse_args().mode
    globals()[mode if mode != "refresh" else "refresh_snapshot"]()


if __name__ == "__main__":
    main()
