import { NextRequest, NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();
  const [{ data: unread }, { count: unreadCount }, { data: recent }] = await Promise.all([
    sb.from("notifications").select("*").eq("status", "unread")
      .order("created_at", { ascending: false }).limit(20),
    sb.from("notifications").select("id", { count: "exact", head: true }).eq("status", "unread"),
    sb.from("notifications").select("*").in("status", ["read", "done"])
      .order("created_at", { ascending: false }).limit(10),
  ]);
  return NextResponse.json({ notifications: unread ?? [], read: recent ?? [], unreadCount: unreadCount ?? 0 });
}

export async function PATCH(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();

  // mark ALL as read
  if (body.action === "read_all") {
    const sb = await createClient();
    await sb.from("notifications").update({ status: "read" }).eq("user_id", user.id).eq("status", "unread");
    return NextResponse.json({ ok: true });
  }

  const { id, action } = body;
  if (!id || !["done", "snooze", "dismiss", "not_relevant", "read"].includes(action)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const sb = await createClient();

  if (action === "snooze") {
    const { data: n } = await sb.from("notifications").select("id, data").eq("id", id).single();
    if (!n) return NextResponse.json({ ok: true });
    const data = { ...(n.data ?? {}), snooze_until: new Date(Date.now() + 86_400_000).toISOString() };
    await sb.from("notifications").update({ status: "snoozed", data }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  const status = action === "read" ? "read" : action;
  const { error } = await sb.from("notifications").update({ status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
