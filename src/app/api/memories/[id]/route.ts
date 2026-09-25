import { NextRequest, NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { getPlan, LIMITS, activeReminderCount } from "@/lib/limits";
import { correctionSchema } from "@/lib/validation";
import { ReminderService } from "@/lib/services/reminders";
import { BookService } from "@/lib/services/books";
import type { BookStatus } from "@/lib/types";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const sb = await createClient();
  const { data } = await sb
    .from("memories")
    .select("id, original_text, created_at, memory_metadata(type, title, summary, importance, status, due_at, reminder_at, occurred_at, people, category, book_id)")
    .eq("id", id)
    .single();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  const rawMeta: unknown = data.memory_metadata;
  const meta = (Array.isArray(rawMeta) ? rawMeta[0] : rawMeta) as {
    type?: string; title?: string; summary?: string; importance?: number;
    status?: string; due_at?: string | null; reminder_at?: string | null; occurred_at?: string | null; people?: string[]; category?: string;
    book_id?: string | null;
  } | null | undefined;
  const { data: book } = meta?.book_id
    ? await sb.from("books").select("id, title, author").eq("id", meta.book_id).maybeSingle()
    : { data: null };
  return NextResponse.json({
    memory: {
      id: data.id, original_text: data.original_text, created_at: data.created_at,
      type: meta?.type ?? "thought", title: meta?.title ?? "",
      summary: meta?.summary ?? "", importance: meta?.importance ?? 3,
      status: meta?.status ?? "open", due_at: meta?.due_at ?? null,
      reminder_at: meta?.reminder_at ?? null, occurred_at: meta?.occurred_at ?? null,
      people: meta?.people ?? [],
      book: book ? { id: book.id, title: book.title, author: book.author ?? null } : null,
    },
  });
}

