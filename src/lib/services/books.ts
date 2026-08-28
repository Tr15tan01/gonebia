import type { BookInfo } from "@/lib/types";

const STATUS_ORDER: Record<string, number> = {
  want_to_read: 0, reading: 1, finished: 2, abandoned: 3,
};

export const BookService = {
  normalizeTitle(t: string): string {
    return t.toLowerCase().trim().replace(/\s+/g, " ");
  },

  /** Create or advance a shelf entry from a captured book memory.
   *  Status only ever moves forward (want_to_read -> reading -> finished);
   *  re-mentioning a book never downgrades it. The original memory is linked. */
  async upsertFromCapture(admin: any, userId: string, memoryId: string, book: BookInfo): Promise<string | null> {
    const title = book.title?.trim();
    if (!title) return null;
    const title_normalized = this.normalizeTitle(title);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (book.author) patch.author = book.author.trim();
    if (book.rating) patch.rating = book.rating;
    if (book.recommended_by) patch.recommended_by = book.recommended_by.trim();
    if (book.status) {
      patch.status = book.status;
      if (book.status === "reading" ) patch.started_at = new Date().toISOString();
      if (book.status === "finished") patch.finished_at = new Date().toISOString();
    }

    const { data: existing } = await admin
      .from("books")
      .select("id, status")
      .eq("user_id", userId)
      .eq("title_normalized", title_normalized)
      .maybeSingle();

    if (existing) {
      if (book.status && STATUS_ORDER[book.status] < STATUS_ORDER[existing.status]) {
        patch.status = existing.status;
        delete patch.started_at;
        delete patch.finished_at;
      }
      const { data, error } = await admin
        .from("books").update(patch).eq("id", existing.id).select("id").single();
      if (error) { console.error("[books] update failed:", error); return null; }
      return data.id;
    }

    const { data, error } = await admin
      .from("books")
      .insert({ user_id: userId, memory_id: memoryId, title, title_normalized, ...patch })
      .select("id")
      .single();
    if (error) { console.error("[books] insert failed:", error); return null; }
    return data.id;
  },
};
