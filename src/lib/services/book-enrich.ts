/** Book metadata enrichment. Order: Open Library -> Google Books -> Gemini
 *  grounded web search. Every step is best-effort with timeouts; the user's
 *  own entry is the source of truth and is never altered - metadata is stored
 *  in separate columns.
 *
 *  Every catalogue result is VERIFIED against the user's title (and author,
 *  when known) before it's used - taking the first search hit is how a book
 *  ends up wearing another book's cover and description. */
import { compareAuthors, compareTitles } from "@/lib/book-match";

export interface EnrichedBook {
  topic: string | null;
  pub_year: number | null;
  description: string | null;
  cover_url: string | null;
  isbn: string | null;
  /** the catalogue's author for this work - only set on a confident title match */
  author: string | null;
}

async function fetchWithTimeout(url: string, ms = 4000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { signal: ctl.signal }); } finally { clearTimeout(t); }
}

function httpsOnly(u: unknown): string | null {
  if (typeof u !== "string") return null;
  try { const p = new URL(u); return p.protocol === "https:" ? p.toString() : null; } catch { return null; }
}

/** Is this catalogue record the book the user meant? Titles must be the same
 *  work (a subtitle is fine, a longer different title is not) and, when the
 *  user named an author, the authors must not contradict. */
function isSameWork(wantTitle: string, wantAuthor: string | null, gotTitle: unknown, gotAuthors: unknown): boolean {
  if (typeof gotTitle !== "string") return false;
  if (compareTitles(wantTitle, gotTitle) !== "same") return false;
  const authors = Array.isArray(gotAuthors) ? gotAuthors.filter((a): a is string => typeof a === "string") : [];
  if (!wantAuthor || !authors.length) return true;
  return authors.some((a) => compareAuthors(wantAuthor, a) !== "different");
}

export const BookEnrichmentService = {
  async lookup(title: string, author: string | null, userId: string): Promise<EnrichedBook | null> {
    // 1. Open Library - free, no key, great subjects + covers
    try {
      const params = new URLSearchParams({
        title, limit: "8", fields: "title,subtitle,author_name,first_publish_year,subject,cover_i,isbn",
      });
      if (author) params.set("author", author);
      const res = await fetchWithTimeout(`https://openlibrary.org/search.json?${params}`);
      if (res.ok) {
        const j = await res.json();
        const d = (j?.docs ?? []).find((doc: any) => isSameWork(title, author, doc?.title, doc?.author_name));
        if (d) {
          const subjects = ((d.subject ?? []) as string[])
            .filter((s: string) => s.length <= 30).slice(0, 3);
          return {
            topic: subjects.length ? subjects.join(", ") : null,
            pub_year: typeof d.first_publish_year === "number" ? d.first_publish_year : null,
            description: null,
            cover_url: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
            isbn: Array.isArray(d.isbn) ? (d.isbn[0] ?? null) : null,
            author: Array.isArray(d.author_name) ? (d.author_name[0] ?? null) : null,
          };
        }
      }
    } catch (e) { console.error("[book-enrich] openlibrary failed:", e); }

    // 2. Google Books - free without a key, good descriptions
    try {
      const q = `intitle:"${title.replace(/"/g, "")}"${author ? `+inauthor:"${author.replace(/"/g, "")}"` : ""}`;
      const res = await fetchWithTimeout(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=8`);
      if (res.ok) {
        const j = await res.json();
        const v = (j?.items ?? []).map((it: any) => it?.volumeInfo)
          .find((vi: any) => isSameWork(title, author, vi?.title, vi?.authors));
        if (v) {
          const year = typeof v.publishedDate === "string" ? parseInt(v.publishedDate.slice(0, 4), 10) : NaN;
          const desc = typeof v.description === "string"
            ? v.description.replace(/<[^>]*>/g, "").slice(0, 400) : null;
          return {
            topic: Array.isArray(v.categories) && v.categories.length ? v.categories[0] : null,
            pub_year: Number.isFinite(year) ? year : null,
            description: desc,
            cover_url: httpsOnly(v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail ?? null),
            isbn: (v.industryIdentifiers ?? []).find((i: any) => i.type === "ISBN_13")?.identifier ?? null,
            author: Array.isArray(v.authors) ? (v.authors[0] ?? null) : null,
          };
        }
      }
    } catch (e) { console.error("[book-enrich] google books failed:", e); }

    // 3. Gemini grounded web search - last resort
    try {
      const { geminiGroundedJSON } = await import("@/lib/ai/gemini");
      const { data } = await geminiGroundedJSON(
        `Identify the book titled exactly "${title}"${author ? ` by ${author}` : ""}. ` +
        `Do not substitute a different book with a similar title. If you can't identify that exact ` +
        `book, return {"topic": null}.\n` +
        `Return ONLY JSON: { "topic": string (1-3 words), "author": string|null, "year": number|null, ` +
        `"description": string (max 200 chars), "url": string|null (https cover or book-page URL ONLY if certain) }`,
        "enrichment", { userId, feature: "book_enrichment" }
      );
      const d = data as any;
      if (d && typeof d.topic === "string"
        && (!author || typeof d.author !== "string" || compareAuthors(author, d.author) !== "different")) {
        return {
          topic: d.topic.slice(0, 60),
          pub_year: typeof d.year === "number" ? d.year : null,
          description: typeof d.description === "string" ? d.description.slice(0, 400) : null,
          cover_url: httpsOnly(d.url),
          isbn: null,
          author: typeof d.author === "string" ? d.author.slice(0, 120) : null,
        };
      }
    } catch (e) { console.error("[book-enrich] grounded lookup failed:", e); }

    return null;
  },

  /** The columns a lookup result writes. A missing author is filled from the
   *  catalogue (which makes future "is this the same book?" checks sharper);
   *  an author the user already gave is never replaced. */
  fieldsFor(info: EnrichedBook, currentAuthor: string | null): Record<string, unknown> {
    const fields: Record<string, unknown> = {
      topic: info.topic, pub_year: info.pub_year, description: info.description,
      cover_url: info.cover_url, isbn: info.isbn, enrich_status: "enriched",
    };
    if (!currentAuthor && info.author) fields.author = info.author;
    return fields;
  },

  /** Look up and store details for a shelf entry, using the entry's OWN
   *  title/author. Never throws into the capture path. */
  async enrich(admin: any, userId: string, bookId: string): Promise<boolean> {
    try {
      const { data: book } = await admin.from("books").select("title, author").eq("id", bookId).maybeSingle();
      if (!book) return false;
      const info = await this.lookup(book.title, book.author, userId);
      if (!info) {
        await admin.from("books").update({ enrich_status: "not_found" }).eq("id", bookId);
        return false;
      }
      const { error } = await admin.from("books").update(this.fieldsFor(info, book.author)).eq("id", bookId);
      if (error) {
        // e.g. filling the author collided with an identical entry - keep the details, skip the author
        const { author: _skip, ...rest } = this.fieldsFor(info, book.author);
        await admin.from("books").update(rest).eq("id", bookId);
      }
      return true;
    } catch (e) {
      console.error("[book-enrich] enrich failed:", e);
      return false;
    }
  },
};
