import { NextRequest, NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { getPlan, getUsage, bumpUsage, LIMITS } from "@/lib/limits";
import { DiscoverService } from "@/lib/services/discover";

export const maxDuration = 60;

function isMissingTable(err: any): boolean {
  const msg = String(err?.message ?? err ?? "");
  return err?.code === "42P01" || msg.includes("does not exist") || msg.includes("Could not find the table");
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();
  const admin = createAdmin();
  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind ?? "");
  const windowDays = body.window ? Number(body.window) : null;
  const force = !!body.force;
  if (!["themes", "missing", "past_me", "radar", "myself", "conflicts"].includes(kind)) {
    return NextResponse.json({ error: "invalid kind" });
  }

  try {
    const plan = await getPlan(sb, user.id);
    const lim = LIMITS[plan];
    const windowKey = kind === "themes" ? String(windowDays ?? 90) : kind === "past_me" ? String(windowDays ?? 12) : "all";

    if (!force) {
      const { data: cached, error: cacheErr } = await admin
        .from("discover_results")
        .select("result, source_ids, created_at")
        .eq("user_id", user.id).eq("kind", kind).eq("time_window", windowKey)
        .maybeSingle();
      if (!cacheErr && cached && Date.now() - new Date(cached.created_at).getTime() < 20 * 3600_000) {
        let sources: any[] = [];
        if (cached.source_ids?.length) {
          const { data: rows } = await admin.from("memories").select("id, original_text, created_at").in("id", cached.source_ids);
          sources = (rows ?? []).map((r: any) => ({ id: r.id, text: r.original_text, date: r.created_at }));
        }
        return NextResponse.json({ result: cached.result, sources, cached: true });
      }
      if (cacheErr && isMissingTable(cacheErr)) {
        console.warn("[discover] discover_results table missing - run supabase/migrations/0005_upgrade.sql (continuing without cache)");
      }
    }

    const usage = await getUsage(sb, user.id);
    if (usage.discover >= lim.discoverPerMonth) {
      return NextResponse.json({
        error: `You've used all ${lim.discoverPerMonth} Discover analyses this month on the ${plan === "free" ? "Free" : "Pro"} plan.`,
        code: "limit", feature: "discover", upgrade: plan === "free",
      }, { status: 402 });
    }

    const out = await DiscoverService.run(user.id, kind, windowDays, plan);
    if ((out as any).error) return NextResponse.json({ error: (out as any).error });

    await bumpUsage(sb, user.id, "discover_month");

    const allIds = [...new Set(((out as any).items ?? []).map((i: any) => i.id))];
    let sources: any[] = [];
    if (allIds.length) {
      const { data: rows } = await admin.from("memories").select("id, original_text, created_at").in("id", allIds);
      sources = (rows ?? []).map((r: any) => ({ id: r.id, text: r.original_text, date: r.created_at }));
    }

    const { error: upsertErr } = await admin.from("discover_results").upsert({
      user_id: user.id, kind, time_window: windowKey,
      result: (out as any).result ?? {}, source_ids: sources.map((s) => s.id),
    }, { onConflict: "user_id,kind,time_window" });
    if (upsertErr) {
      if (isMissingTable(upsertErr)) console.warn("[discover] cache table missing - run migration 0005 (result still returned)");
      else console.error("[discover] cache write failed:", upsertErr);
    }

    return NextResponse.json({ result: (out as any).result, sources, cached: false });
  } catch (e) {
    console.error("[discover] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    const friendly = msg.includes("unparseable JSON") || msg.includes("Gemini")
      ? "The analysis couldn't complete this time - the AI service hiccuped. Please try again; it usually works on retry."
      : "Analysis failed - please try again. If it keeps happening, the exact reason is in the server logs (tag: [discover]).";
    return NextResponse.json({ error: friendly });
  }
}
