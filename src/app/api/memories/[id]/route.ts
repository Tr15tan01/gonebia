import { NextRequest, NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { correctionSchema } from "@/lib/validation";
import { ReminderService } from "@/lib/services/reminders";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const sb = await createClient();
  const { data } = await sb
    .from("memories")
    .select("id, original_text, created_at, memory_metadata(type, title, summary, importance, status, due_at, people, category)")
    .eq("id", id)
    .single();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  // supabase-js (without generated DB types) types embeds as arrays, but the API
  // actually returns a single object here - normalize so TS and runtime agree.
  const rawMeta: unknown = data.memory_metadata;
  const meta = (Array.isArray(rawMeta) ? rawMeta[0] : rawMeta) as {
    type?: string; title?: string; summary?: string; importance?: number;
    status?: string; due_at?: string | null; people?: string[]; category?: string;
  } | null | undefined;
  return NextResponse.json({
    memory: {
      id: data.id, original_text: data.original_text, created_at: data.created_at,
      type: meta?.type ?? "thought", title: meta?.title ?? "",
      summary: meta?.summary ?? "", importance: meta?.importance ?? 3,
      status: meta?.status ?? "open", due_at: meta?.due_at ?? null,
      people: meta?.people ?? [],
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const patch = correctionSchema.parse(await req.json());
  const sb = await createClient();

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

  if (patch.type === "task" || patch.type === "promise" || patch.type === "commitment") {
    await sb.from("tasks").upsert({ memory_id: id, user_id: user.id, due_at: patch.due_at ?? null });
  }
  if (patch.status === "done") {
    await sb.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("memory_id", id);
    // resolving a memory also resolves any "forgotten" insight pointing at it
    await sb.from("insights").update({ status: "done" }).eq("data->>memory_id", id).eq("kind", "forgotten");
  }
  if (patch.reminder_at) {
    await ReminderService.cancelForMemory(id);
    await ReminderService.schedule(user.id, id, patch.reminder_at);
  } else if (patch.reminder_at === null) {
    await ReminderService.cancelForMemory(id);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const sb = await createClient();
  const { error } = await sb.from("memories").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
