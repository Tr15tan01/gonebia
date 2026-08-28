import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";
import { isAuthorized } from "@/lib/cron-auth";
import { ReminderService, resurfaceSnoozed } from "@/lib/services/reminders";
import { InsightService } from "@/lib/services/insights";

export const dynamic = "force-dynamic";
// Hobby plan caps serverless duration at 60s - fine for personal/small scale.
// If your user count grows large, split insights into their own scheduled job.
export const maxDuration = 60;

/** Single daily sweep (Vercel Hobby allows one invocation per day per cron):
 *  1. fire due reminders  2. resurface snoozed notifications  3. run insights for all users. */
async function handle(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const fired = await ReminderService.processDue();
  const resurfaced = await resurfaceSnoozed();

  const admin = createAdmin();
  const { data: users } = await admin.from("profiles").select("id").limit(500);
  let created = 0, processed = 0;
  for (const u of users ?? []) {
    try {
      const r = await InsightService.runForUser(u.id);
      created += r.created;
      processed++;
    } catch (e) {
      console.error("[cron/daily] insights for", u.id, e);
    }
  }
  return NextResponse.json({ ...fired, resurfaced, processed, created });
}
export const GET = handle;
export const POST = handle;
