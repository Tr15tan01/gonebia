import { getUser, createClient } from "@/lib/supabase/server";
import { BooksClient } from "@/components/books";

export const dynamic = "force-dynamic";

export default async function BooksPage() {
  const user = await getUser();
  const sb = await createClient();
  const { data: books } = await sb
    .from("books")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(200);

  // every memory linked to any of these books - thoughts, quotes, and the
  // original status-update notes alike - so each book can show its notes.
  const bookIds = (books ?? []).map((b: any) => b.id);
  let notesByBook: Record<string, { id: string; title: string; text: string; created_at: string }[]> = {};
  if (bookIds.length) {
    const { data: notes } = await sb
      .from("memory_metadata")
      .select("book_id, title, created_at, memories!inner(id, original_text)")
      .in("book_id", bookIds)
      .order("created_at", { ascending: false });
    for (const n of (notes ?? []) as any[]) {
      const list = notesByBook[n.book_id] ?? (notesByBook[n.book_id] = []);
      const mem = Array.isArray(n.memories) ? n.memories[0] : n.memories;
      if (!mem) continue;
      list.push({ id: mem.id, title: n.title, text: mem.original_text, created_at: n.created_at });
    }
  }
  const booksWithNotes = (books ?? []).map((b: any) => ({ ...b, notes_list: notesByBook[b.id] ?? [] }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl">Books</h1>
        <p className="text-sm text-ink-2 mt-1">
          Built automatically from what you tell TimelyMemo - "I finished reading …",
          "I'm reading …", "Giorgi recommended …". No forms needed.
        </p>
      </header>
      <BooksClient initial={booksWithNotes} />
    </div>
  );
}
