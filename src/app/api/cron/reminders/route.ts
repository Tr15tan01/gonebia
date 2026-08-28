import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";
import { ReminderService } from "@/lib/services/reminders";
import { PushService } from "@/lib/services/push";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("x-cron-secret") === secret
    || req.nextUrl.searchParams.get("secret") === secret;
}

/** Re-activate snoozed notifications whose snooze_until has passed. */
async function resurfaceSnoozed(admin: ReturnType<typeof createAdmin>) {
  const { data: snoozed } = await admin
    .from("notifications")
    .select("id, user_id, kind, title, body, data")
    .eq("status", "snoozed")
    .limit(100);
  const now = Date.now();
  const pushCache = new Map<string, boolean>();
  let resurfaced = 0;
  for (const n of snoozed ?? []) {
    const until = n.data?.snooze_until ? Date.parse(n.data.snooze_until) : 0;
    if (!until || until > now) continue;
    const data = { ...n.data };
    delete data.snooze_until;
    await admin.from("notifications").update({ status: "unread", data }).eq("id", n.id);
    if (!pushCache.has(n.user_id)) {
      const { data: p } = await admin
        .from("user_preferences").select("push_enabled").eq("user_id", n.user_id).single();
      pushCache.set(n.user_id, !!p?.push_enabled);
    }
    if (pushCache.get(n.user_id)) {
      await PushService.pushToUser(n.user_id, {
        title: `Gonebia - ${n.title}`, body: n.body, url: n.data?.url ?? "/dashboard",
      });
    }
    resurfaced++;
  }
  return resurfaced;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const fired = await ReminderService.processDue();
  const resurfaced = await resurfaceSnoozed(createAdmin());
  return NextResponse.json({ ...fired, resurfaced });
}
export const GET = handle;
export const POST = handle;
