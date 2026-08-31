import { NextRequest, NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { getPlan, LIMITS } from "@/lib/limits";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();
  const { data } = await sb.from("price_watches").select("*")
    .order("created_at", { ascending: false }).limit(20);
  return NextResponse.json({ watches: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();
  const body = await req.json().catch(() => ({}));
  const query = String(body.query ?? "").trim().slice(0, 300);
  const target = body.target_price ? Number(body.target_price) : null;
  if (!query) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const plan = await getPlan(sb, user.id);
  const lim = LIMITS[plan];
  if ((lim.priceWatches as number) === 0) {
    return NextResponse.json({
      error: "Price tracking is disabled for this plan.",
      code: "limit", feature: "watch", upgrade: true,
    }, { status: 402 });
  }
  const { count } = await sb.from("price_watches")
    .select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "active");
  if ((count ?? 0) >= lim.priceWatches) {
    return NextResponse.json({ error: `You're already tracking ${lim.priceWatches} products on the ${plan === "free" ? "Free" : "Pro"} plan - stop one to add another.` }, { status: 402 });
  }
  const { data, error } = await sb.from("price_watches")
    .insert({ user_id: user.id, query, target_price: target }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ watch: data });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const sb = await createClient();
  await sb.from("price_watches").update({ status: "stopped" }).eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
