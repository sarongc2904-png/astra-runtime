# AGENT_V1_ADAPTER_SPEC — read-only bridge to the frozen knowledge engine

ASTRA calls Agent V1 **only** through this adapter. The adapter is a thin, read-only wrapper over the existing `knowledge.js` / `classifier_decision_cache.js` public exports. It **never** mutates corpus, embeddings, benchmark, Supabase, classifier, cache contract, or answer policy.

## Verified Agent V1 public interface (from `module.exports`)
Retrieval / evidence:
- `loadConfig()` → `{ apiKey, model, baseUrl }` (model forced to canonical `openai/gpt-5-mini`). **Adapter never logs/returns `apiKey`.**
- `groundedRetrieve(query, topK=5)` → `{ evidenceText, hits[], advisoryTop1Cosine, pipeline:'Strategy-F', corpus:'kb_chunks_v2' }`.
  - `hits[i]` = `{ rank, chunk_id, content, source_pdf_name, pdf_page_refs, rag_decision, quality_status, warning_flags, provenance, original_query_cosine }`.
- `retrieveStrategyF(query, topK)` / `buildStrategyFEvidence(result)` — lower-level; adapter prefers `groundedRetrieve`.
- `buildGroundingEvidence(fragments, c3, marketing)` — legacy grounding formatter (not used by ASTRA's Strategy-F path).
Classification (cached, operational determinism):
- `classifyEvidenceSufficiency(config, model, query, evidenceText)` → `{ decision ∈ {SUFFICIENT|FULL|PARTIAL|INSUFFICIENT|AMBIGUOUS}, hasSupportedMaterial, specificLimitation, reason, usage, cache:{ status ∈ {CACHE_HIT|CLASSIFIER_MISS_MATERIALIZATION|CACHE_BYPASS}, decision_key, ... , llm_calls } }`.
Answer (frozen policy/model) — ASTRA generally does NOT call this for orchestration; specialists compose their own prompts. Exposed for parity:
- `answerGrounded(config, model, system, history, query, { evidenceText, classify, generate, language })`.
Cache primitives (read-only use): `classifier_decision_cache.js` → `{ evidenceHash, decisionKey, get, cacheDir, ... }`. ASTRA may READ cache provenance; it must never write/delete Agent V1 cache records.

## Adapter surface (to implement in ASTRA-02)
```
AgentV1Adapter (READ-ONLY)
  retrieve(query, {topK=5}) → { evidenceText, hits[], advisoryTop1Cosine, corpus, pipeline }
  classify(query, evidenceText) → { decision, hasSupportedMaterial, specificLimitation, reason, cache_status, decision_key, llm_calls }
  retrieveAndClassify(query, {topK}) → { retrieval, sufficiency }   // convenience for the query planner
  config() → { model, baseUrl }   // NEVER exposes apiKey
```
Rules:
- Runtime env required (inherited): `STRATEGY_F_PYTHON`, `PYTHONIOENCODING=utf-8`, `PYTHONUTF8=1`.
- The adapter is **pure read**: no method in it may call any Agent V1 mutation path (there are none in the read set; enforce by allow-list).
- Classifier calls flow through the existing decision cache → operational determinism is inherited for free.
- On Agent V1 error (retrieval/classifier failure), the adapter **fails closed** and surfaces the error to the workflow (never fabricates evidence).

## Provenance mapping
Adapter maps each Agent V1 hit to an ASTRA evidence record:
```
{ evidence_id, source_class: "INTERNAL_KNOWLEDGE", chunk_id, source_pdf_name, pdf_page_refs,
  rag_decision, quality_status, warning_flags, cosine: original_query_cosine, text, retrieval_query }
```
`source_class` is always `INTERNAL_KNOWLEDGE` for Agent V1 output. Research/user/inference evidence uses the other source_classes and never passes through this adapter.

## Compatibility guarantee
If Agent V1 changes materially (corpus, model, Strategy-F, classifier, cache contract) it must be re-validated under its own authorization; the adapter pins the expected `corpus:'kb_chunks_v2'` and `pipeline:'Strategy-F'` markers and **fails closed** if they change unexpectedly, so ASTRA can never silently run on an unvalidated foundation.
