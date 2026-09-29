import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/cron-auth";
import { createAdmin } from "@/lib/supabase/admin";
import { ReprocessService } from "@/lib/services/reprocess";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Daily: sort notes that were saved while the AI was unavailable. */
async function handle(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const result = await ReprocessService.run(createAdmin(), { limit: 150, budgetMs: 270_000 });
  return NextResponse.json(result);
}
export const GET = handle;
export const POST = handle;
