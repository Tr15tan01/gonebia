import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";
import { geminiJSON } from "@/lib/ai/gemini";
import { weeklyPrompt } from "@/lib/ai/prompts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("x-cron-secret") !== secret
    && req.nextUrl.searchParams.get("secret") !== secret)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const admin = createAdmin();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: users } = await admin.from("profiles").select("id").limit(500);
  let processed = 0;

  for (const u of users ?? []) {
    try {
      const weekStart = new Date(Date.now() - ((new Date().getDay() + 6) % 7) * 86_400_000)
        .toISOString().slice(0, 10);

      const [{ count: captured }, { count: done }, { count: openTasks }, { data: topTypes }] =
        await Promise.all([
          admin.from("memories").select("id", { count: "exact", head: true })
            .eq("user_id", u.id).gte("created_at", since),
          admin.from("tasks").select("id", { count: "exact", head: true })
            .eq("user_id", u.id).eq("status", "done").gte("completed_at", since),
          admin.from("tasks").select("id", { count: "exact", head: true })
            .eq("user_id", u.id).eq("status", "open"),
          admin.from("memory_metadata").select("category")
            .eq("user_id", u.id).gte("created_at", since).limit(200),
        ]);

      const catCounts: Record<string, number> = {};
      for (const t of topTypes ?? []) {
        if (t.category) catCounts[t.category] = (catCounts[t.category] ?? 0) + 1;
      }
      const topCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 4)
        .map(([c, n]) => `${c} (${n})`);

      const analysis = await geminiJSON(weeklyPrompt(
        `Captured this week: ${captured ?? 0}. Tasks completed: ${done ?? 0}. ` +
        `Open tasks: ${openTasks ?? 0}. Top categories: ${topCats.join(", ") || "none"}.`
      ));

      await admin.from("weekly_analyses").upsert(
        { user_id: u.id, week_start: weekStart, content: analysis },
        { onConflict: "user_id,week_start" }
      );
      processed++;
    } catch (e) {
      console.error("[cron/weekly]", u.id, e);
    }
  }
  return NextResponse.json({ ok: true, processed });
}
export const GET = handle;
export const POST = handle;
