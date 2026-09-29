import { MemoryExtractionService } from "./extraction";
import { ApplyService } from "./apply";
import { EmbeddingService } from "./embedding";

/**
 * Notes saved while the AI was unavailable (spend cap, quota, outage) are
 * kept with extraction_status = 'failed': safe and keyword-searchable, but
 * not categorised, not embedded, no tasks/reminders/books derived. This
 * sorts them once the AI works again.
 *
 * Runs from the daily cron, after a user's next successful capture (their
 * own backlog), and from the admin panel's "Sort them now" button.
 */

const MAX_AGE_DAYS = 14; // older failures are most likely permanent, not outage-related

export interface ReprocessResult { processed: number; failed: number; remaining: number; aiPaused: boolean }

export const ReprocessService = {
  async pendingCount(admin: any, userId?: string): Promise<number> {
    let q = admin.from("memory_metadata").select("memory_id", { count: "exact", head: true })
      .eq("extraction_status", "failed")
      .gte("created_at", new Date(Date.now() - MAX_AGE_DAYS * 86_400_000).toISOString());
    if (userId) q = q.eq("user_id", userId);
    const { count } = await q;
    return count ?? 0;
  },

  async run(admin: any, opts: { limit?: number; budgetMs?: number; userId?: string } = {}): Promise<ReprocessResult> {
    const started = Date.now();
    const budget = opts.budgetMs ?? 45_000;
    let q = admin.from("memory_metadata").select("memory_id, user_id")
      .eq("extraction_status", "failed")
      .gte("created_at", new Date(Date.now() - MAX_AGE_DAYS * 86_400_000).toISOString())
      .order("created_at", { ascending: true })
      .limit(opts.limit ?? 20);
    if (opts.userId) q = q.eq("user_id", opts.userId);
    const { data: pending, error } = await q;
    if (error) {
      console.error("[reprocess] query failed:", error);
      return { processed: 0, failed: 0, remaining: 0, aiPaused: false };
    }

    const tzCache = new Map<string, string>();
    let processed = 0, failed = 0, aiPaused = false;

    for (const row of pending ?? []) {
      if (Date.now() - started > budget) break;
      const { data: mem } = await admin.from("memories")
        .select("id, original_text, created_at, deleted_at").eq("id", row.memory_id).maybeSingle();
      if (!mem || mem.deleted_at) continue;

      if (!tzCache.has(row.user_id)) {
        const { data: prof } = await admin.from("profiles").select("timezone").eq("id", row.user_id).maybeSingle();
        tzCache.set(row.user_id, prof?.timezone || "UTC");
      }
      // relative dates ("tomorrow at 9") resolve against when it was WRITTEN
      const { structured, outage } = await MemoryExtractionService.extractDetailed(
        mem.original_text, new Date(mem.created_at), tzCache.get(row.user_id)!, row.user_id, null,
      );
      if (outage) { aiPaused = true; break; } // still down - try again next run
      if (!structured) { failed++; continue; }

      // a reminder that would already have fired isn't scheduled late
      const now = Date.now();
      if (structured.reminder_at && new Date(structured.reminder_at).getTime() < now - 3_600_000) structured.reminder_at = null;
      if (structured.review_at && new Date(structured.review_at).getTime() < now) structured.review_at = null;

      // swap the placeholder metadata row for the real one
      const { data: placeholder } = await admin.from("memory_metadata").select("*").eq("memory_id", mem.id).maybeSingle();
      await admin.from("memory_metadata").delete().eq("memory_id", mem.id);
      const applied = await ApplyService.structured(
        admin, row.user_id, mem.id, structured, mem.original_text, null, mem.created_at,
      );
      if (!applied.ok) {
        if (placeholder) await admin.from("memory_metadata").insert(placeholder);
        failed++;
        continue;
      }

      const { count: hasEmbedding } = await admin.from("memory_embeddings")
        .select("memory_id", { count: "exact", head: true }).eq("memory_id", mem.id);
      if (!hasEmbedding) {
        try {
          const embedding = await EmbeddingService.embed(
            EmbeddingService.textFor({ original_text: mem.original_text, structured }), row.user_id,
          );
          await admin.from("memory_embeddings").insert({ memory_id: mem.id, user_id: row.user_id, embedding });
        } catch (e) {
          console.error("[reprocess] embedding failed for", mem.id, e);
        }
      }
      await admin.from("daily_briefings").delete().eq("user_id", row.user_id);
      processed++;
    }

    const remaining = await this.pendingCount(admin, opts.userId);
    return { processed, failed, remaining, aiPaused };
  },
};
