import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/cron-auth";
import { createAdmin } from "@/lib/supabase/admin";
import { WatchService, type WatchRow } from "@/lib/services/watch";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUDGET_MS = 270_000;
const CONCURRENCY = 4;

/** Daily sweep of active watches, oldest-checked first. Runs within a time
 *  budget; anything not reached is simply first in line tomorrow. */
async function handle(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const started = Date.now();
  const admin = createAdmin();
  const cutoff = new Date(Date.now() - 20 * 3_600_000).toISOString();
  const { data: due, error } = await admin.from("watches").select("*")
    .eq("status", "active")
    .or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(120);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const queue = [...(due ?? [])] as WatchRow[];
  let checked = 0, changed = 0, failed = 0;
  async function worker() {
    while (queue.length && Date.now() - started < BUDGET_MS) {
      const w = queue.shift()!;
      const r = await WatchService.check(admin, w);
      checked++;
      if (r.error) failed++;
      if (r.events.some((e) => e.kind !== "baseline")) changed++;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return NextResponse.json({ due: due?.length ?? 0, checked, changed, failed, remaining: queue.length });
}
export const GET = handle;
export const POST = handle;
