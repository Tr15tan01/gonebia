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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl">Books</h1>
        <p className="text-sm text-ink-2 mt-1">
          Built automatically from what you tell Gonebia - "I finished reading …",
          "I'm reading …", "Giorgi recommended …". No forms needed.
        </p>
      </header>
      <BooksClient initial={books ?? []} />
    </div>
  );
}
