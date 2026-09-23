import { embedQuery } from "@/lib/ai/gemini";
import * as Sentry from "@sentry/nextjs";
import type { MemoryRow } from "@/lib/types";

export interface SearchFilters {
  query?: string;
  types?: string[] | null;
  person?: string | null;
  status?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
  /** Free plan: keyword-only (basic search). Pro: hybrid semantic. */
  semantic?: boolean;
}

const STOPWORDS = new Set([
  "what", "when", "where", "which", "does", "did", "have", "has", "the", "and",
  "about", "with", "from", "that", "this", "last", "month", "week", "year", "recently",
  "things", "stuff", "tell", "show", "find", "want", "some", "any", "all",
]);

/** "jokes" -> "joke", "stories" -> "story", "run" -> "runs" ... Postgres'
 *  english dictionary already stems most of this, but only when the row and
 *  the query stem to the SAME root - and never in the ilike fallback. These
 *  variants are ORed into a second, looser attempt so a plural (or singular)
 *  never silently returns nothing. */
export function wordVariants(w: string): string[] {
  const out = new Set<string>([w]);
  if (w.length > 4 && w.endsWith("ies")) out.add(`${w.slice(0, -3)}y`);
  if (w.length > 3 && w.endsWith("es")) out.add(w.slice(0, -2));
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) out.add(w.slice(0, -1));
  if (!w.endsWith("s")) { out.add(`${w}s`); out.add(`${w}es`); }
  if (w.length > 4 && w.endsWith("ing")) out.add(w.slice(0, -3));
  if (w.length > 3 && w.endsWith("ed")) out.add(w.slice(0, -2));
  return [...out];
}

/** Shortest form of a word, for substring matching ("jokes" -> "joke"). */
function root(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  return w;
}

function keywords(query: string): string[] {
  return query.toLowerCase().split(/[^\p{L}\p{N}']+/u)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .slice(0, 6);
}

/** Every keyword and its variants as one OR query for websearch_to_tsquery. */
function looseQuery(query: string): string {
  const terms = new Set<string>();
  for (const w of keywords(query)) for (const v of wordVariants(w)) terms.add(v);
  return [...terms].join(" or ");
}

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
  async hybrid(sb: any, userId: string, f: SearchFilters): Promise<MemoryRow[]> {
    const query = (f.query ?? "").trim();
    const wantSemantic = f.semantic !== false;
    let embedding: number[] | null = null;
    if (query && wantSemantic) {
      // Previously silently swallowed - if embedding generation ever fails
      // (wrong model name, quota, transient API error), every question
      // quietly degrades to keyword-only matching with zero visibility. That
      // matters a lot: keyword search requires the literal words in the
      // question to appear in the memory text ("phone charger" won't match a
      // memory that only says "Samsung charger" - no shared words - while
      // semantic search understands they're related). Now it's logged.
      try { embedding = await embedQuery(query, { userId, feature: "chat_retrieval" }); } catch (e) {
        console.error("[retrieval] embedQuery failed, falling back to keyword-only for this question:", e);
        Sentry.captureException(e, { extra: { query, stage: "embedQuery" } });
      }
    }
    try {
      const { data, error } = await sb.rpc("hybrid_search", {
        p_user: userId,
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
      const rows = (data ?? []) as MemoryRow[];
      if (rows.length || !query) return rows;
      // nothing matched the words as typed - try their singular/plural forms
      const loose = looseQuery(query);
      if (!loose || loose === query.toLowerCase()) return rows;
      const retry = await sb.rpc("hybrid_search", {
        p_user: userId,
        p_query: loose,
        p_embedding: embedding ? JSON.stringify(embedding) : null,
        p_types: f.types && f.types.length ? f.types : null,
        p_person: f.person || null,
        p_status: f.status || null,
        p_from: f.from || null,
        p_to: f.to || null,
        p_limit: f.limit ?? 20,
      });
      if (retry.error) throw retry.error;
      return (retry.data ?? []) as MemoryRow[];
    } catch (e) {
      console.error("[retrieval] hybrid_search failed, using fallback:", e);
      return this.basicFallback(sb, userId, f);
    }
  },

  async basicFallback(sb: any, userId: string, f: SearchFilters): Promise<MemoryRow[]> {
    // !inner is required here: without it, Supabase/PostgREST ignores a filter
    // on an embedded table for the PARENT rows and silently returns every
    // memory instead of just ones matching the type/status filter - the same
    // bug class fixed elsewhere in this app (tasks page, /api/urgent).
    let q = sb
      .from("memories")
      .select("id, original_text, created_at, memory_metadata!inner(type, title, summary, importance, status, due_at, occurred_at, people)")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(f.limit ?? 20);
    // match on word ROOTS, so "jokes" finds "joke" and vice versa
    const words = [...new Set(keywords(f.query ?? "").map(root))].slice(0, 4);
    if (words.length) {
      q = q.or(words.map((w) => `original_text.ilike.%${w}%`).join(","));
    }
    if (f.types && f.types.length) q = q.in("memory_metadata.type", f.types);
    if (f.status) q = q.eq("memory_metadata.status", f.status);
    const { data, error } = await q;
    if (error) { console.error("[retrieval] fallback also failed:", error); return []; }
    return normalizeRows(data ?? []);
  },

  async similar(sb: any, userId: string, embedding: number[], minSim: number, limit: number) {
    const { data, error } = await sb.rpc("match_memories", {
      p_user: userId, p_query_embedding: JSON.stringify(embedding), p_match_count: limit, p_min_similarity: minSim,
    });
    if (error) throw error;
    return (data ?? []) as { memory_id: string; similarity: number }[];
  },
};
