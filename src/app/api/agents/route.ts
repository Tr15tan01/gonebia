import { NextRequest, NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { getPlan, getUsage, bumpUsage, LIMITS, isAiPaused, aiPausedResponse } from "@/lib/limits";
import { DEEP_RESEARCH_COST } from "@/lib/plans";
import { AgentService, AGENT_KINDS, type AgentKind } from "@/lib/services/agents";
import { createNotification } from "@/lib/notifications";
import { getPostHogClient } from "@/lib/posthog-server";

// Deep research fans out into several grounded calls. Vercel (Fluid compute)
// allows up to 300s on every plan; on older Hobby setups the platform caps
// this at 60s and deep research may time out - see README.
export const maxDuration = 300;

function isMissingTable(err: any): boolean {
  const msg = String(err?.message ?? err ?? "");
  return err?.code === "42P01" || msg.includes("does not exist") || msg.includes("Could not find the table");
}

/** GET /api/agents?kind=research|deep_research&limit=20&id=... */
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();
  const sp = req.nextUrl.searchParams;
  const id = sp.get("id");
  if (id) {
    const { data } = await sb.from("agent_runs")
      .select("id, kind, input, status, result, created_at, pinned, tags").eq("id", id).maybeSingle();
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ run: data });
  }
  const limit = Math.min(Number(sp.get("limit")) || 12, 50);
  let q = sb.from("agent_runs")
    .select("id, kind, input, status, result, created_at")
    .in("kind", AGENT_KINDS)
    .order("created_at", { ascending: false }).limit(limit);
  const kind = sp.get("kind");
  if (kind && (AGENT_KINDS as string[]).includes(kind)) q = q.eq("kind", kind);
  const { data: runs, error } = await q;
  if (error && isMissingTable(error)) {
    console.warn("[agents] agent_runs table missing - run supabase/migrations/0005_upgrade.sql");
  }
  return NextResponse.json({ runs: runs ?? [] });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const sb = await createClient();
  const { error } = await sb.from("agent_runs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();
  const admin = createAdmin();
  if (await isAiPaused(admin, user.id)) return aiPausedResponse();
  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind ?? "") as AgentKind;
  const input = String(body.input ?? "").trim().slice(0, 500);
  if (!AGENT_KINDS.includes(kind) || input.length < 3) {
    return NextResponse.json({ error: "Describe what to research in a few words." }, { status: 400 });
  }

  const plan = await getPlan(sb, user.id);
  const lim = LIMITS[plan];
  const cost = kind === "deep_research" ? DEEP_RESEARCH_COST : 1;
  const usage = await getUsage(sb, user.id);
  if (kind === "deep_research" && !lim.deepResearch) {
    return NextResponse.json({
      error: "Deep Research is included with Premium and Pro.",
      code: "limit", feature: "deep_research", upgrade: true,
    }, { status: 402 });
  }
  if (usage.agents + cost > lim.agentRunsPerMonth) {
    const left = Math.max(0, lim.agentRunsPerMonth - usage.agents);
    return NextResponse.json({
      error: kind === "deep_research"
        ? `Deep Research uses ${cost} agent runs and you have ${left} left this month on ${lim.label}.`
        : `You've used all ${lim.agentRunsPerMonth} agent runs this month on ${lim.label}.`,
      code: "limit", feature: "agents", upgrade: plan !== "pro",
    }, { status: 402 });
  }

  let outcome;
  try {
    outcome = kind === "deep_research"
      ? await AgentService.deepResearch(sb, user.id, input)
      : await AgentService.research(sb, user.id, input);
  } catch (e) {
    console.error("[agents] run failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({
      error: "The agent couldn't finish this run. Please try again.",
      detail: msg.includes("unparseable JSON") || msg.includes("Gemini")
        ? "The AI service hiccuped - a retry usually works."
        : msg.slice(0, 200),
    }, { status: 500 });
  }

  if (outcome.safetyBlocked) {
    const { data: saved } = await admin.from("agent_runs").insert({
      user_id: user.id, kind, input, status: "safety_blocked",
      result: { ...outcome.result, _grounded: false },
    }).select().single().then((r) => r, () => ({ data: null }));
    return NextResponse.json({ run: saved ?? { kind, input, result: outcome.result, status: "safety_blocked" }, grounded: false, sources: [] });
  }

  await bumpUsage(sb, user.id, "agent_month", cost);

  const result = { ...outcome.result, _sources: outcome.sources, _grounded: outcome.grounded, _memory_ids: outcome.memoryIds };
  let run: any = { id: "local", kind, input, status: "done", result, created_at: new Date().toISOString() };
  const tags = Array.isArray((outcome.result as any).tags)
    ? ((outcome.result as any).tags as unknown[]).filter((t): t is string => typeof t === "string").map((t) => t.toLowerCase().slice(0, 30)).slice(0, 6)
    : [];
  const { data: saved, error: insertErr } = await admin.from("agent_runs").insert({
    user_id: user.id, kind, input, result, source_memory_ids: outcome.memoryIds, tags,
  }).select().single();
  if (insertErr) {
    if (isMissingTable(insertErr)) console.warn("[agents] agent_runs table missing (result still returned)");
    else console.error("[agents] run log failed:", insertErr);
  } else if (saved) {
    run = saved;
  }

  if (kind === "deep_research" && saved) {
    // long runs: the user may have switched tabs - leave a breadcrumb
    await createNotification(admin, {
      userId: user.id, kind: "agent_done",
      title: "Deep research ready",
      body: String((outcome.result as any).title ?? input).slice(0, 120),
      url: `/knowledge?open=${saved.id}`, dedupeKey: `deep:${saved.id}`,
    }).catch(() => null);
  }

  const ph = getPostHogClient();
  if (ph) {
    ph.capture({
      distinctId: user.id, event: "agent_run_completed",
      properties: { agent_kind: kind, plan, grounded: outcome.grounded, source_count: outcome.sources.length, memory_count: outcome.memoryIds.length },
    });
    await ph.flush();
  }

  return NextResponse.json({ run, grounded: outcome.grounded, sources: outcome.sources, cost });
}
