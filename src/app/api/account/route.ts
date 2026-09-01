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
        "Content-Disposition": 'attachment; filename="timelymemo-export.json"',
      },
    }
  );
}

/** Hard account deletion. We do NOT rely on FK cascades alone: every table is
 *  explicitly wiped by user_id (counted), then the auth user is removed -
 *  cascading anything that could remain. The response reports what was deleted. */
export async function DELETE() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdmin();

  // children of memories first, then memories, then profile-level & account-state rows.
  // NOTE: every table below also has "on delete cascade" to auth.users, so
  // deleteUser() at the end would clean these up on its own - but we still wipe
  // them explicitly (and count them) rather than trust that alone, in case a
  // future migration ever loosens a constraint.
  const TABLES = [
    "memory_embeddings", "memory_metadata", "memory_people", "memory_relationships",
    "tasks", "events", "purchases", "decisions", "goals", "books",
    "reminders", "notifications", "insights", "daily_briefings", "weekly_analyses",
    "push_subscriptions", "people", "memories", "user_preferences", "profiles",
    // account-state / billing / integration tables - previously left behind:
    "price_watches", "agent_runs", "discover_results", "usage_counters",
    "google_integrations", "subscriptions",
  ];

  const deleted: Record<string, number> = {};
  let total = 0;
  for (const t of TABLES) {
    try {
      const { count, error } = await admin
        .from(t)
        .delete({ count: "exact" })
        .eq("user_id", user.id);
      if (error) {
        console.error("[account-delete] failed on", t, error);
        return NextResponse.json({ error: `deletion failed at ${t}` }, { status: 500 });
      }
      deleted[t] = count ?? 0;
      total += count ?? 0;
    } catch (e) {
      console.error("[account-delete] exception on", t, e);
      return NextResponse.json({ error: `deletion failed at ${t}` }, { status: 500 });
    }
  }

  // remove the auth user itself - cascades anything not covered above
  const { error: authErr } = await admin.auth.admin.deleteUser(user.id);
  if (authErr) {
    console.error("[account-delete] auth user deletion failed:", authErr);
    return NextResponse.json({ error: authErr.message }, { status: 500 });
  }

  console.log(`[account-delete] user ${user.id}: ${total} rows across ${TABLES.length} tables, account removed.`);
  return NextResponse.json({ ok: true, total, deleted });
}
