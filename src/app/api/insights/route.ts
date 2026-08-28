import { NextRequest, NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { insightActionSchema } from "@/lib/validation";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();
  const { data } = await sb
    .from("insights")
    .select("*")
    .in("status", ["new", "goal_created"])
    .order("created_at", { ascending: false })
    .limit(50);
  return NextResponse.json({ insights: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, action } = insightActionSchema.parse(await req.json());
  const sb = await createClient();
  const status = action === "dismiss" ? "dismissed" : action;
  const { error } = await sb.from("insights").update({ status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
