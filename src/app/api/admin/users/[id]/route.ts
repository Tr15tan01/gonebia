import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin";
import { createAdmin } from "@/lib/supabase/admin";

const ACTIONS = ["disable_account", "enable_account", "pause_ai", "resume_ai"] as const;

/** Every admin API route independently re-verifies admin status - a page
 *  having already checked (via the layout) does not authorize a fetch call
 *  to this endpoint; this is the actual enforcement point. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminUser = await requireAdminApi();
  if (!adminUser) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const { id: targetUserId } = await params;
  const { action } = await req.json().catch(() => ({}));
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: "invalid action" }, { status: 400 });

  // Never let an admin disable/pause their own only account into a lockout,
  // or act on another admin without at least seeing who they're touching -
  // simplest safe rule: no self-targeting for disable/pause.
  if (targetUserId === adminUser.id && (action === "disable_account" || action === "pause_ai")) {
    return NextResponse.json({ error: "You can't disable or pause your own account." }, { status: 400 });
  }

  const admin = createAdmin();
  const patch: Record<string, unknown> = {};
  if (action === "disable_account") patch.disabled_at = new Date().toISOString();
  if (action === "enable_account") patch.disabled_at = null;
  if (action === "pause_ai") patch.ai_paused_at = new Date().toISOString();
  if (action === "resume_ai") patch.ai_paused_at = null;

  const { error } = await admin.from("users").update(patch).eq("id", targetUserId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(adminUser.id, targetUserId, action);
  return NextResponse.json({ ok: true });
}
