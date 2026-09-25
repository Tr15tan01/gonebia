import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser, createClient } from "@/lib/supabase/server";
import { BookService } from "@/lib/services/books";

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["want_to_read", "reading", "finished", "abandoned"]).optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  author: z.string().trim().max(120).nullable().optional(),
  /** detach one note from this book ("this note isn't about that book") */
  unlink_memory: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();
  const status = req.nextUrl.searchParams.get("status");
  let q = sb.from("books").select("*").order("updated_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ books: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const sb = await createClient();
  // unlink any notes pointing at this book rather than deleting the notes themselves -
  // the thought/memory is still valid, it just isn't tied to a shelf entry anymore.
  await sb.from("memory_metadata").update({ book_id: null }).eq("book_id", id);
  const { error } = await sb.from("books").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { id, status, rating, notes, title, author, unlink_memory } = parsed.data;
  const sb = await createClient();

  if (unlink_memory) {
    const { error } = await sb.from("memory_metadata").update({ book_id: null })
      .eq("memory_id", unlink_memory).eq("book_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status !== undefined) {
    patch.status = status;
    if (status === "reading") patch.started_at = new Date().toISOString();
    if (status === "finished") patch.finished_at = new Date().toISOString();
  }
  if (rating !== undefined) patch.rating = rating;
  if (notes !== undefined) patch.notes = notes;

  // Correcting who the book is: the old cover/description may belong to a
  // different book, so they're cleared and the client re-runs the lookup.
  let identityChanged = false;
  if (title !== undefined || author !== undefined) {
    const { data: cur } = await sb.from("books").select("title, author").eq("id", id).maybeSingle();
    if (!cur) return NextResponse.json({ error: "not found" }, { status: 404 });
    const nextTitle = title ?? cur.title;
    const nextAuthor = author === undefined ? cur.author : (author || null);
    if (nextTitle !== cur.title || nextAuthor !== cur.author) {
      identityChanged = true;
      Object.assign(patch, {
        title: nextTitle, title_normalized: BookService.normalizeTitle(nextTitle), author: nextAuthor,
        cover_url: null, description: null, topic: null, pub_year: null, isbn: null, enrich_status: "none",
      });
    }
  }

  const { data, error } = await sb.from("books").update(patch).eq("id", id).select().maybeSingle();
  if (error) {
    const duplicate = error.code === "23505";
    return NextResponse.json({
      error: duplicate ? "That book (same title and author) is already on your shelf." : error.message,
    }, { status: duplicate ? 409 : 400 });
  }
  return NextResponse.json({ ok: true, book: data, identityChanged });
}
