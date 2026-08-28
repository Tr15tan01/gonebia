import { NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sub = await req.json();
  if (!sub?.endpoint || !sub?.keys) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }
  const sb = await createClient();
  const { error } = await sb.from("push_subscriptions").upsert(
    { user_id: user.id, endpoint: sub.endpoint, keys: sub.keys },
    { onConflict: "endpoint" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await sb.from("user_preferences").update({ push_enabled: true }).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();
  await sb.from("push_subscriptions").delete().eq("user_id", user.id);
  await sb.from("user_preferences").update({ push_enabled: false }).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
