import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin";
import { createAdmin } from "@/lib/supabase/admin";
import { ReprocessService } from "@/lib/services/reprocess";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Admin panel "Sort them now": run the backlog right after fixing an outage. */
export async function POST() {
  const adminUser = await requireAdminApi();
  if (!adminUser) return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  const result = await ReprocessService.run(createAdmin(), { limit: 40, budgetMs: 50_000 });
  await logAdminAction(adminUser.id, null, "reprocess_unsorted_notes", { ...result });
  return NextResponse.json(result);
}
