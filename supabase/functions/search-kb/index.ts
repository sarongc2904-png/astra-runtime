// search-kb — búsqueda híbrida (embeddings + full-text)
// Combina match_kb_chunks (semántica) + search_kb_text (literal)
import { createClient } from "jsr:@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const KB_API_KEY = Deno.env.get("KB_API_KEY")!;
const ASTRA_GPT_API_KEY = Deno.env.get("ASTRA_GPT_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: [text] }),
  });
  if (!res.ok) throw new Error(`embedding_provider_error_${res.status}`);
  const data = await res.json();
  return data.data[0].embedding;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  const auth = req.headers.get("authorization") || "";
  if (auth !== `Bearer ${KB_API_KEY}` && (!ASTRA_GPT_API_KEY || auth !== `Bearer ${ASTRA_GPT_API_KEY}`)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 64_000) {
      return new Response(JSON.stringify({ error: "invalid_input", message: "request too large" }), {
        status: 422, headers: { "Content-Type": "application/json" },
      });
    }
    const { query, top_k, filter_domain } = JSON.parse(raw || "{}");
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "missing 'query' string field" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (query.length > 12_000 || (top_k != null && (!Number.isInteger(top_k) || top_k < 1 || top_k > 10))) {
      return new Response(JSON.stringify({ error: "invalid_input" }), {
        status: 422, headers: { "Content-Type": "application/json" },
      });
    }

    const embedding = await embed(query);

    // 1) búsqueda semántica (embeddings)
    const sem = await supabase.rpc("match_kb_chunks", {
      query_embedding: embedding,
      match_count: top_k ?? 5,
      filter_status: "active",
    });

    // 2) búsqueda por texto (full-text) — clave para términos literales como "puerco espín"
    const txt = await supabase.rpc("search_kb_text", {
      filter_domain: filter_domain ?? null,
      match_count: top_k ?? 5,
      search_query: query,
    });

    // 3) mezclar y deduplicar
    const seen = new Set<string>();
    const results: any[] = [];
    const add = (rows: any[], source: string) => {
      for (const r of rows ?? []) {
        const key = (r.chunk_id || r.subtopic || r.content || "").slice(0, 80);
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          topic: r.subtopic || r.topic,
          domain: r.domain,
          content_type: r.content_type,
          validity: r.validity,
          source_file: r.source_file,
          similarity: r.similarity,
          match_type: source,
          content: r.content,
        });
      }
    };
    add(sem.data, "semantic");
    add(txt.data, "fulltext");

    return new Response(JSON.stringify({ results }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (_err) {
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
