import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser, createClient } from "@/lib/supabase/server";

const renameSchema = z.object({ name: z.string().trim().min(1).max(120) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { name } = renameSchema.parse(await req.json());
  const sb = await createClient();
  const normalized = name.toLowerCase().trim();

  const { error } = await sb.from("people").update({ name, normalized }).eq("id", id);
  if (error) {
    // unique (user_id, normalized) - renaming onto an existing person's name
    // isn't a rename, it's a merge; point the user at the right feature instead
    // of a raw constraint error.
    if (error.code === "23505") {
      return NextResponse.json({
        error: "You already have someone with that name - use \u201cMerge\u201d instead to combine them.",
        code: "duplicate",
      }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const sb = await createClient();
  // memory_people rows cascade automatically (FK on delete cascade) - the
  // underlying memories/thoughts are untouched, they just lose this tag.
  const { error } = await sb.from("people").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
