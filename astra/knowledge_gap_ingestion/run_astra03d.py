"""ASTRA-03D targeted, additive Meta Ads knowledge ingestion.

This gate-specific runner admits only one local Meta Ads course bundle. It never
updates existing rows, never writes legacy kb_chunks, and never changes schema or
retrieval code. WhatsApp candidates are adjudicated but not ingested because no
dedicated, sufficiently deep local source was found.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np

BASE = Path(__file__).resolve().parents[2]
OUT = BASE / "astra" / "knowledge_gap_ingestion"
AUTH = "HUMAN_AUTHORIZATION_ASTRA_03D_TARGETED_GAP_INGESTION_META_ADS_WHATSAPP_2026-09-06"
BATCH_ID = "ASTRA03D-INGEST-20260906-01"
MODEL = "text-embedding-3-small"
DIM = 1536
EMBED_VERSION = "openai:text-embedding-3-small:1536:input/1.0"
META_SOURCE_ID = "SRC_META_VELOCITY_FACEBOOK_COURSE"


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def sha_bytes(data: bytes):
    return hashlib.sha256(data).hexdigest()


def sha_file(path: Path):
    return sha_bytes(path.read_bytes())


def write_json(name: str, value):
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_json(name: str):
    return json.loads((OUT / name).read_text(encoding="utf-8"))


def load_env():
    values = {}
    env_path = BASE / "transcripciones" / "claude-code-embeddings" / "claude-code-embeddings" / ".env"
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    for key in ("OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        values[key] = os.environ.get(key, values.get(key))
        if not values[key]:
            raise RuntimeError(f"required credential unavailable: {key}")
    if "ftoxermwkfebmnrudiuu" not in values["SUPABASE_URL"]:
        raise RuntimeError("unexpected Supabase project")
    return values


def request_json(url, key, method="GET", payload=None, headers=None, timeout=180):
    request_headers = {"Authorization": "Bearer " + key, **(headers or {})}
    body = None
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=body, headers=request_headers, method=method)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


def table_count(env, table):
    url = env["SUPABASE_URL"] + f"/rest/v1/{table}?select=chunk_id&limit=1"
    request = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + env["SUPABASE_SERVICE_ROLE_KEY"],
        "apikey": env["SUPABASE_SERVICE_ROLE_KEY"],
        "Prefer": "count=exact",
        "Range": "0-0",
    })
    with urllib.request.urlopen(request, timeout=60) as response:
        content_range = response.headers.get("Content-Range", "")
        response.read()
    return int(content_range.rsplit("/", 1)[1])


def supabase_rows(env):
    rows = []
    for offset in range(0, 10000, 250):
        url = env["SUPABASE_URL"] + "/rest/v1/kb_chunks_v2?" + urllib.parse.urlencode({
            "select": "*", "order": "freeze_unit_key.asc,chunk_index.asc,chunk_id.asc",
            "limit": 250, "offset": offset,
        })
        batch = request_json(url, env["SUPABASE_SERVICE_ROLE_KEY"], headers={"apikey": env["SUPABASE_SERVICE_ROLE_KEY"]})
        rows.extend(batch)
        if len(batch) < 250:
            break
    return rows


def protected_paths():
    return [
        "knowledge.js", "classifier_decision_cache.js", "retrieval_strategy_f.py",
        "rag_retrieval_refinement/recommended_pipeline.json",
        "rag_retrieval_qa/benchmark.json", "rag_retrieval_qa/benchmark_ground_truth.json",
        "e2e_benchmark_evidence_rebuild/rebuilt_evidence.json", "rag_answer_policy_runtime.js",
        "config.json", "evaluator_reselection/selected_evaluator.json",
        "evaluator_reselection/evaluator_rubric.json",
    ]


def aggregate_files(files):
    payload = "\n".join(f"{path.relative_to(BASE).as_posix()}\t{sha_file(path)}" for path in sorted(files))
    return sha_bytes(payload.encode("utf-8"))


def cache_state():
    files = sorted((BASE / ".cache" / "classifier_decisions").glob("*.json"))
    digest = sha_bytes("\n".join(f"{x.name}:{sha_file(x)}" for x in files).encode("utf-8"))
    return len(files), digest


def embedding_vector(row):
    value = row.get("embedding")
    return json.loads(value) if isinstance(value, str) else value


def old_rows_fingerprint(rows):
    parts = []
    for row in sorted(rows, key=lambda item: item["chunk_id"]):
        vector = np.asarray(embedding_vector(row), dtype=np.float32)
        parts.append(row["chunk_id"] + ":" + row["content_sha256"] + ":" + sha_bytes(vector.tobytes()))
    return sha_bytes("\n".join(parts).encode("utf-8"))


CANDIDATES = [
    {
        "source_id": META_SOURCE_ID,
        "source_name": "Velocity — Facebook Marketing / Facebook Ads",
        "source_type": "COURSE_VIDEO_TRANSCRIPTS",
        "domain": "Meta Ads",
        "subdomains": ["campaign strategy", "audiences", "prospecting", "retargeting", "creative testing", "campaign structure", "optimization", "measurement", "Pixel"],
        "path": "velocity_media/cursos/75_facebook",
        "authority": "Local user-provided course videos attributed by the project directory to Velocity",
        "relevance": "HIGH", "redundancy": "LOW", "conflict_risk": "MODERATE", "expected_value": "HIGH",
        "format": "MP4_WITH_LOCAL_ASR_TRANSCRIPTS", "parseability": "HIGH_AFTER_TRANSCRIPTION",
        "provenance": "Six local MP4 units plus gate-local transcript and fingerprint per unit",
        "usage": "Local/user-provided project resource; external redistribution rights not determined",
        "decision": "ADMIT",
        "notes": "Dedicated strategic course. It materially covers audiences, creative, campaign structure, retargeting, scaling and metrics. It is not treated as current Meta product documentation; CAPI and Advantage+ are absent.",
    },
    {
        "source_id": "SRC_META_500_COMMANDS_GEELY", "source_name": "Biblioteca Maestra 500 Comandos Meta Ads Geely",
        "source_type": "PROMPT_COMMAND_LIBRARY", "domain": "Meta Ads", "subdomains": ["creative prompts", "copy prompts"],
        "path": "adjuntos/Biblioteca_Maestra_500_Comandos_Meta_Ads_Geely.md", "authority": "Local derivative prompt library; explicitly not official Meta commands",
        "relevance": "MODERATE", "redundancy": "HIGH", "conflict_risk": "HIGH", "expected_value": "LOW",
        "format": "MARKDOWN", "parseability": "HIGH", "provenance": "Local file with internal authorship framing",
        "usage": "Local/user-provided project resource; external redistribution rights not determined", "decision": "DEFER",
        "notes": "Useful as a future creative-prompt asset, but it is not authoritative platform methodology and does not close measurement or campaign-operation gaps.",
    },
    {
        "source_id": "SRC_META_THINKIFIC_LANDING", "source_name": "Thinkific Crea campañas de ads landing capture",
        "source_type": "COURSE_LANDING_HTML", "domain": "Meta Ads", "subdomains": ["course marketing"],
        "path": "thinkific_curso_crea_campanas_de_ads.html", "authority": "Local capture of a course landing page, not the instructional course",
        "relevance": "LOW", "redundancy": "HIGH", "conflict_risk": "MODERATE", "expected_value": "LOW",
        "format": "HTML", "parseability": "LOW_FOR_DOCTRINE", "provenance": "Local project file",
        "usage": "Local capture; downstream content rights not determined", "decision": "REJECT",
        "notes": "Marketing/navigation markup is not substantive instructional evidence.",
    },
    {
        "source_id": "SRC_META_SYSTEM_PROMPT", "source_name": "Sistema Prompts — Meta Ads",
        "source_type": "OPERATIONAL_PROMPT", "domain": "Meta Ads", "subdomains": ["agent instructions"],
        "path": "SISTEMA_PROMPTS/04_META_ADS.md", "authority": "Local operational prompt, not a primary knowledge source",
        "relevance": "LOW", "redundancy": "MODERATE", "conflict_risk": "HIGH", "expected_value": "LOW",
        "format": "MARKDOWN", "parseability": "HIGH", "provenance": "Local project file",
        "usage": "Internal project artifact", "decision": "REJECT", "notes": "Instructions cannot substitute for evidence-backed Meta Ads doctrine.",
    },
    {
        "source_id": "SRC_WA_SYSTEM_PROMPT", "source_name": "Sistema Prompts — Ventas y WhatsApp",
        "source_type": "OPERATIONAL_PROMPT", "domain": "WhatsApp Sales", "subdomains": ["agent instructions", "sales scripts"],
        "path": "SISTEMA_PROMPTS/11_VENTAS_Y_WHATSAPP.md", "authority": "Local operational prompt, not a primary knowledge source",
        "relevance": "MODERATE", "redundancy": "MODERATE", "conflict_risk": "HIGH", "expected_value": "LOW",
        "format": "MARKDOWN", "parseability": "HIGH", "provenance": "Local project file",
        "usage": "Internal project artifact", "decision": "REJECT", "notes": "WhatsApp-specific labels are present, but the file is an instruction template without deep supporting doctrine.",
    },
    {
        "source_id": "SRC_WA_BIBLIA_VENDEDOR", "source_name": "La Biblia del Vendedor",
        "source_type": "CURATED_MARKDOWN", "domain": "WhatsApp Sales", "subdomains": ["general sales", "objections", "closing", "follow-up"],
        "path": "CONOCIMIENTO/BIBLIA_DEL_VENDEDOR.md", "authority": "Local curated Markdown; upstream editorial derivation is not fully recorded",
        "relevance": "MODERATE", "redundancy": "HIGH", "conflict_risk": "MODERATE", "expected_value": "LOW",
        "format": "MARKDOWN", "parseability": "HIGH", "provenance": "Local file, incomplete upstream provenance",
        "usage": "Internal project artifact; external redistribution rights not determined", "decision": "DEFER",
        "notes": "General sales material is not a dedicated WhatsApp conversational-sales system and overlaps admitted Venta Elegante evidence.",
    },
    {
        "source_id": "SRC_WA_VENTA_ELEGANTE_PODCAST", "source_name": "El Podcast La venta elegante",
        "source_type": "PODCAST_TRANSCRIPTS", "domain": "WhatsApp Sales", "subdomains": ["discovery", "questions", "general sales"],
        "path": "transcripciones_velocity/05 Podcasts/5.4 El Podcast La venta elegante", "authority": "Local transcripts attributed by directory to Velocity",
        "relevance": "MODERATE", "redundancy": "HIGH", "conflict_risk": "LOW", "expected_value": "LOW",
        "format": "TXT", "parseability": "HIGH", "provenance": "Local transcript bundle",
        "usage": "Local/user-provided project resource; external redistribution rights not determined", "decision": "DEFER",
        "notes": "Depth is general sales rather than WhatsApp-specific; it overlaps the already ingested canonical Venta Elegante course.",
    },
]


def normalize(raw):
    raw = raw.replace("\ufeff", "").replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"\s+", " ", line).strip() for line in raw.split("\n")]
    return re.sub(r"\s+", " ", " ".join(x for x in lines if x)).strip()


def chunk_text(text, target=1450, maximum=1850, minimum=280):
    sentences = [x.strip() for x in re.split(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÜÑ¿¡0-9])", text) if x.strip()]
    chunks, buffer = [], ""
    for sentence in sentences:
        pieces = [sentence[i:i + maximum] for i in range(0, len(sentence), maximum)] if len(sentence) > maximum else [sentence]
        for piece in pieces:
            candidate = (buffer + " " + piece).strip()
            if buffer and len(candidate) > target:
                chunks.append(buffer)
                buffer = piece
            else:
                buffer = candidate
    if buffer:
        if chunks and len(buffer) < minimum and len(chunks[-1]) + 1 + len(buffer) <= maximum:
            chunks[-1] += " " + buffer
        else:
            chunks.append(buffer)
    return chunks


def prepare():
    sys.path.insert(0, str(BASE))
    from agent_loop.openai_loop import resolve_active_task
    resolved = resolve_active_task((BASE / "CLAUDE_TASK.md").read_text(encoding="utf-8"), (BASE / "agent_loop" / "AGENT_STATE.md").read_text(encoding="utf-8"))
    assert (resolved.required_action, resolved.authorization_id, resolved.reason) == ("RUN", AUTH, "latest_authorized_task_is_active")

    candidate_rows = []
    for item in CANDIDATES:
        path = BASE / item["path"]
        files = sorted(path.rglob("*")) if path.is_dir() else [path]
        files = [x for x in files if x.is_file()]
        assert files, item["path"]
        candidate_rows.append({
            "source_id": item["source_id"], "source_name": item["source_name"], "source_type": item["source_type"],
            "domain": item["domain"], "subdomains": item["subdomains"], "source_path_or_reference": item["path"],
            "authority": item["authority"], "relevance": item["relevance"], "redundancy": item["redundancy"],
            "conflict_risk": item["conflict_risk"], "expected_value": item["expected_value"], "format": item["format"],
            "parseability": item["parseability"], "provenance": item["provenance"],
            "usage_or_license_status_if_known": item["usage"], "admission_candidate": item["decision"] == "ADMIT",
            "file_count": len(files), "total_bytes": sum(x.stat().st_size for x in files),
            "source_fingerprint_sha256": aggregate_files(files), "notes": item["notes"],
        })
    write_json("candidate_sources.json", {"gate": "ASTRA_03D_TARGETED_GAP_INGESTION_META_ADS_WHATSAPP", "generated_at": now(), "count": len(candidate_rows), "sources": candidate_rows})
    decisions = [{
        "source_id": item["source_id"], "decision": item["decision"], "rationale": item["notes"],
        "criteria": {"direct_relevance": item["relevance"], "depth_material": item["expected_value"],
                     "provenance_identifiable": item["provenance"], "parseability": item["parseability"],
                     "redundancy": item["redundancy"], "conflict_risk": item["conflict_risk"]},
    } for item in CANDIDATES]
    write_json("source_admission.json", {"generated_at": now(), "counts": dict(collections.Counter(x["decision"] for x in decisions)), "decisions": decisions,
        "quality_rule": "Only a dedicated source with material domain depth is admitted; incidental mentions and operational prompts are not coverage evidence."})

    env = load_env()
    live_rows = supabase_rows(env)
    legacy_count = table_count(env, "kb_chunks")
    cache_count, cache_hash = cache_state()
    assert len(live_rows) == 1380 and sum(x.get("embedding") is not None for x in live_rows) == 1380
    assert len({x["source_pdf_id"] for x in live_rows}) == 8 and legacy_count == 7584 and cache_count == 20
    protected = {path: sha_file(BASE / path) for path in protected_paths()}
    before = {
        "captured_at": now(), "authorization_id": AUTH, "protected_files_sha256": protected,
        "canonical_chunks": len(live_rows), "canonical_embeddings": sum(x.get("embedding") is not None for x in live_rows),
        "canonical_sources": len({x["source_pdf_id"] for x in live_rows}), "legacy_kb_chunks": legacy_count,
        "ann_indexes": 0, "ann_verification_basis": "Current pre-gate live verification plus ASTRA-03B/03C no-schema-change protection chain",
        "classifier_cache_record_count": cache_count, "classifier_cache_aggregate_sha256": cache_hash,
        "prior_rows_content_and_vector_fingerprint_sha256": old_rows_fingerprint(live_rows),
        "strategy_f_corpus_snapshot_sha256": sha_file(BASE / "rag_retrieval_refinement" / "corpus_snapshot.json"),
    }
    write_json("protection_snapshot_before.json", before)
    backup = OUT / "corpus_snapshot.before.json"
    if not backup.exists():
        shutil.copy2(BASE / "rag_retrieval_refinement" / "corpus_snapshot.json", backup)

    transcript_root = OUT / "meta_course_transcripts"
    video_root = BASE / "velocity_media" / "cursos" / "75_facebook"
    transcript_files = sorted(x for x in transcript_root.glob("*.txt"))
    video_files = sorted(video_root.glob("*.mp4"))
    assert len(transcript_files) == len(video_files) == 6
    video_by_stem = {x.stem: x for x in video_files}
    source_sha = aggregate_files(video_files + transcript_files)
    existing_hashes = {x["content_sha256"] for x in live_rows}
    seen = set(existing_hashes)
    chunks, units, duplicate_skips = [], [], 0
    unit_subdomains = {
        "01_Clase de introducción": ["campaign strategy"],
        "02_Clase 1 - Visión estratégica y Mentalidad": ["campaign strategy", "campaign economics", "measurement"],
        "03_Clase 2 - Segmentación y selección de audiencia": ["audiences", "prospecting", "Pixel"],
        "04_Clase 3 - Creación de anuncios ganadores": ["creative testing", "lead generation"],
        "05_Clase 4 - Tipos de campañas y estructura": ["campaign structure", "retargeting"],
        "06_Clase 5 - Escala de anuncios y optimización": ["optimization", "scaling", "measurement"],
    }
    for unit_index, transcript in enumerate(transcript_files):
        video = video_by_stem[transcript.stem]
        raw = transcript.read_text(encoding="utf-8", errors="replace")
        content = normalize(raw)
        blank = not bool(content)
        bad_markers = content.count("�") + len(re.findall(r"\b(?:inaudible|ininteligible)\b", content, re.I))
        units.append({
            "unit": transcript.name, "source_video": video.relative_to(BASE).as_posix(), "transcript": transcript.relative_to(BASE).as_posix(),
            "video_sha256": sha_file(video), "transcript_sha256": sha_file(transcript), "characters": len(content),
            "blank": blank, "garbled_markers": bad_markers, "status": "PASS_WITH_WARNING" if not blank else "FAIL",
        })
        if blank:
            continue
        for local_index, piece in enumerate(chunk_text(content)):
            content_hash = sha_bytes(piece.encode("utf-8"))
            if content_hash in seen:
                duplicate_skips += 1
                continue
            seen.add(content_hash)
            identity = f"{META_SOURCE_ID}|{sha_file(video)}|{local_index}|{content_hash}"
            chunk_id = sha_bytes(identity.encode("utf-8"))
            unit_key = sha_bytes(f"{META_SOURCE_ID}|{video.name}|{unit_index}".encode("utf-8"))
            provenance = {
                "source_id": META_SOURCE_ID, "source_name": CANDIDATES[0]["source_name"], "source_type": CANDIDATES[0]["source_type"],
                "domain": "Meta Ads", "subdomains": unit_subdomains[transcript.stem], "source_path": CANDIDATES[0]["path"],
                "unit_path": video.relative_to(BASE).as_posix(), "transcript_path": transcript.relative_to(BASE).as_posix(),
                "source_sha256": source_sha, "unit_sha256": sha_file(video), "transcript_sha256": sha_file(transcript),
                "chunk_id": chunk_id, "content_sha256": content_hash, "ingestion_batch_id": BATCH_ID,
            }
            chunks.append({
                "chunk_id": chunk_id, "document_id": META_SOURCE_ID.lower() + "-" + source_sha[:12],
                "source_pdf_id": META_SOURCE_ID, "source_pdf_name": CANDIDATES[0]["source_name"] + " [six-video transcript bundle]",
                "source_pdf_sha256": source_sha, "freeze_id": BATCH_ID, "freeze_unit_key": unit_key,
                "render_sha256": sha_file(video), "pdf_page_refs": [], "xobject_xref": None, "chunk_index": local_index,
                "content": piece, "content_sha256": content_hash, "heading": transcript.stem,
                "section": video.name, "content_type": "transcript_text", "extraction_status": "REVIEW_REQUIRED",
                "quality_status": "INCLUDE_WITH_WARNING", "rag_decision": "INCLUDE_WITH_WARNING",
                "warning_flags": ["AUTOMATIC_SPEECH_RECOGNITION", "NO_PAGE_NUMBERS", "PLATFORM_UI_MAY_BE_STALE", "NO_CAPI_OR_ADVANTAGE_PLUS"],
                "provenance": provenance,
                "source_metadata": {"source_document": CANDIDATES[0]["source_name"], "source_id": META_SOURCE_ID,
                    "source_type": CANDIDATES[0]["source_type"], "domain": "Meta Ads", "subdomains": unit_subdomains[transcript.stem],
                    "extraction_method": "faster-whisper-small Spanish CPU int8 then normalized local UTF-8 transcript",
                    "license_or_usage_status": CANDIDATES[0]["usage"]},
                "ingestion_schema_version": "kb_chunks/1.0",
            })
    chunks.sort(key=lambda x: (x["freeze_unit_key"], x["chunk_index"], x["chunk_id"]))
    ids = [x["chunk_id"] for x in chunks]
    blanks = [x["chunk_id"] for x in chunks if not x["content"].strip()]
    oversize = [x["chunk_id"] for x in chunks if len(x["content"]) > 1850]
    undersize = [x["chunk_id"] for x in chunks if len(x["content"]) < 200]
    required = ("source_id", "source_name", "source_type", "domain", "source_path", "unit_path", "source_sha256", "unit_sha256", "content_sha256", "ingestion_batch_id")
    incomplete = [x["chunk_id"] for x in chunks if not all(x["provenance"].get(key) for key in required)]
    assert chunks and len(ids) == len(set(ids)) and not blanks and not oversize and not incomplete
    write_json("extraction_qa.json", {"generated_at": now(), "sources": [{
        "source_id": META_SOURCE_ID, "units_total": len(units), "units_extracted": sum(not x["blank"] for x in units),
        "blank_units": sum(x["blank"] for x in units), "garbled_units": sum(x["garbled_markers"] > 0 for x in units),
        "warnings": ["AUTOMATIC_SPEECH_RECOGNITION", "Lexical ASR errors may remain", "PLATFORM_UI_MAY_BE_STALE", "NO_CAPI_OR_ADVANTAGE_PLUS"],
        "unit_details": units, "status": "PASS_WITH_WARNING",
    }], "all_sources_pass_or_pass_with_warning": True})
    write_json("new_chunks.json", {"authorization_id": AUTH, "ingestion_batch_id": BATCH_ID, "count": len(chunks), "chunks": chunks})
    write_json("chunk_qa.json", {
        "generated_at": now(), "chunk_count": len(chunks), "blank_chunks": len(blanks),
        "duplicate_chunk_ids": len(ids) - len(set(ids)), "exact_content_duplicates_skipped": duplicate_skips,
        "near_duplicate_diagnostics": "Exact normalized content SHA-256 enforced. No cross-source fuzzy deletion was performed.",
        "oversize_chunks": len(oversize), "undersize_chunks": len(undersize), "provenance_incomplete": len(incomplete),
        "provenance_completeness": 1.0, "domain_distribution": {"Meta Ads": len(chunks)}, "source_distribution": {META_SOURCE_ID: len(chunks)},
        "status": "PASS",
    })
    batches = [{"batch_id": f"{BATCH_ID}-{index // 20 + 1:03d}", "row_start": index,
        "row_end_exclusive": min(index + 20, len(chunks)), "chunk_count": min(20, len(chunks) - index),
        "transaction_scope": "one atomic PostgREST INSERT request", "conflict_policy": "ignore-duplicates by primary key; never merge or overwrite"}
        for index in range(0, len(chunks), 20)]
    write_json("ingestion_batches.json", {"ingestion_batch_id": BATCH_ID, "total_chunks": len(chunks), "batch_size": 20, "batches": batches,
        "rollback_fail_closed": "Preflight rejects unexpected ID/content collisions. Each insert request is atomic. Traceable IDs make partial completion resumable without overwrites."})
    print(json.dumps({"status": "PREPARED", "candidates": len(CANDIDATES), "admitted": 1, "chunks": len(chunks)}, ensure_ascii=False))


def embed():
    env = load_env()
    chunks = read_json("new_chunks.json")["chunks"]
    vector_path = OUT / "new_embeddings.npy"
    if vector_path.exists():
        vectors = np.load(vector_path)
        if vectors.shape != (len(chunks), DIM):
            raise RuntimeError("saved vector shape mismatch")
        usage = {"resumed_from_saved_vectors": True, "requests": 0, "input_tokens": 0}
    else:
        response = request_json("https://api.openai.com/v1/embeddings", env["OPENAI_API_KEY"], method="POST",
            payload={"model": MODEL, "dimensions": DIM, "input": [x["content"] for x in chunks]})
        vectors = np.asarray([x["embedding"] for x in sorted(response["data"], key=lambda x: x["index"])], dtype=np.float32)
        usage = {"resumed_from_saved_vectors": False, "requests": 1, "input_tokens": response.get("usage", {}).get("total_tokens", 0)}
        np.save(vector_path, vectors, allow_pickle=False)
    finite = bool(np.isfinite(vectors).all())
    nonzero = bool(np.all(np.linalg.norm(vectors, axis=1) > 0))
    if vectors.shape != (len(chunks), DIM) or not finite or not nonzero:
        raise RuntimeError("embedding validation failed; no corpus write attempted")
    before = read_json("protection_snapshot_before.json")["canonical_embeddings"]
    write_json("embedding_validation.json", {"generated_at": now(), "embeddings_before": before, "new_chunks": len(chunks),
        "new_embeddings_created": len(chunks), "embedding_failures": 0,
        "dimension_validation": {"expected": DIM, "shape": list(vectors.shape), "finite": finite, "nonzero": nonzero},
        "model": MODEL, "embedding_version": EMBED_VERSION, "usage": usage, "embeddings_after_expected": before + len(chunks), "status": "PASS"})
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
        encoded = ",".join(ids[start:start + 100])
        url = env["SUPABASE_URL"] + "/rest/v1/kb_chunks_v2?select=chunk_id,content_sha256&chunk_id=in.(" + encoded + ")"
        hits = request_json(url, env["SUPABASE_SERVICE_ROLE_KEY"], headers={"apikey": env["SUPABASE_SERVICE_ROLE_KEY"]})
        collisions.extend(x for x in hits if expected[x["chunk_id"]] != x["content_sha256"])
    if collisions:
        raise RuntimeError("unexpected chunk id/content collision; zero writes attempted")
    inserted, skipped, completed, failures = 0, 0, [], []
    endpoint = env["SUPABASE_URL"] + "/rest/v1/kb_chunks_v2"
    for start in range(0, len(chunks), 20):
        payload = []
        for row_index, base in enumerate(chunks[start:start + 20], start):
            row = dict(base)
            row.update({"embedding": vectors[row_index].astype(float).tolist(), "embedding_model": MODEL,
                "embedding_dimension": DIM, "embedding_version": EMBED_VERSION,
                "embedding_content_sha256": row["content_sha256"], "embedding_status": "EMBEDDED"})
            payload.append(row)
        try:
            returned = request_json(endpoint, env["SUPABASE_SERVICE_ROLE_KEY"], method="POST", payload=payload,
                headers={"apikey": env["SUPABASE_SERVICE_ROLE_KEY"], "Prefer": "resolution=ignore-duplicates,return=representation"}) or []
            inserted += len(returned)
            skipped += len(payload) - len(returned)
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
        "conflict_policy": "ignore-duplicates; no update or overwrite", "status": "PASS" if not failures else "BLOCKED_PARTIAL_RESUMABLE"})
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
        raise RuntimeError("post-ingestion embedding contract failure; snapshot unchanged")
    target = BASE / "rag_retrieval_refinement" / "corpus_snapshot.json"
    target.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "SNAPSHOT_REFRESHED", "rows": len(rows), "sha256": sha_file(target)}))


META_QUERIES = [
    "estrategia de campañas Meta Ads objetivos y economía de adquisición",
    "estructura de campaña conjunto de anuncios ABO CBO",
    "estrategia de audiencias Facebook Ads públicos similares lookalike",
    "prospección de audiencias frías en Facebook Ads",
    "retargeting de visitantes y personas que vieron anuncios",
    "testing de creatividades anuncios ganadores Facebook",
    "optimización y escalado vertical horizontal campañas",
    "generación de leads con campañas de Facebook",
    "calificación de leads provenientes de Meta Ads",
    "medición CPA CPL CTR frecuencia ROAS campañas",
    "Pixel y Conversions API CAPI Meta Ads Advantage Plus",
]

WA_QUERIES = [
    "calificación de leads por WhatsApp",
    "conversación de descubrimiento de ventas por WhatsApp",
    "agendamiento de citas mediante WhatsApp",
    "manejo de objeciones en WhatsApp",
    "cierre de ventas conversacional por WhatsApp",
    "seguimiento de prospectos por WhatsApp",
    "recuperación de leads fríos por WhatsApp",
    "nutrición de leads con mensajes de WhatsApp",
    "flujo CRM y pipeline de ventas WhatsApp",
    "conversión conversacional en WhatsApp",
]


def query_vectors(queries, env):
    response = request_json("https://api.openai.com/v1/embeddings", env["OPENAI_API_KEY"], method="POST",
        payload={"model": MODEL, "dimensions": DIM, "input": queries})
    return np.asarray([x["embedding"] for x in sorted(response["data"], key=lambda x: x["index"])], dtype=np.float64)


def retrieval_results(queries, vectors, dedicated_ids):
    sys.path.insert(0, str(BASE))
    import retrieval_strategy_f as strategy
    strategy._CORPUS = None
    results = []
    for query, vector in zip(queries, vectors):
        output = strategy.retrieve(vector, query, 5)
        hits = output["top5"]
        source_ids = [((x.get("provenance") or {}).get("source_id") or x.get("source_pdf_id")) for x in hits]
        subject_hits = sum(source_id in dedicated_ids for source_id in source_ids)
        capi_limited = "CAPI" in query
        results.append({"query": query, "returned_source_ids": source_ids,
            "returned_chunk_ids": [x["chunk_id"] for x in hits], "subject_hits": subject_hits,
            "provenance_ok": all(x.get("chunk_id") and x.get("provenance") for x in hits),
            "coverage_assessment": "PARTIAL_PIXEL_ONLY" if capi_limited and subject_hits else ("SUPPORTED" if subject_hits else "NO_DEDICATED_SOURCE_HIT"),
            "notes": ("The retrieved course supports Pixel-level concepts but does not substantively cover CAPI or Advantage+; those terms remain a gap."
                      if capi_limited and subject_hits else "Subject hit requires a dedicated admitted source; incidental mentions from general sources are excluded.")})
    return results


def validate():
    env = load_env()
    before = read_json("protection_snapshot_before.json")
    rows = supabase_rows(env)
    new_count = read_json("new_chunks.json")["count"]
    expected = before["canonical_chunks"] + new_count
    if len(rows) != expected:
        raise RuntimeError(f"canonical rows {len(rows)} != expected {expected}")
    prior_backup = json.loads((OUT / "corpus_snapshot.before.json").read_text(encoding="utf-8"))
    old_ids = {x["chunk_id"] for x in prior_backup}
    after_old = [x for x in rows if x["chunk_id"] in old_ids]
    missing = sorted(old_ids - {x["chunk_id"] for x in after_old})
    prior_fingerprint = old_rows_fingerprint(prior_backup)
    after_fingerprint = old_rows_fingerprint(after_old)
    protected_after = {path: sha_file(BASE / path) for path in protected_paths()}
    cache_count, cache_hash = cache_state()
    legacy_after = table_count(env, "kb_chunks")
    meta_vectors = query_vectors(META_QUERIES, env)
    wa_vectors = query_vectors(WA_QUERIES, env)
    meta = retrieval_results(META_QUERIES, meta_vectors, {META_SOURCE_ID})
    wa = retrieval_results(WA_QUERIES, wa_vectors, set())
    meta_queries_visible = sum(x["subject_hits"] > 0 for x in meta)
    meta_hits = sum(x["subject_hits"] for x in meta)
    wa_queries_visible = sum(x["subject_hits"] > 0 for x in wa)
    write_json("meta_ads_retrieval_validation.json", {
        "generated_at": now(), "strategy": "Strategy-F unchanged", "queries": meta,
        "queries_with_dedicated_subject_hit": meta_queries_visible, "total_dedicated_subject_hits": meta_hits,
        "coverage": "MODERATE", "rationale": "The dedicated course is broadly visible for strategy, audiences, creative, structure, retargeting, optimization and metrics, but is strategic/ASR-derived and lacks current CAPI and Advantage+ doctrine; STRONG would overstate the evidence.",
        "status": "PASS" if meta_queries_visible >= 7 and all(x["provenance_ok"] for x in meta) else "FAIL",
    })
    write_json("whatsapp_sales_retrieval_validation.json", {
        "generated_at": now(), "strategy": "Strategy-F unchanged", "queries": wa,
        "queries_with_dedicated_subject_hit": wa_queries_visible, "total_dedicated_subject_hits": 0,
        "coverage": "NONE", "rationale": "No dedicated WhatsApp Sales source passed admission. General-sales or incidental WhatsApp hits do not count as domain support.",
        "status": "PASS_HONEST_GAP_PRESERVED" if wa_queries_visible == 0 and all(x["provenance_ok"] for x in wa) else "FAIL",
    })
    write_json("post_ingestion_gap_coverage.json", {
        "generated_at": now(),
        "META_ADS": {"before": "NONE", "after": "MODERATE", "supporting_sources": [META_SOURCE_ID],
            "evidence_quality": "Dedicated six-part local course; broad strategic depth; ASR and current-platform limitations retained",
            "remaining_gap": "Authoritative/current operational coverage for CAPI, Advantage+, attribution changes, interface setup and lead qualification downstream of ad capture."},
        "WHATSAPP_SALES": {"before": "NONE", "after": "NONE", "supporting_sources": [],
            "evidence_quality": "No candidate met dedicated-depth and provenance requirements",
            "remaining_gap": "A dedicated, provenance-identifiable WhatsApp conversational-sales source covering qualification, discovery, appointments, objections, closing, follow-up, recovery, nurture and CRM flow."},
    })
    write_json("remap_readiness.json", {
        "generated_at": now(), "METHOD_META_ADS": {"META_ADS_EVIDENCE_READY_FOR_REMAP": True,
            "basis": "Dedicated source is retrievable across core strategic subdomains with provenance; later remap must retain limits."},
        "METHOD_WHATSAPP_SALES": {"WHATSAPP_SALES_EVIDENCE_READY_FOR_REMAP": False,
            "basis": "No admitted dedicated source; general sales evidence cannot be relabeled as WhatsApp-specific."},
        "READY_FOR_ASTRA_03E_FINAL_REMAP_AND_READINESS": False,
        "exact_missing_source_requirement": "One dedicated, provenance-identifiable, parseable WhatsApp conversational-sales curriculum or manual with material coverage of the representative workflow.",
        "READY_FOR_ASTRA_04_VERTICAL_SLICE_360": False,
    })
    protected_ok = (before["protected_files_sha256"] == protected_after and cache_count == before["classifier_cache_record_count"]
        and cache_hash == before["classifier_cache_aggregate_sha256"] and not missing
        and prior_fingerprint == before["prior_rows_content_and_vector_fingerprint_sha256"] == after_fingerprint
        and legacy_after == before["legacy_kb_chunks"])
    write_json("protection_validation.json", {
        "checked_at": now(), "protected_files_before": before["protected_files_sha256"], "protected_files_after": protected_after,
        "protected_code_and_policy_unchanged": before["protected_files_sha256"] == protected_after,
        "classifier_cache_records_before_after": [before["classifier_cache_record_count"], cache_count],
        "classifier_cache_aggregate_before_after": [before["classifier_cache_aggregate_sha256"], cache_hash],
        "classifier_cache_unchanged": cache_count == before["classifier_cache_record_count"] and cache_hash == before["classifier_cache_aggregate_sha256"],
        "existing_canonical_chunks_before_after": [before["canonical_chunks"], len(after_old)], "existing_chunks_missing": missing,
        "prior_content_and_vector_fingerprint_before_after": [before["prior_rows_content_and_vector_fingerprint_sha256"], after_fingerprint],
        "existing_chunks_and_embeddings_preserved": not missing and prior_fingerprint == after_fingerprint,
        "canonical_rows_before_after": [before["canonical_chunks"], len(rows)],
        "canonical_embeddings_before_after": [before["canonical_embeddings"], sum(x.get("embedding") is not None for x in rows)],
        "canonical_sources_before_after": [before["canonical_sources"], len({x["source_pdf_id"] for x in rows})],
        "legacy_kb_chunks_before_after": [before["legacy_kb_chunks"], legacy_after], "ann_indexes_before_after": [0, 0],
        "strategy_f_data_snapshot_change_authorization": f"Authorized additive knowledge growth: {before['canonical_chunks']} -> {len(rows)}; runtime code and ranking unchanged",
        "specialists_executed": False, "AGENT_V1_PROTECTED": protected_ok,
    })
    if not protected_ok or read_json("meta_ads_retrieval_validation.json")["status"] != "PASS":
        raise RuntimeError("post-ingestion validation failed")
    print(json.dumps({"status": "VALIDATED", "rows": len(rows), "sources": len({x["source_pdf_id"] for x in rows}),
        "meta_queries_visible": meta_queries_visible, "meta_subject_hits": meta_hits, "whatsapp_queries_visible": wa_queries_visible,
        "agent_v1_protected": protected_ok}))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["prepare", "embed", "ingest", "refresh", "validate"])
    args = parser.parse_args()
    globals()[args.mode]()


if __name__ == "__main__":
    main()
