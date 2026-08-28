import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/cron-auth";
import { ReminderService, resurfaceSnoozed } from "@/lib/services/reminders";

export const dynamic = "force-dynamic";

/** Kept for external schedulers (e.g. cron-job.org every 5 min) and manual runs.
 *  Vercel Hobby users: point your external scheduler here with ?secret=YOUR_CRON_SECRET. */
async function handle(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const fired = await ReminderService.processDue();
  const resurfaced = await resurfaceSnoozed();
  return NextResponse.json({ ...fired, resurfaced });
}
export const GET = handle;
export const POST = handle;