/** Best-effort shelf status from the user's own wording (no invention). */
function deriveBookStatus(text: string): BookStatus {
  if (/finish|complete|just read|done (with|reading)/i.test(text)) return "finished";
  if (/currently reading|reading now|started reading|am reading|i'm reading|\bread\b/i.test(text)) return "reading";
  if (/want to read|should read|plan to read|recommend/i.test(text)) return "want_to_read";
  if (/gave up|abandon|couldn'?t finish|dnf/i.test(text)) return "abandoned";
  return "want_to_read";
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const patch = correctionSchema.parse(await req.json());
  const sb = await createClient();
  const admin = createAdmin();

  const metaPatch: Record<string, unknown> = { corrected: true };
  if (patch.title !== undefined) metaPatch.title = patch.title;
  if (patch.type !== undefined) metaPatch.type = patch.type;
  if (patch.status !== undefined) metaPatch.status = patch.status;
  if (patch.occurred_at !== undefined) metaPatch.occurred_at = patch.occurred_at;
  if (patch.due_at !== undefined) metaPatch.due_at = patch.due_at;
  if (patch.reminder_at !== undefined) metaPatch.reminder_at = patch.reminder_at;
  if (patch.review_at !== undefined) metaPatch.review_at = patch.review_at;
  if (patch.importance !== undefined) metaPatch.importance = patch.importance;

  const { error } = await sb.from("memory_metadata").update(metaPatch).eq("memory_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (patch.original_text) {
    const { error: textErr } = await sb.from("memories").update({ original_text: patch.original_text }).eq("id", id);
    if (textErr) return NextResponse.json({ error: textErr.message }, { status: 400 });
  }

  if (patch.occurred_at !== undefined) {
    // memory_metadata.occurred_at (patched above) is what chat/retrieval
    // actually reads, but a few memory types ALSO get a denormalized copy of
    // this date in their own side table (events.event_at,
    // purchases.purchased_at, decisions.decided_at) for their dedicated list
    // views - keep those in sync too instead of only fixing the one place.
    await Promise.all([
      admin.from("events").update({ event_at: patch.occurred_at }).eq("memory_id", id),
      admin.from("purchases").update({ purchased_at: patch.occurred_at }).eq("memory_id", id),
      admin.from("decisions").update({ decided_at: patch.occurred_at }).eq("memory_id", id),
    ]);
  }

  if (patch.type === "task" || patch.type === "promise" || patch.type === "commitment") {
    await sb.from("tasks").upsert({ memory_id: id, user_id: user.id, due_at: patch.due_at ?? null });
  }
  if (patch.type === "book") {
    // create/advance the shelf entry from the user's own words
    const [{ data: mem }, { data: meta }] = await Promise.all([
      sb.from("memories").select("original_text").eq("id", id).single(),
      sb.from("memory_metadata").select("title").eq("memory_id", id).single(),
    ]);
    if (mem?.original_text) {
      const rawTitle = patch.title ?? meta?.title ?? mem.original_text.slice(0, 60);
      const link = await BookService.upsertFromCapture(admin, user.id, id, {
        title: rawTitle,
        author: null,
        status: deriveBookStatus(mem.original_text),
        rating: null,
        recommended_by: null,
      }, mem.original_text);
      if (link) {
        await admin.from("memory_metadata").update({ book_id: link.id }).eq("memory_id", id).eq("user_id", user.id);
        if (link.created) {
          const { BookEnrichmentService } = await import("@/lib/services/book-enrich");
          await BookEnrichmentService.enrich(admin, user.id, link.id);
        }
      }
    }
  }
  if (patch.status === "done") {
    await sb.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("memory_id", id);
    await sb.from("insights").update({ status: "done" }).eq("data->>memory_id", id).eq("kind", "forgotten");
  }
  let safetyWarning: string | undefined;
  if (patch.reminder_at) {
    const plan = await getPlan(sb, user.id);
    if ((await activeReminderCount(admin, user.id)) >= LIMITS[plan].activeReminders) {
      return NextResponse.json({ error: `Reminder limit reached (${LIMITS[plan].activeReminders} on the ${LIMITS[plan].label} plan).`, code: "limit", upgrade: plan === "free" }, { status: 402 });
    }
    await ReminderService.cancelForMemory(id);
    const scheduled = await ReminderService.schedule(user.id, id, patch.reminder_at);
    if (!scheduled.ok) safetyWarning = scheduled.safetyWarning;
  } else if (patch.reminder_at === null) {
    await ReminderService.cancelForMemory(id);
  }
  // the dashboard reads a cached daily briefing - drop it so Today/
  // Don't forget reflect this change immediately on refresh
  await sb.from("daily_briefings").delete().eq("user_id", user.id);
  return NextResponse.json({ ok: true, safetyWarning });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const sb = await createClient();
  const { error } = await sb.from("memories").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Deleting the note that put a book on the shelf takes that book off
  // again - but only when no other live note is attached to it. Otherwise a
  // wrong entry survives the delete and the next capture links to it again.
  let removedBook: string | null = null;
  try {
    const { data: meta } = await sb.from("memory_metadata").select("book_id").eq("memory_id", id).maybeSingle();
    if (meta?.book_id) {
      const { data: book } = await sb.from("books").select("id, title, memory_id").eq("id", meta.book_id).maybeSingle();
      if (book && book.memory_id === id) {
        const { count } = await sb.from("memory_metadata")
          .select("memory_id, memories!inner(deleted_at)", { count: "exact", head: true })
          .eq("book_id", book.id).neq("memory_id", id).is("memories.deleted_at", null);
        if (!count) {
          await sb.from("memory_metadata").update({ book_id: null }).eq("book_id", book.id);
          await sb.from("books").delete().eq("id", book.id);
          removedBook = book.title;
        }
      }
    }
  } catch (e) {
    console.error("[memories] book cleanup after delete failed:", e);
  }

  // the dashboard reads a cached daily briefing - drop it so Today/
  // Don't forget reflect this change immediately on refresh
  await sb.from("daily_briefings").delete().eq("user_id", user.id);
  return NextResponse.json({ ok: true, removedBook });
}
