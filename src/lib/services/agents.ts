import { createAdmin } from "@/lib/supabase/admin";
import { geminiJSON, geminiGroundedJSON } from "@/lib/ai/gemini";
import { MemoryRetrievalService } from "./retrieval";
import { createNotification } from "@/lib/notifications";

export interface AgentOutcome {
  result: Record<string, unknown>;
  sources: { title: string; uri: string }[];
  memoryIds: string[];
  grounded: boolean;
}

async function memoryContext(sb: any, userId: string, query: string, limit = 5): Promise<{ block: string; ids: string[] }> {
  try {
    const rows = await MemoryRetrievalService.hybrid(sb, { query, limit, semantic: true });
    const ids = rows.map((r) => r.id);
    const block = rows.length
      ? rows.map((r, i) => `[M${i + 1}] (${(r.created_at ?? "").slice(0, 10)}) ${r.original_text.slice(0, 160)}`).join("\n")
      : "(none)";
    return { block, ids };
  } catch { return { block: "(none)", ids: [] }; }
}

export const AgentService = {
  /** Online Research Agent - grounded web search + user memory context. */
  async research(sb: any, userId: string, query: string): Promise<AgentOutcome> {
    const { block, ids } = await memoryContext(sb, userId, query);
    const prompt = `You are a research agent with web access. Research this topic for the user:
"${query}"

Context from the user's own memories (may be relevant, may be empty):
 ${block}

Return ONLY JSON:
{ "answer": string (direct answer, 2-5 sentences),
  "key_points": [string] (3-6),
  "so_what": string (practical implication for THIS user given their memories),
  "search_queries_used": [string] }`;
    try {
      const { data, sources } = await geminiGroundedJSON(prompt);
      return { result: data, sources, memoryIds: ids, grounded: true };
    } catch (e) {
      console.error("[agents] grounding unavailable, plain fallback:", e);
      const data = await geminiJSON(prompt);
      // model-provided links render clickable, clearly labeled as such
      const modelSources = Array.isArray((data as any).sources)
        ? (data as any).sources.filter((s: any) => s?.uri).slice(0, 6)
        : [];
      return { result: data, sources: modelSources, memoryIds: ids, grounded: false };
    }
  },

  /** Buying Research Agent - one-shot comparison. */
  async buying(sb: any, userId: string, query: string): Promise<AgentOutcome> {
    const { block, ids } = await memoryContext(sb, userId, query, 4);
    const prompt = `You are a buying-research agent with web access. Compare current options for:
"${query}"

User context from memories (budgets, prior purchases, preferences):
 ${block}

Return ONLY JSON:
{ "recommendation": string,
  "options": [ { "name": string, "approx_price": string, "pros": string, "cons": string } ] (2-4),
  "advice": string (what to check before buying, warranty/timing tips) }`;
    try {
      const { data, sources } = await geminiGroundedJSON(prompt);
      return { result: data, sources, memoryIds: ids, grounded: true };
    } catch (e) {
      console.error("[agents] grounding unavailable, plain fallback:", e);
      const data = await geminiJSON(prompt);
      const modelSources = Array.isArray((data as any).sources)
        ? (data as any).sources.filter((s: any) => s?.uri).slice(0, 6)
        : [];
      return { result: data, sources: modelSources, memoryIds: ids, grounded: false };
    }
  },

  /** Problem Solver Agent - memories + tasks + (optionally) Calendar & Gmail. */
  async solver(sb: any, userId: string, problem: string): Promise<AgentOutcome> {
    const admin = createAdmin();
    const { block, ids } = await memoryContext(sb, userId, problem, 6);

    const { data: openTasks } = await admin
      .from("memory_metadata")
      .select("title, memories!inner(original_text)")
      .eq("user_id", userId).eq("status", "open")
      .in("type", ["task", "promise", "commitment"]).limit(8);
    const taskBlock = (openTasks ?? []).length
      ? (openTasks ?? []).map((t: any) => `- ${t.title || t.memories?.original_text}`).join("\n")
      : "(none)";

    // Google tools load dynamically - they exist after Part 33, skipped before.
    let calBlock = "";
    let mailBlock = "";
    try {
      const g = await import("@/lib/services/google");
      try {
        const events = await g.listUpcomingEvents(userId, 14);
        if (events.length) {
          calBlock = "UPCOMING CALENDAR EVENTS (next 14 days):\n" +
            events.map((e) => `- ${e.title} (${(e.start ?? "").slice(0, 16)})`).join("\n");
        }
      } catch {}
      try {
        const mails = await g.searchGmail(userId, problem.slice(0, 60), 3);
        if (mails.length) {
          mailBlock = "RELEVANT RECENT EMAILS (read-only):\n" +
            mails.map((m) => `- ${m.subject} (${m.date}): ${m.snippet.slice(0, 100)}`).join("\n");
        }
      } catch {}
    } catch { /* Google module not present yet */ }

    const prompt = `You are a practical problem-solving agent. Investigate this user's problem and produce an action plan.

PROBLEM: "${problem}"

Their relevant memories:
 ${block}

Their open tasks:
 ${taskBlock}
 ${calBlock ? "\n" + calBlock : ""}
 ${mailBlock ? "\n" + mailBlock : ""}

Return ONLY JSON:
{ "understanding": string (2-3 sentences: what's really going on),
  "steps": [ { "action": string, "detail": string, "effort": "quick"|"medium"|"big" } ] (3-6, ordered),
  "first_move": string (the single best next action),
  "uses_calendar": boolean, "uses_email": boolean }`;
    const data = await geminiJSON(prompt); // no web needed - internal investigation
    return { result: data, sources: [], memoryIds: ids, grounded: false };
  },
};
