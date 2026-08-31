import { NextRequest, NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { BookEnrichmentService } from "@/lib/services/book-enrich";

export const maxDuration = 30;

/** Re-run the online lookup for one of the user's books (RLS-scoped). */
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const sb = await createClient();
  const { data: book } = await sb.from("books").select("id, title, author").eq("id", id).single();
  if (!book) return NextResponse.json({ error: "not found" }, { status: 404 });

  const info = await BookEnrichmentService.lookup(book.title, book.author);
  if (!info) {
    const { data } = await sb.from("books").update({ enrich_status: "not_found" }).eq("id", id).select().single();
    return NextResponse.json({ ok: false, book: data });
  }
  const { data } = await sb.from("books").update({
    topic: info.topic, pub_year: info.pub_year, description: info.description,
    cover_url: info.cover_url, isbn: info.isbn, enrich_status: "enriched",
    updated_at: new Date().toISOString(),
  }).eq("id", id).select().single();
  return NextResponse.json({ ok: true, book: data });
}
