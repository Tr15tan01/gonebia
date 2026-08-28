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

export const MemoryRetrievalService = {
  /** Hybrid retrieval: keyword (tsvector) + semantic (pgvector) + filters, RLS-scoped via the RPC. */
  async hybrid(sb: any, f: SearchFilters): Promise<MemoryRow[]> {
    const query = (f.query ?? "").trim();
    let embedding: number[] | null = null;
    if (query) {
      try { embedding = await embedQuery(query); } catch { /* fall back to keyword-only */ }
    }
    const { data, error } = await sb.rpc("hybrid_search", {
      p_query: query,
      p_embedding: embedding,
      p_types: f.types && f.types.length ? f.types : null,
      p_person: f.person || null,
      p_status: f.status || null,
      p_from: f.from || null,
      p_to: f.to || null,
      p_limit: f.limit ?? 20,
    });
    if (error) throw error;
    return (data ?? []) as MemoryRow[];
  },

  /** Semantic neighbours via pgvector RPC (used by capture-time similarity detection). */
  async similar(sb: any, embedding: number[], minSim: number, limit: number) {
    const { data, error } = await sb.rpc("match_memories", {
      p_query_embedding: embedding, p_match_count: limit, p_min_similarity: minSim,
    });
    if (error) throw error;
    return (data ?? []) as { memory_id: string; similarity: number }[];
  },
};
