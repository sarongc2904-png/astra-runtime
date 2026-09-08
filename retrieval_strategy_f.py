"""Canonical Strategy-F retriever (shared, reused by offline validation and the E2E runtime).

Reuses the EXACT validated Strategy-F ranking from rag_answer_grounded_qa/_scripts/build_generate.py
(rank_strategy) over the frozen kb_chunks_v2 corpus snapshot (rag_retrieval_refinement/corpus_snapshot.json,
763 rows) with text-embedding-3-small (1536-dim) query embeddings.

Pipeline (frozen): exact cosine top20 + local BM25(k1=1.2,b=0.75) top20 -> equal-weight RRF(k=60)
-> deterministic rerank (0.80*normRRF + 0.15*IDF token coverage + 0.05*bigram coverage) -> top5.

Reads only. Never mutates corpus, embeddings, schema, or indexes.
CLI:  python retrieval_strategy_f.py --query "..."            (live-embed the query)
      python retrieval_strategy_f.py --query-vector-index N    (use stored query_vectors.npy[N], for validation)
Outputs JSON {top5:[...], top20_semantic:[...], top20_lexical:[...], advisory_top1_cosine:...}.
"""
import argparse, collections, json, math, os, re, sys, unicodedata, urllib.request
from pathlib import Path
import numpy as np

BASE = Path(__file__).resolve().parent
REF = BASE / "rag_retrieval_refinement"
STOP = set("a an the and or to of for in on is it this that what how why who which with as at by from be are was does do can you your i we they their versus about into versus es el la los las un una de del en que como por para y o se al lo".split())
DOWNSTREAM_FIELDS = ["chunk_id", "document_id", "content", "source_pdf_name", "source_pdf_sha256",
                     "pdf_page_refs", "freeze_unit_key", "rag_decision", "quality_status", "warning_flags", "provenance"]

def tokens(s):
    s = "".join(c for c in unicodedata.normalize("NFKD", s.lower()) if not unicodedata.combining(c))
    return [t for t in re.findall(r"[a-z0-9]+", s) if t not in STOP and len(t) > 1]

_CORPUS = None
def load_corpus():
    global _CORPUS
    if _CORPUS is None:
        rows = json.loads((REF / "corpus_snapshot.json").read_text(encoding="utf-8"))
        V = np.array([json.loads(x["embedding"]) if isinstance(x["embedding"], str) else x["embedding"] for x in rows], dtype=np.float64)
        V = V / np.linalg.norm(V, axis=1)[:, None]
        docs = [tokens(x["content"]) for x in rows]
        tf = [collections.Counter(d) for d in docs]
        df = collections.Counter(t for d in docs for t in set(d))
        idf = {t: math.log(1 + (len(rows) - v + .5) / (v + .5)) for t, v in df.items()}
        avg = sum(map(len, docs)) / len(rows)
        bigrams = [set(zip(d, d[1:])) for d in docs]
        _CORPUS = dict(rows=rows, V=V, docs=docs, tf=tf, df=df, idf=idf, avg=avg, bigrams=bigrams, n=len(rows))
    return _CORPUS

def embed_query(query):
    """text-embedding-3-small, 1536-dim, via OpenAI (same model as stored embeddings)."""
    key = None
    envp = BASE / "transcripciones/claude-code-embeddings/claude-code-embeddings/.env"
    if envp.exists():
        for line in envp.read_text(encoding="utf-8").splitlines():
            if line.startswith("OPENAI_API_KEY="): key = line.split("=", 1)[1].strip()
    key = os.environ.get("OPENAI_API_KEY", key)
    if not key: raise RuntimeError("OPENAI_API_KEY unavailable for query embedding")
    payload = {"model": "text-embedding-3-small", "input": query, "dimensions": 1536}
    req = urllib.request.Request("https://api.openai.com/v1/embeddings", data=json.dumps(payload).encode(),
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        return np.array(json.load(r)["data"][0]["embedding"], dtype=np.float64)

def rank_strategy_f(qvec, query_text):
    """EXACT port of build_generate.py rank_strategy for a single query -> ordered chunk indices + signals."""
    C = load_corpus(); rows, V, tf, docs, idf, avg, bigrams = C["rows"], C["V"], C["tf"], C["docs"], C["idf"], C["avg"], C["bigrams"]
    q = qvec / np.linalg.norm(qvec)
    S = V @ q  # exact cosine (V and q normalized)
    qt = tokens(query_text); terms = set(qt)
    den = sum(idf.get(t, math.log(1 + 2 * C["n"])) for t in terms) or 1
    cov = np.array([sum(idf.get(t, 0) for t in terms if t in f) / den for f in tf])
    qb = set(zip(qt, qt[1:]))
    phr = np.array([len(qb & b) / max(1, len(qb)) for b in bigrams])
    bm = np.array([sum(idf.get(t, 0) * f.get(t, 0) * 2.2 / (f.get(t, 0) + 1.2 * (.25 + .75 * len(d) / avg)) for t in terms) for f, d in zip(tf, docs)])
    semantic = np.argsort(-S)[:20]; lexical = np.argsort(-bm)[:20]
    rrf = collections.defaultdict(float)
    for order in [semantic, lexical]:
        for k, j in enumerate(order, 1): rrf[int(j)] += 1 / (60 + k)
    final = sorted(rrf, key=lambda j: (-(.8 * rrf[j] / (2 / 61) + .15 * cov[j] + .05 * phr[j]), j))
    return final, S, semantic, lexical

def retrieve(qvec, query_text, top_k=5):
    C = load_corpus(); rows = C["rows"]
    final, S, semantic, lexical = rank_strategy_f(qvec, query_text)
    hits = []
    for rank, j in enumerate(final[:top_k], 1):
        x = rows[j]
        hits.append({"rank": rank, **{k: x.get(k) for k in DOWNSTREAM_FIELDS}, "original_query_cosine": float(S[j])})
    return {"top5": hits, "top20_semantic_chunk_ids": [rows[int(j)]["chunk_id"] for j in semantic],
            "top20_lexical_chunk_ids": [rows[int(j)]["chunk_id"] for j in lexical],
            "advisory_top1_cosine": float(S[final[0]]) if final else None,
            "pipeline": "Strategy-F", "corpus": "kb_chunks_v2", "corpus_rows": C["n"], "final_top_k": top_k}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--query"); ap.add_argument("--query-vector-index", type=int); ap.add_argument("--top-k", type=int, default=5)
    a = ap.parse_args()
    if a.query_vector_index is not None:
        qvec = np.load(REF / "query_vectors.npy")[a.query_vector_index]
        qtext = a.query or ""
    else:
        if not a.query: print(json.dumps({"error": "no query"})); sys.exit(2)
        qvec = embed_query(a.query); qtext = a.query
    print(json.dumps(retrieve(qvec, qtext, a.top_k), ensure_ascii=False))

if __name__ == "__main__":
    main()
