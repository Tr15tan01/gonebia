import { BookService } from "./books";
import type { Structured } from "@/lib/types";

/** High-precision task patterns: assignments from other people and explicit
 *  self to-dos. Deliberately excludes "I should", which is often a decision. */
export const TASK_PATTERNS = [
  /\b(asked|told|wants?|needs?|reminded)\s+(me|us)\s+to\b/i,
  /\bmy\s+\w+\s+(asked|wants|told|needs)\b/i,
  /\b(i\s+need\s+to|i\s+have\s+to|i\s+must|remember\s+to|don'?t\s+forget\s+to|remind\s+me\b)\b/i,
];

export const ApplyService = {
  /** Persist AI-extracted structure for one memory: metadata row + all side
   *  tables (books, tasks, purchases, decisions, people, reminders).
   *  Metadata-insert errors are LOGGED LOUDLY - never silently ignored. */
  async structured(
    admin: any,
    userId: string,
    memoryId: string,
    structured: Structured,
    originalText: string,
    pickedAt: string | null,
    memoryCreatedAt: string
  ): Promise<{ ok: boolean; error?: unknown }> {
    // interpretation and book are NOT memory_metadata columns - strip them
    const { interpretation: _interp, book, ...meta } = structured;

    // Deterministic rule 1: any book info => this memory IS a book memory
    if (book) meta.type = "book";

    // Deterministic rule 2: assignment / self-to-do patterns => task
    if (!book && TASK_PATTERNS.some((re) => re.test(originalText))) {
      meta.type = "task";
      if (meta.status === "archived") meta.status = "open";
    }

    // Deterministic fallback for the optional picked date/time
    if (pickedAt && !meta.occurred_at && !meta.due_at && !meta.reminder_at) {
      meta.occurred_at = pickedAt;
    }

    const { error } = await admin.from("memory_metadata").insert({
      memory_id: memoryId, user_id: userId, ...meta,
      occurred_at: meta.occurred_at ?? memoryCreatedAt,
    });
    if (error) {
      console.error("[apply] METADATA INSERT FAILED for memory", memoryId, error);
      return { ok: false, error };
    }

    try {
      if (book && meta.type === "book") {
        await BookService.upsertFromCapture(admin, userId, memoryId, book);
      }
      if (["task", "promise", "commitment"].includes(meta.type)) {
        await admin.from("tasks").insert({ memory_id: memoryId, user_id: userId, due_at: meta.due_at });
      }
      if (meta.type === "event") {
        await admin.from("events").insert({
          memory_id: memoryId, user_id: userId, event_at: meta.occurred_at, place: meta.places[0] ?? null,
        });
      }
      if (meta.type === "purchase" || meta.type === "expense") {
        await admin.from("purchases").insert({
          memory_id: memoryId, user_id: userId,
          product: meta.products[0] ?? meta.objects[0] ?? meta.title,
          company: meta.companies[0] ?? null,
          amount: meta.amounts[0]?.value ?? null,
          currency: meta.amounts[0]?.currency ?? "GEL",
          purchased_at: meta.occurred_at,
        });
      }
      if (meta.is_decision) {
        await admin.from("decisions").insert({
          memory_id: memoryId, user_id: userId,
          decided_at: meta.occurred_at ?? memoryCreatedAt,
          reason: meta.decision_reason, alternatives: meta.alternatives,
        });
      }
      for (const name of meta.people) {
        const normalized = name.toLowerCase().trim();
        const { data: person } = await admin
          .from("people")
          .upsert({ user_id: userId, name, normalized, last_mentioned_at: new Date().toISOString() },
            { onConflict: "user_id,normalized" })
          .select().single();
        if (person) await admin.from("memory_people").upsert({ memory_id: memoryId, person_id: person.id, user_id: userId });
      }
      if (meta.reminder_at) {
        await admin.from("reminders").insert({ user_id: userId, memory_id: memoryId, remind_at: meta.reminder_at });
      }
      if (meta.review_at) {
        await admin.from("reminders").insert({ user_id: userId, memory_id: memoryId, remind_at: meta.review_at });
        await admin.from("notifications").insert({
          user_id: userId, memory_id: memoryId, kind: "future_note",
          title: "A message from your past self",
          body: `On ${new Date(memoryCreatedAt).toLocaleDateString()} you wrote: "${originalText.slice(0, 120)}"`,
          data: { url: "/timeline" },
        });
      }
    } catch (e) {
      console.error("[apply] side-effect failure for memory", memoryId, e);
    }
    return { ok: true };
  },
};
