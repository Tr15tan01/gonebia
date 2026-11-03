import { NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";

/** POST - the user has looked at their watch list: every change so far is
 *  "seen" (the dashboard tile stops highlighting), and the matching bell
 *  notifications are marked read so they don't nag twice. */
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();
  const now = new Date().toISOString();
  const [{ error }] = await Promise.all([
    sb.from("watches").update({ seen_at: now }).not("last_changed_at", "is", null),
    sb.from("notifications").update({ status: "read" }).eq("kind", "watch").eq("status", "unread"),
  ]);
  // before migration 0027 the column doesn't exist - nothing to remember yet
  if (error && !/seen_at/.test(error.message ?? "")) console.error("[watches] mark seen failed:", error);
  return NextResponse.json({ ok: true });
}
