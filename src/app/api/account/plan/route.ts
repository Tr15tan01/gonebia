import { NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/limits";

export const dynamic = "force-dynamic";

/** Tiny, fast endpoint: just the current plan. Polled by PaddleBridge right
 *  after a checkout closes, since the Paddle webhook that actually flips
 *  `subscriptions.plan` can land a second or two after the overlay closes. */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();
  const plan = await getPlan(sb, user.id);
  return NextResponse.json({ plan });
}
