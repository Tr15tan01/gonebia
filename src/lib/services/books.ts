import type { BookInfo } from "@/lib/types";

const STATUS_ORDER: Record<string, number> = {
  want_to_read: 0, reading: 1, finished: 2, abandoned: 3,
};

// Common leading articles/subtitle punctuation that make otherwise-identical
// titles fail an exact match ("The Hobbit" vs "Hobbit", "Atomic Habits:
// An Easy Way..." vs "Atomic Habits").
function stripNoise(t: string): string {
  return t
    .toLowerCase().trim()
    .replace(/^(the|a|an)\s+/i, "")
    .split(/[:\-–—]/)[0] // drop a subtitle after a colon/dash
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

/** Dice coefficient on character bigrams - handles typos, reordered words,
 *  subtitle differences, and minor rewordings much better than exact string
 *  equality, without needing a Postgres extension or an external library.
 *  Returns 0-1, where 1 is identical. */
function titleSimilarity(a: string, b: string): number {
  const A = bigrams(stripNoise(a));
  const B = bigrams(stripNoise(b));
  if (A.size === 0 || B.size === 0) return A.size === B.size ? 1 : 0;
  let overlap = 0;
  for (const g of A) if (B.has(g)) overlap++;
  return (2 * overlap) / (A.size + B.size);
}

const FUZZY_MATCH_THRESHOLD = 0.6;

export const BookService = {
  normalizeTitle(t: string): string {
    return t.toLowerCase().trim().replace(/\s+/g, " ");
  },

  /** Finds an existing book for this title - exact normalized match first,
   *  then a fuzzy fallback (typos, "The X" vs "X", subtitles, slight
   *  rewordings) so "Atomic Habits" and a later "Atomic Habit" mention (or
   *  "Atomic Habits: An Easy Way to...") connect to the SAME shelf entry
   *  instead of silently creating a near-duplicate. */
  async findExisting(admin: any, userId: string, title: string): Promise<{ id: string; status: string } | null> {
    const title_normalized = this.normalizeTitle(title);
    const { data: exact } = await admin
      .from("books").select("id, status").eq("user_id", userId).eq("title_normalized", title_normalized).maybeSingle();
    if (exact) return exact;

    const { data: candidates } = await admin
      .from("books").select("id, status, title").eq("user_id", userId).limit(200);
    let best: { id: string; status: string } | null = null;
    let bestScore = FUZZY_MATCH_THRESHOLD;
    for (const c of candidates ?? []) {
      const score = titleSimilarity(title, c.title);
      if (score >= bestScore) { bestScore = score; best = { id: c.id, status: c.status }; }
    }
    return best;
  },

  /** Create or advance a shelf entry from a captured book memory.
   *  Status only ever moves forward (want_to_read -> reading -> finished);
   *  re-mentioning a book never downgrades it.
   *  mention_only (a thought/quote/reflection ABOUT a book, not a status update):
   *  links to an existing shelf entry if one matches, but never creates a new
   *  entry and never touches status/rating for a title the user hasn't
   *  actually added yet. Returns the book id to link on memory_metadata.book_id,
   *  or null if there's nothing to link. */
  async upsertFromCapture(admin: any, userId: string, memoryId: string, book: BookInfo): Promise<string | null> {
    const title = book.title?.trim();
    if (!title) return null;
    const title_normalized = this.normalizeTitle(title);

    const existing = await this.findExisting(admin, userId, title);

    if (book.mention_only) {
      // just connect this note to the book if it's already on the shelf -
      // a passing reflection shouldn't silently create/alter a shelf entry.
      return existing ? existing.id : null;
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (book.author) patch.author = book.author.trim();
    if (book.rating) patch.rating = book.rating;
    if (book.recommended_by) patch.recommended_by = book.recommended_by.trim();
    if (book.status) {
      patch.status = book.status;
      if (book.status === "reading" ) patch.started_at = new Date().toISOString();
      if (book.status === "finished") patch.finished_at = new Date().toISOString();
    }

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
