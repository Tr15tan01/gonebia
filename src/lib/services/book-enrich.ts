/** Book metadata enrichment. Order: Open Library -> Google Books -> Gemini
 *  grounded web search. Every step is best-effort with timeouts; the user's
 *  own entry is the source of truth and is never altered - metadata is stored
 *  in separate columns. */

export interface EnrichedBook {
  topic: string | null;
  pub_year: number | null;
  description: string | null;
  cover_url: string | null;
  isbn: string | null;
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

export const BookEnrichmentService = {
  async lookup(title: string, author: string | null): Promise<EnrichedBook | null> {
    const q = encodeURIComponent([title, author].filter(Boolean).join(" "));

    // 1. Open Library - free, no key, great subjects + covers
    try {
      const res = await fetchWithTimeout(
        `https://openlibrary.org/search.json?q=${q}&limit=1&fields=title,author_name,first_publish_year,subject,cover_i,isbn`
      );
      if (res.ok) {
        const j = await res.json();
        const d = j?.docs?.[0];
        if (d) {
          const subjects = ((d.subject ?? []) as string[])
            .filter((s: string) => s.length <= 30).slice(0, 3);
          return {
            topic: subjects.length ? subjects.join(", ") : null,
            pub_year: typeof d.first_publish_year === "number" ? d.first_publish_year : null,
            description: null,
            cover_url: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
            isbn: Array.isArray(d.isbn) ? (d.isbn[0] ?? null) : null,
          };
        }
      }
    } catch (e) { console.error("[book-enrich] openlibrary failed:", e); }

    // 2. Google Books - free without a key, good descriptions
    try {
      const res = await fetchWithTimeout(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`);
      if (res.ok) {
        const j = await res.json();
        const v = j?.items?.[0]?.volumeInfo;
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
          };
        }
      }
    } catch (e) { console.error("[book-enrich] google books failed:", e); }

    // 3. Gemini grounded web search - last resort
    try {
      const { geminiGroundedJSON } = await import("@/lib/ai/gemini");
      const { data } = await geminiGroundedJSON(
        `Identify the book "${title}"${author ? ` by ${author}` : ""}. ` +
        `Return ONLY JSON: { "topic": string (1-3 words), "year": number|null, ` +
        `"description": string (max 200 chars), "url": string|null (https cover or book-page URL ONLY if certain) }`
      );
      if (data && typeof (data as any).topic === "string") {
        return {
          topic: (data as any).topic.slice(0, 60),
          pub_year: typeof (data as any).year === "number" ? (data as any).year : null,
          description: typeof (data as any).description === "string"
            ? (data as any).description.slice(0, 400) : null,
          cover_url: httpsOnly((data as any).url),
          isbn: null,
        };
      }
    } catch (e) { console.error("[book-enrich] grounded lookup failed:", e); }

    return null;
  },

  /** Store lookup results. Never throws into the capture path. */
  async enrich(admin: any, userId: string, bookId: string, title: string, author: string | null): Promise<boolean> {
    try {
      const info = await this.lookup(title, author);
      if (!info) {
        await admin.from("books").update({ enrich_status: "not_found" }).eq("id", bookId);
        return false;
      }
      await admin.from("books").update({
        topic: info.topic, pub_year: info.pub_year, description: info.description,
        cover_url: info.cover_url, isbn: info.isbn, enrich_status: "enriched",
      }).eq("id", bookId);
      return true;
    } catch (e) {
      console.error("[book-enrich] enrich failed:", e);
      return false;
    }
  },
};
