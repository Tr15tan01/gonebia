import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { getPostHogClient } from "@/lib/posthog-server";

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
    // profiles' primary key column is "id", not "user_id" like every other
    // table here - filtering it by "user_id" (a column that doesn't exist on
    // that table) would make PostgREST reject the request outright, meaning
    // account deletion likely errored out on this exact table previously.
    const col = t === "profiles" ? "id" : "user_id";
    try {
      const { count, error } = await admin
        .from(t)
        .delete({ count: "exact" })
        .eq(col, user.id);
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

  // remove the identity row itself (public.users, not Supabase's auth.users -
  // this app no longer uses Supabase Auth). FK cascade would eventually clean
  // up anything missed above too, since every table now references
  // public.users(id) on delete cascade.
  const { error: authErr } = await admin.from("users").delete().eq("id", user.id);
  if (authErr) {
    console.error("[account-delete] user row deletion failed:", authErr);
    return NextResponse.json({ error: authErr.message }, { status: 500 });
  }

  // Capture churn event before the auth user is gone so distinctId is still valid
  const ph = getPostHogClient();
  if (ph) {
    ph.capture({
      distinctId: user.id,
      event: "account_deleted",
      properties: { total_rows_deleted: total },
    });
    await ph.flush();
  }

  console.log(`[account-delete] user ${user.id}: ${total} rows across ${TABLES.length} tables, account removed.`);
  return NextResponse.json({ ok: true, total, deleted });
}
