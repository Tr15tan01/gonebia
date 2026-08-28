import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";

/** Full data export - only the caller's own rows, via service role scoped to their user_id. */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdmin();
  const tables = [
    "memories", "memory_metadata", "memory_embeddings", "people", "memory_people",
    "tasks", "events", "purchases", "decisions", "goals", "books",
    "insights", "reminders", "notifications",
  ];
  const dump: Record<string, unknown[]> = {};
  for (const t of tables) {
    const { data } = await admin.from(t).select("*").eq("user_id", user.id).limit(10000);
    dump[t] = data ?? [];
  }
  return new NextResponse(
    JSON.stringify({ exported_at: new Date().toISOString(), data: dump }, null, 2),
    {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="gonebia-export.json"',
      },
    }
  );
}

/** Hard account deletion - FK cascades remove every row the user owns. */
export async function DELETE() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdmin();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
