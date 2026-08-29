import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { MemoryExtractionService } from "@/lib/services/extraction";
import { ApplyService } from "@/lib/services/apply";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** One-time repair: memories captured while extraction/metadata writes were
 *  broken have NO memory_metadata row (they show as "thought", never appear in
 *  tasks/search/insights). This re-runs extraction for up to 30 of them per
 *  visit and stores the structure. Visit /api/debug/repair while logged in,
 *  repeatedly, until it reports found: 0. */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized - log in first" }, { status: 401 });
  const admin = createAdmin();

  const { data: profile } = await admin.from("profiles").select("timezone").eq("id", user.id).single();
  const tz = profile?.timezone ?? "UTC";

  const { data: mems } = await admin
    .from("memories")
    .select("id, original_text, created_at, memory_metadata(memory_id)")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  const missing = (mems ?? []).filter((m: any) => !m.memory_metadata);
  let repaired = 0, failed = 0;

  for (const m of missing.slice(0, 30)) {
    const structured = await MemoryExtractionService.extract(
      m.original_text, new Date(m.created_at), tz
    );
    if (!structured) { failed++; continue; }
    const applied = await ApplyService.structured(
      admin, user.id, m.id, structured, m.original_text, null, m.created_at
    );
    if (applied.ok) repaired++; else failed++;
  }

  return NextResponse.json({
    found_without_metadata: missing.length,
    repaired,
    failed,
    note: failed > 0 ? "Some extractions failed (Gemini hiccup?) - run again." : "Run again until found_without_metadata is 0.",
  });
}
