import { NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Open tasks due within 15 minutes (or past-due within the last 24h),
 *  for the urgent popup. RLS-scoped. */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();
  const { data } = await sb
    .from("memories")
    .select("id, original_text, memory_metadata(title, type, status, due_at, reminder_at)")
    .is("deleted_at", null)
    .eq("memory_metadata.status", "open")
    .in("memory_metadata.type", ["task", "promise", "commitment"])
    .order("created_at", { ascending: false })
    .limit(50);

  const now = Date.now();
  const items = (data ?? [])
    .map((m: any) => {
      const raw: unknown = m.memory_metadata;
      const meta = (Array.isArray(raw) ? raw[0] : raw) ?? {};
      const due = meta.due_at ? +new Date(meta.due_at) : null;
      const rem = meta.reminder_at ? +new Date(meta.reminder_at) : null;
      const when = due !== null && rem !== null ? Math.min(due, rem) : (due ?? rem);
      return { id: m.id, text: m.original_text, title: meta.title ?? "", when };
    })
    .filter((i: any) =>
      i.when !== null && i.when <= now + 15 * 60_000 && i.when >= now - 24 * 3600_000)
    .sort((a: any, b: any) => a.when - b.when)
    .slice(0, 3);

  return NextResponse.json({ items });
}
