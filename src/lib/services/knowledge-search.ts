import { embedDocument } from "@/lib/ai/gemini";

/** One Knowledge base entry that matched a question (migration 0028). */
export interface KnowledgeHit {
  source: "note" | "link" | "quote" | "research" | "deep_research";
  id: string;
  title: string;
  body: string;
  url: string | null;
  created_at: string;
  similarity: number;
}

export const KNOWLEDGE_LABEL: Record<KnowledgeHit["source"], string> = {
  note: "saved note", link: "saved link", quote: "saved quote",
  research: "research report", deep_research: "deep research report",
};

const BACKFILL_BATCH = 25;

function itemText(i: { title?: string | null; content?: string | null; url?: string | null }) {
  return [i.title, i.content, i.url].filter(Boolean).join("\n");
}

function runText(r: { input?: string | null; result?: any }) {
  const res = r.result ?? {};
  const points = Array.isArray(res.key_points) ? res.key_points.map((p: any) => (typeof p === "string" ? p : p?.point)).filter(Boolean) : [];
  return [res.title, r.input, res.answer, ...points].filter(Boolean).join("\n");
}

const isMissingSchema = (e: any) => /embedding|match_knowledge|does not exist|Could not find/i.test(String(e?.message ?? ""));

export const KnowledgeSearchService = {
  /** Embed one knowledge item or research run right after it's saved, so
   *  Ask my memory can find it. Never throws - a missing embedding is
   *  filled in later by backfill(). */
  async embedItem(db: any, userId: string, item: { id: string; title?: string | null; content?: string | null; url?: string | null }) {
    try {
      const embedding = await embedDocument(itemText(item), { userId, feature: "knowledge_embedding" });
      await db.from("knowledge_items").update({ embedding: JSON.stringify(embedding) }).eq("id", item.id);
    } catch (e) {
      if (!isMissingSchema(e)) console.error("[knowledge] embedding failed", item.id, e);
    }
  },

  async embedRun(db: any, userId: string, run: { id: string; input?: string | null; result?: any }) {
    try {
      const embedding = await embedDocument(runText(run), { userId, feature: "knowledge_embedding" });
      await db.from("agent_runs").update({ embedding: JSON.stringify(embedding) }).eq("id", run.id);
    } catch (e) {
      if (!isMissingSchema(e)) console.error("[knowledge] run embedding failed", run.id, e);
    }
  },

  /** Entries saved before migration 0028 (or whose embedding failed) have
   *  none yet: embed a small batch of them. Cheap no-op once all are done. */
  async backfill(sb: any, userId: string) {
    try {
      const [items, runs] = await Promise.all([
        sb.from("knowledge_items").select("id, title, content, url").is("embedding", null).limit(BACKFILL_BATCH),
        sb.from("agent_runs").select("id, input, result").is("embedding", null).eq("status", "done")
          .in("kind", ["research", "deep_research"]).limit(BACKFILL_BATCH),
      ]);
      if (items.error || runs.error) return; // migration not run yet
      await Promise.all([
        ...(items.data ?? []).map((i: any) => this.embedItem(sb, userId, i)),
        ...(runs.data ?? []).map((r: any) => this.embedRun(sb, userId, r)),
      ]);
    } catch (e) {
      console.error("[knowledge] backfill failed", e);
    }
  },

  /** Knowledge entries closest in meaning to the question. Empty when there
   *  is no query embedding or the migration hasn't been run. */
  async search(sb: any, userId: string, embedding: number[] | null, keywords: string[], limit = 4): Promise<KnowledgeHit[]> {
    if (!embedding) return [];
    const { data, error } = await sb.rpc("match_knowledge", {
      p_user: userId, p_embedding: JSON.stringify(embedding),
      p_query: keywords.join(" or "), p_limit: limit,
    });
    if (error) {
      if (!isMissingSchema(error)) console.error("[knowledge] match_knowledge failed", error);
      return [];
    }
    return (data ?? []) as KnowledgeHit[];
  },
};
