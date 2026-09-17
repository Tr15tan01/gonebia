import { NextRequest, NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { isAiPaused, aiPausedResponse } from "@/lib/limits";
import { WatchService, MANUAL_CHECK_COOLDOWN_MS, type WatchRow } from "@/lib/services/watch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** "Check now" - rate limited per watch so it can't be used as a scraper. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const sb = await createClient();
  const admin = createAdmin();
  if (await isAiPaused(admin, user.id)) return aiPausedResponse();
  const { data: w } = await sb.from("watches").select("*").eq("id", id).maybeSingle();
  if (!w) return NextResponse.json({ error: "not found" }, { status: 404 });
  const since = w.last_checked_at ? Date.now() - new Date(w.last_checked_at).getTime() : Infinity;
  if (since < MANUAL_CHECK_COOLDOWN_MS) {
    const mins = Math.ceil((MANUAL_CHECK_COOLDOWN_MS - since) / 60_000);
    return NextResponse.json({ error: `Checked moments ago - try again in ${mins} min.` }, { status: 429 });
  }
  const outcome = await WatchService.check(admin, w as WatchRow);
  return NextResponse.json({ events: outcome.events, error: outcome.error ?? null });
}
