import { NextRequest, NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { notificationActionSchema } from "@/lib/validation";

const DAY = 86_400_000;

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();
  const { data } = await sb
    .from("notifications")
    .select("*")
    .eq("status", "unread")
    .order("created_at", { ascending: false })
    .limit(20);
  return NextResponse.json({ notifications: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, action } = notificationActionSchema.parse(await req.json());
  const sb = await createClient();

  if (action === "snooze") {
    // mark snoozed and stamp a re-surface time; the reminders cron flips it
    // back to unread (and pushes) once snooze_until has passed.
    const { data: n } = await sb.from("notifications").select("id, data").eq("id", id).single();
    if (!n) return NextResponse.json({ ok: true });
    const data = { ...(n.data ?? {}), snooze_until: new Date(Date.now() + DAY).toISOString() };
    const { error } = await sb.from("notifications").update({ status: "snoozed", data }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await sb.from("notifications").update({ status: action }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
