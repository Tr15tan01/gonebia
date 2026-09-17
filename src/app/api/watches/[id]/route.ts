import { NextRequest, NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.status === "active" || body.status === "paused") patch.status = body.status;
  if (typeof body.label === "string") patch.label = body.label.trim().slice(0, 120);
  if (typeof body.instructions === "string") patch.instructions = body.instructions.trim().slice(0, 300) || null;
  if ("target_price" in body) {
    const t = body.target_price === null || body.target_price === "" ? null : Number(body.target_price);
    if (t !== null && (!Number.isFinite(t) || t <= 0)) return NextResponse.json({ error: "Invalid target price." }, { status: 400 });
    patch.target_price = t;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  const sb = await createClient();
  const { data, error } = await sb.from("watches").update(patch).eq("id", id).select("id, status, label, target_price, instructions").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ watch: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const sb = await createClient();
  await sb.from("watch_events").delete().eq("watch_id", id);
  const { error } = await sb.from("watches").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
