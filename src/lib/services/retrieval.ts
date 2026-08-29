import { embedQuery } from "@/lib/ai/gemini";
import type { MemoryRow } from "@/lib/types";

export interface SearchFilters {
  query?: string;
  types?: string[] | null;
  person?: string | null;
  status?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
}

const STOPWORDS = new Set([
  "what", "when", "where", "which", "does", "did", "have", "has", "the", "and",
  "about", "with", "from", "that", "this", "last", "month", "week", "year", "recently",
  "things", "stuff", "tell", "show", "find", "want", "some", "any", "all",
]);

function normalizeRows(data: any[]): MemoryRow[] {
  return (data ?? []).map((m: any) => {
    const raw: unknown = m.memory_metadata;
    const meta = (Array.isArray(raw) ? raw[0] : raw) ?? {};
    return {
      id: m.id, original_text: m.original_text, created_at: m.created_at,
      type: meta.type ?? "thought", title: meta.title ?? "",
      summary: meta.summary ?? "", importance: meta.importance ?? 3,
      status: meta.status ?? "open", due_at: meta.due_at ?? null,
      occurred_at: meta.occurred_at ?? null, people: meta.people ?? [],
    } as MemoryRow;
  });
}

export const MemoryRetrievalService = {
  /** Hybrid retrieval: keyword + semantic + filters, RLS-scoped via the RPC.
   *  The embedding is sent as a pgvector text literal ("[0.1,0.2,...]") and cast
   *  inside the SQL function (see migration 0003). If the RPC ever fails, a
   *  plain keyword/recent query keeps search and chat working, degraded but alive. */
  async hybrid(sb: any, f: SearchFilters): Promise<MemoryRow[]> {
    const query = (f.query ?? "").trim();
    let embedding: number[] | null = null;
    if (query) {
      try { embedding = await embedQuery(query); } catch { /* keyword-only */ }
    }
    try {
      const { data, error } = await sb.rpc("hybrid_search", {
        p_query: query,
        p_embedding: embedding ? JSON.stringify(embedding) : null,
        p_types: f.types && f.types.length ? f.types : null,
        p_person: f.person || null,
        p_status: f.status || null,
        p_from: f.from || null,
        p_to: f.to || null,
        p_limit: f.limit ?? 20,
      });
      if (error) throw error;
      return (data ?? []) as MemoryRow[];
    } catch (e) {
      console.error("[retrieval] hybrid_search failed, using fallback:", e);
      return this.basicFallback(sb, f);
    }
  },

  /** Plain fallback: keyword OR-match on recent memories. No vectors required. */
  async basicFallback(sb: any, f: SearchFilters): Promise<MemoryRow[]> {
    let q = sb
      .from("memories")
      .select("id, original_text, created_at, memory_metadata(type, title, summary, importance, status, due_at, occurred_at, people)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(f.limit ?? 20);
    const words = (f.query ?? "")
      .toLowerCase().split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w))
      .slice(0, 4);
    if (words.length) {
      q = q.or(words.map((w) => `original_text.ilike.%${w}%`).join(","));
    }
    if (f.types && f.types.length) q = q.in("memory_metadata.type", f.types);
    if (f.status) q = q.eq("memory_metadata.status", f.status);
    const { data, error } = await q;
    if (error) { console.error("[retrieval] fallback also failed:", error); return []; }
    return normalizeRows(data ?? []);
  },

  /** Semantic neighbours via pgvector RPC (capture-time similarity detection). */
  async similar(sb: any, embedding: number[], minSim: number, limit: number) {
    const { data, error } = await sb.rpc("match_memories", {
      p_query_embedding: JSON.stringify(embedding), p_match_count: limit, p_min_similarity: minSim,
    });
    if (error) throw error;
    return (data ?? []) as { memory_id: string; similarity: number }[];
  },
};
