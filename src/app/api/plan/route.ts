import { NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { getPlan, getUsage, LIMITS } from "@/lib/limits";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();
  const plan = await getPlan(sb, user.id);
  const usage = await getUsage(sb, user.id);
  return NextResponse.json({ plan, limits: LIMITS[plan], usage });
}
