import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";
import { InsightService } from "@/lib/services/insights";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("x-cron-secret") !== secret
    && req.nextUrl.searchParams.get("secret") !== secret)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const admin = createAdmin();
  const { data: users } = await admin.from("profiles").select("id").limit(500);
  let created = 0, processed = 0;
  for (const u of users ?? []) {
    try {
      const r = await InsightService.runForUser(u.id);
      created += r.created;
      processed++;
    } catch (e) {
      console.error("[cron/insights]", u.id, e);
    }
  }
  return NextResponse.json({ processed, created });
}
export const GET = handle;
export const POST = handle;
