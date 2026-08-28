import { geminiJSON, geminiText } from "@/lib/ai/gemini";
import { groundedAnswerPrompt, searchPlanPrompt } from "@/lib/ai/prompts";
import { MemoryRetrievalService } from "./retrieval";
import type { ChatReference } from "@/lib/types";

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const AIChatService = {
  async answer(sb: any, history: { role: "user" | "assistant"; content: string }[], timezone: string) {
    const question = [...history].reverse().find((m) => m.role === "user")?.content ?? "";

    // 1. Plan the retrieval (keywords, filters, date range resolved from natural language)
    let plan: any = { query: question, semantic: true, types: null, person: null, from: null, to: null };
    try { plan = { ...plan, ...(await geminiJSON<Record<string, unknown>>(searchPlanPrompt(question, new Date(), timezone))) }; } catch {}

    // 2. Hybrid retrieval (keyword + semantic + structured filters), RLS-scoped
    const rows = await MemoryRetrievalService.hybrid(sb, {
      query: plan.query || question,
      types: plan.types,
      person: plan.person,
      from: plan.from,
      to: plan.to,
      limit: 8,
    });

    if (!rows.length) {
      return {
        answer: "I couldn't find anything in your memories about that. If you tell me about it, I'll remember it for next time.",
        references: [] as ChatReference[],
      };
    }

    // 3. Grounded answer with citations to the exact memories used
    const context = rows.map((r: any, i: number) =>
      `[${i + 1}] (${fmt(r.created_at)} - ${r.type}) "${r.original_text}"`
    ).join("\n");
    let answer = await geminiText(groundedAnswerPrompt(question, context), 0.3);
    // strip citations that don't resolve to a retrieved memory
    answer = answer.replace(/\[(\d+)\]/g, (m, n) => (+n >= 1 && +n <= rows.length ? m : ""));

    const references: ChatReference[] = rows.map((r: any, i: number) => ({
      n: i + 1, id: r.id, title: r.title || r.original_text.slice(0, 60),
      date: r.created_at, snippet: r.original_text.slice(0, 120),
    }));
    return { answer, references };
  },
};
