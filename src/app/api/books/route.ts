import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser, createClient } from "@/lib/supabase/server";

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["want_to_read", "reading", "finished", "abandoned"]).optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();
  const status = req.nextUrl.searchParams.get("status");
  let q = sb.from("books").select("*").order("updated_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ books: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, status, rating, notes } = patchSchema.parse(await req.json());
  const sb = await createClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status !== undefined) {
    patch.status = status;
    if (status === "reading" && status) patch.started_at = new Date().toISOString();
    if (status === "finished") patch.finished_at = new Date().toISOString();
  }
  if (rating !== undefined) patch.rating = rating;
  if (notes !== undefined) patch.notes = notes;
  const { error } = await sb.from("books").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
