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

    // 1. Plan the retrieval (keywords, filters, date range resolved from natural language).
    //    If planning fails, fall back to using the raw question.
    let plan: Record<string, unknown> = { query: question, semantic: true, types: null, person: null, from: null, to: null };
    try {
      plan = { ...plan, ...(await geminiJSON<Record<string, unknown>>(searchPlanPrompt(question, new Date(), timezone))) };
    } catch (e) {
      console.error("[chat] planning failed, using raw question:", e);
    }

    // 2. Hybrid retrieval (keyword + semantic + structured filters), RLS-scoped
    const rows = await MemoryRetrievalService.hybrid(sb, {
      query: (plan.query as string) || question,
      types: (plan.types as string[] | null) ?? null,
      person: (plan.person as string | null) ?? null,
      from: (plan.from as string | null) ?? null,
      to: (plan.to as string | null) ?? null,
      limit: 8,
    });

    if (!rows.length) {
      return {
        answer: "I couldn't find anything in your memories about that. If you tell me about it, I'll remember it for next time.",
        references: [] as ChatReference[],
      };
    }

    const references: ChatReference[] = rows.map((r: any, i: number) => ({
      n: i + 1, id: r.id, title: r.title || r.original_text.slice(0, 60),
      date: r.created_at, snippet: r.original_text.slice(0, 120),
    }));

    // 3. Grounded answer with citations. If the LLM is unreachable, degrade gracefully:
    //    return the retrieved memories themselves - chat still works.
    let answer: string;
    try {
      const context = rows.map((r: any, i: number) =>
        `[${i + 1}] (${fmt(r.created_at)} - ${r.type}) "${r.original_text}"`
      ).join("\n");
      answer = await geminiText(groundedAnswerPrompt(question, context), 0.3);
      answer = answer.replace(/\[(\d+)\]/g, (m, n) => (+n >= 1 && +n <= rows.length ? m : ""));
    } catch (e) {
      console.error("[chat] LLM answer failed, using retrieval fallback:", e);
      answer = "My language model couldn't be reached just now, but I did find these memories:\n\n" +
        rows.map((r: any, i: number) =>
          `[${i + 1}] ${r.title || r.original_text.slice(0, 60)} - ${fmt(r.created_at)}`
        ).join("\n") +
        "\n\nTry again in a moment for a full answer.";
    }

    return { answer, references };
  },
};
