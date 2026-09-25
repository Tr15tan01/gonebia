/**
 * Deciding whether two book references mean the SAME book.
 *
 * The old rule ("titles are ~60% similar by character pairs") merged
 * different books whenever one title sat inside another: "Free Will"
 * (Sam Harris) was filed under "Time and Free Will" (Henri Bergson), and the
 * merge then overwrote that book's author and cover.
 *
 * The rules now, in order:
 *  1. Different authors => different books, whatever the titles say.
 *  2. Same words (ignoring case, a leading article, punctuation and a
 *     subtitle after a colon), or only typo-level differences => same book.
 *  3. One title containing the other ("Dune" / "Dune Messiah", "Sapiens" /
 *     "Sapiens A Brief History of Humankind"), or a loose resemblance =>
 *     "maybe": only world knowledge can tell, so the caller asks the model
 *     and defaults to "different". A duplicate shelf entry is a 2-second fix;
 *     a wrong merge silently corrupts two books.
 *
 * Pure functions, no I/O - shared by capture, enrichment and the tests.
 */

export type TitleMatch = "same" | "maybe" | "different";
export type AuthorMatch = "same" | "different" | "unknown";

const foldAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Main title words: lowercase, no accents/quotes/punctuation, no leading
 *  article, no subtitle after a colon or a spaced dash. */
export function titleWords(title: string): string[] {
  let t = foldAccents(String(title ?? "")).toLowerCase().trim();
  t = t.replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, "");
  t = t.split(/\s*:\s*|\s+[-–—]\s+/)[0] ?? t;
  t = t.replace(/&/g, " and ").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/^(the|a|an)\s+/, "");
  return t ? t.split(" ") : [];
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Two words that are the same up to a plural "s" or a small typo. */
function wordsAlike(a: string, b: string): boolean {
  if (a === b) return true;
  if (a + "s" === b || b + "s" === a || a + "es" === b || b + "es" === a) return true;
  const len = Math.min(a.length, b.length);
  if (len >= 8) return levenshtein(a, b) <= 2;
  if (len >= 5) return levenshtein(a, b) <= 1;
  return false;
}

function containsRun(hay: string[], needle: string[]): boolean {
  if (!needle.length || needle.length > hay.length) return false;
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (!wordsAlike(hay[i + j], needle[j])) continue outer;
    return true;
  }
  return false;
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

export function dice(a: string, b: string): number {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return a === b ? 1 : 0;
  let overlap = 0;
  for (const g of A) if (B.has(g)) overlap++;
  return (2 * overlap) / (A.size + B.size);
}

export function compareTitles(a: string, b: string): TitleMatch {
  const wa = titleWords(a), wb = titleWords(b);
  if (!wa.length || !wb.length) return "different";
  if (wa.join(" ") === wb.join(" ")) return "same";
  // same number of words and every word matches up to a typo/plural
  if (wa.length === wb.length && wa.every((w, i) => wordsAlike(w, wb[i]))) return "same";
  // one title inside the other - could be a subtitle, could be another book
  if (containsRun(wa, wb) || containsRun(wb, wa)) return "maybe";
  if (dice(wa.join(" "), wb.join(" ")) >= 0.8) return "maybe";
  return "different";
}

/** Author name tokens with accents, punctuation and initials' dots removed. */
function authorTokens(name: string): string[] {
  return foldAccents(String(name ?? "")).toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter(Boolean);
}

/** "Henri Bergson" = "Henry Bergson" = "Bergson" = "H. Bergson";
 *  "Sam Harris" = "Samuel Harris"; "Sam Harris" != "Henri Bergson". */
export function compareAuthors(a: string | null | undefined, b: string | null | undefined): AuthorMatch {
  const ta = authorTokens(a ?? ""), tb = authorTokens(b ?? "");
  if (!ta.length || !tb.length) return "unknown";
  if (ta.join(" ") === tb.join(" ")) return "same";
  const lastA = ta[ta.length - 1], lastB = tb[tb.length - 1];
  const lastAlike = lastA === lastB || (Math.min(lastA.length, lastB.length) >= 6 && levenshtein(lastA, lastB) <= 1);
  if (!lastAlike) {
    // "Yuval Noah Harari" vs "Harari, Yuval" style inversions
    const setB = new Set(tb);
    const shared = ta.filter((t) => t.length > 1 && setB.has(t)).length;
    return shared >= 2 ? "same" : "different";
  }
  // surnames agree - first names must not contradict ("Sam" vs "Samuel" ok,
  // "Sam" vs "Henri" not), and a bare surname agrees with anyone
  if (ta.length === 1 || tb.length === 1) return "same";
  const fa = ta[0], fb = tb[0];
  return fa[0] === fb[0] ? "same" : "different";
}

/** Quick overall verdict for two (title, author) pairs. */
export function compareBooks(
  a: { title: string; author?: string | null },
  b: { title: string; author?: string | null },
): TitleMatch {
  if (compareAuthors(a.author, b.author) === "different") return "different";
  return compareTitles(a.title, b.title);
}
