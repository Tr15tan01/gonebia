import { geminiJSON, geminiText } from "@/lib/ai/gemini";
import { groundedAnswerPrompt, searchPlanPrompt } from "@/lib/ai/prompts";
import { MemoryRetrievalService, literalPhrases } from "./retrieval";
import { aiOutageMessage, aiOutageOf } from "@/lib/ai/errors";
import { SLEEP_QUESTION, describeReport } from "@/lib/sleep";
import { SleepService } from "./sleep";
import type { ChatReference, MemoryRow } from "@/lib/types";

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
    let mentionedBook = false;
    // typo check runs alongside retrieval: the question's words (and the
    // planner's) against the words the user has actually written
    const typoCheck = MemoryRetrievalService.corrections(
      sb, userId, [question, (plan_.query as string) || ""].join(" ").slice(0, 400),
    );
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

    // "freind" isn't in any note but "friend" is: notes with the corrected
    // word go first
    const corrections = (await typoCheck).filter((c, i, all) => all.findIndex((x) => x.from === c.from) === i);
    if (corrections.length) {
      // at most 5, so a questionable correction can't crowd out real matches
      const fixed = await MemoryRetrievalService.literal(sb, userId, [...new Set(corrections.map((c) => c.to))], 5);
      const seen = new Set(fixed.map((r) => r.id));
      rows = [...fixed, ...rows.filter((r: any) => !seen.has(r.id))].slice(0, 10);
    }

    // Literal pass: titles and exact phrases the user typed (a bare book or
    // film title often fails full-text search). Exact hits go first.
    try {
      const { data: shelf } = await sb.from("books").select("title").limit(300);
      const lower = question.toLowerCase();
      const titleHits = (shelf ?? [])
        .map((b: any) => String(b.title ?? ""))
        .filter((t: string) => t.length >= 3 && lower.includes(t.toLowerCase()));
      if (titleHits.length) mentionedBook = true;
      const literal = await MemoryRetrievalService.literal(sb, userId, [...titleHits, ...literalPhrases(question)], 10);
      if (literal.length) {
        const seen = new Set(literal.map((r) => r.id));
        rows = [...literal, ...rows.filter((r: any) => !seen.has(r.id))].slice(0, 10);
      }
    } catch (e) {
      console.error("[chat] literal pass failed:", e);
    }

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
      const seen = new Set(rows.map((r: any) => r.id));
      rows = [...rows, ...unfiltered.filter((r: any) => !seen.has(r.id))].slice(0, 10);
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
    const looksBookRelated = BOOK_QUESTION.test(question) || mentionedBook
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

    // Sleep questions ("how much did I sleep this week?") are arithmetic over
    // many notes - "going to bed" at 23:40, "woke up" at 07:10 - which a
    // language model gets wrong. The app pairs and totals them itself; the
    // model only puts the result into words.
    let sleepContext = "";
    let sleepSummary = "";
    if (SLEEP_QUESTION.test(question) || appliedTypes?.includes("sleep")) {
      try {
        const { report, notes, tz } = await SleepService.reportFor(
          sb, question, timezone, (plan_.from as string | null) ?? null, (plan_.to as string | null) ?? null,
        );
        if (report.nights.length || report.unpairedBedtimes || report.unpairedWakes || report.naps.length) {
          // the notes behind the nights go first, so the answer can cite them
          const used = new Set(report.nights.flatMap((n) => n.memoryIds));
          const sleepRows: MemoryRow[] = notes.filter((n) => used.has(n.id)).slice(-10).map((n) => ({
            id: n.id, original_text: n.text, created_at: n.created_at, type: n.type ?? "sleep",
            title: n.title, summary: "", importance: 2, status: "open", due_at: null,
            occurred_at: n.occurred_at ?? null, people: [],
          } as MemoryRow));
          const seen = new Set(sleepRows.map((r) => r.id));
          rows = [...sleepRows, ...rows.filter((r: any) => !seen.has(r.id))].slice(0, 14);
          const refFor = (id: string) => { const i = rows.findIndex((r: any) => r.id === id); return i >= 0 ? i + 1 : null; };
          sleepSummary = describeReport(report, tz, refFor);
          sleepContext = "SLEEP LOG - CALCULATED BY THE APP from the user's bedtime / wake-up / sleep notes. " +
            "These numbers are exact: repeat them as they are and never recompute them.\n" + sleepSummary;
        }
      } catch (e) {
        console.error("[chat] sleep calculation failed:", e);
      }
    }

    if (!rows.length && !bookContext && !sleepContext) {
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
    let degraded = false; // true when the language model couldn't answer
    try {
      const memoryContext = rows.map((r: any, i: number) =>
        `[${i + 1}] (${fmt(r.occurred_at ?? r.created_at)}${r.occurred_at ? "" : ", written"} - ${r.type}) "${r.original_text}"`
      ).join("\n");
      const typoNote = corrections.length
        ? "SEARCH NOTE: some words in the question don't appear in the user's notes, so close matches were searched instead: " +
          corrections.map((c) => `"${c.from}" -> "${c.to}"`).join(", ") + ". Answer about the matched word and mention the match briefly."
        : "";
      const context = [typoNote, bookContext, sleepContext, memoryContext].filter(Boolean).join("\n\n");
      answer = await geminiText(groundedAnswerPrompt(question, context), "chat_answer", { userId, feature: "chat_answer" }, 0.3);
      answer = answer.replace(/\[(\d+)\]/g, (m, n) => (+n >= 1 && +n <= rows.length ? m : ""));
    } catch (e) {
      console.error("[chat] LLM answer failed, using retrieval fallback:", e);
      degraded = true;
      const outage = aiOutageOf(e);
      const lead = outage
        ? `${aiOutageMessage(outage)}\n\nMeanwhile, here's what I found in your memories:`
        : "My language model couldn't be reached just now, but I did find these memories:";
      answer = [
        lead,
        // numbers the app computed itself don't need the AI - show them anyway
        sleepSummary ? `\n${sleepSummary}` : "",
        "",
        rows.map((r: any, i: number) => `[${i + 1}] ${r.title || r.original_text.slice(0, 60)} - ${fmt(r.occurred_at ?? r.created_at)}`).join("\n"),
        outage ? "" : "\nTry again in a moment for a full answer.",
      ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
    }

    return { answer, references, degraded };
  },
};
