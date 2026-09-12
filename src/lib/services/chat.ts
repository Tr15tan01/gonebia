import { geminiJSON, geminiText } from "@/lib/ai/gemini";
import { groundedAnswerPrompt, searchPlanPrompt } from "@/lib/ai/prompts";
import { MemoryRetrievalService } from "./retrieval";
import type { ChatReference } from "@/lib/types";

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const BOOK_QUESTION = /\bbooks?\b|\breading\b|\bread\b/i;

export const AIChatService = {
  async answer(sb: any, userId: string, history: { role: "user" | "assistant"; content: string }[], timezone: string, plan: string = "pro") {
    const question = [...history].reverse().find((m) => m.role === "user")?.content ?? "";

    let plan_: Record<string, unknown> = { query: question, semantic: true, types: null, person: null, from: null, to: null };
    try {
      plan_ = { ...plan_, ...(await geminiJSON<Record<string, unknown>>(
        searchPlanPrompt(question, new Date(), timezone), "search_plan", { userId, feature: "chat_search_plan" }
      )) };
    } catch (e) {
      console.error("[chat] planning failed, using raw question:", e);
    }

    const appliedTypes = (plan_.types as string[] | null) ?? null;
    let rows = await MemoryRetrievalService.hybrid(sb, userId, {
      query: (plan_.query as string) || question,
      types: appliedTypes,
      person: (plan_.person as string | null) ?? null,
      from: (plan_.from as string | null) ?? null,
      to: (plan_.to as string | null) ?? null,
      limit: 10,
      // Semantic search is genuinely cheap (embeddings are a fraction of a
      // cent per question, and every memory is already embedded at capture
      // time regardless of plan) - no cost reason to withhold better
      // retrieval quality from free users.
      semantic: true,
    });

    // The search-plan step is GUESSING how a note was classified when it was
    // written - "types" is a hard filter in hybrid(), so a wrong guess
    // doesn't just rank things lower, it silently excludes the exact memory
    // that would have answered the question (this was reported as "found it
    // with one phrasing but not another" - the difference was purely which
    // type the planner happened to guess). If a type filter came back
    // (almost) empty, retry once without it rather than trusting the guess.
    if (appliedTypes?.length && rows.length < 2) {
      const unfiltered = await MemoryRetrievalService.hybrid(sb, userId, {
        query: (plan_.query as string) || question,
        types: null,
        person: (plan_.person as string | null) ?? null,
        from: (plan_.from as string | null) ?? null,
        to: (plan_.to as string | null) ?? null,
        limit: 10,
        semantic: true,
      });
      if (unfiltered.length > rows.length) rows = unfiltered;
    }

    // "What books am I reading/have I read" is an aggregate, structured
    // question ("list everything with status=X") that fuzzy memory search
    // is a poor fit for - the fact that matters (a book's current status)
    // lives authoritatively on the books table, not always clearly in the
    // wording of whichever single memory happens to score highest. Rather
    // than only trying harder to retrieve the right memory, ask the
    // dedicated table directly whenever the question looks book-related,
    // and merge that in - previously this could return "couldn't find
    // anything" even with books plainly on the shelf, if memory search
    // alone came up empty.
    let bookContext = "";
    const looksBookRelated = BOOK_QUESTION.test(question)
      || (plan_.types as string[] | null)?.includes("book");
    if (looksBookRelated) {
      const { data: books } = await sb
        .from("books").select("title, author, status, rating")
        .order("updated_at", { ascending: false }).limit(30);
      if (books?.length) {
        const label: Record<string, string> = {
          reading: "currently reading", finished: "finished", want_to_read: "want to read", abandoned: "paused/not finished",
        };
        bookContext = "Your book shelf (authoritative, current status):\n" + books
          .map((b: any) => `- "${b.title}"${b.author ? ` by ${b.author}` : ""} - ${label[b.status] ?? b.status}${b.rating ? `, rated ${b.rating}/5` : ""}`)
          .join("\n");
      }
    }

    if (!rows.length && !bookContext) {
      return {
        answer: "I couldn't find anything in your memories about that. If you tell me about it, I'll remember it for next time.",
        references: [] as ChatReference[],
      };
    }

    const references: ChatReference[] = rows.map((r: any, i: number) => ({
      n: i + 1, id: r.id, title: r.title || r.original_text.slice(0, 60),
      date: r.occurred_at ?? r.created_at, snippet: r.original_text.slice(0, 120),
    }));

    let answer: string;
    try {
      const memoryContext = rows.map((r: any, i: number) =>
        `[${i + 1}] (${fmt(r.occurred_at ?? r.created_at)}${r.occurred_at ? "" : ", written"} - ${r.type}) "${r.original_text}"`
      ).join("\n");
      const context = [bookContext, memoryContext].filter(Boolean).join("\n\n");
      answer = await geminiText(groundedAnswerPrompt(question, context), "chat_answer", { userId, feature: "chat_answer" }, 0.3);
      answer = answer.replace(/\[(\d+)\]/g, (m, n) => (+n >= 1 && +n <= rows.length ? m : ""));
    } catch (e) {
      console.error("[chat] LLM answer failed, using retrieval fallback:", e);
      answer = "My language model couldn't be reached just now, but I did find these memories:\n\n" +
        rows.map((r: any, i: number) => `[${i + 1}] ${r.title || r.original_text.slice(0, 60)} - ${fmt(r.occurred_at ?? r.created_at)}`).join("\n") +
        "\n\nTry again in a moment for a full answer.";
    }

    return { answer, references };
  },
};
