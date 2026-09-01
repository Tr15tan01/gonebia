import { NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { goalSchema } from "@/lib/validation";
import { getPostHogClient } from "@/lib/posthog-server";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { title, from_memory_id } = goalSchema.parse(await req.json());
  const sb = await createClient();
  const { data, error } = await sb
    .from("goals")
    .insert({ user_id: user.id, title, from_memory_id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const ph = getPostHogClient();
  if (ph) {
    ph.capture({
      distinctId: user.id,
      event: "goal_created",
      properties: { from_memory: !!from_memory_id },
    });
    await ph.flush();
  }
  return NextResponse.json({ goal: data });
}
