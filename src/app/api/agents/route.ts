import { NextRequest, NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { getPlan, getUsage, bumpUsage, LIMITS } from "@/lib/limits";
import { AgentService } from "@/lib/services/agents";
import { getPostHogClient } from "@/lib/posthog-server";

export const maxDuration = 60;

function isMissingTable(err: any): boolean {
  const msg = String(err?.message ?? err ?? "");
  return err?.code === "42P01" || msg.includes("does not exist") || msg.includes("Could not find the table");
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();
  const { data: runs, error } = await sb
    .from("agent_runs").select("id, kind, input, status, result, created_at")
    .order("created_at", { ascending: false }).limit(10);
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
  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind ?? "");
  const input = String(body.input ?? "").trim().slice(0, 500);
  if (!["research", "buying", "solver"].includes(kind) || !input) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const plan = await getPlan(sb, user.id);
  const lim = LIMITS[plan];
  const usage = await getUsage(sb, user.id);
  if (usage.agents >= lim.agentRunsPerMonth) {
    return NextResponse.json({
      error: `You've used all ${lim.agentRunsPerMonth} agent runs this month on the ${plan === "free" ? "Free" : "Pro"} plan. Pro includes 50 runs/month across all three agents.`,
      code: "limit", feature: "agents", upgrade: plan === "free",
    }, { status: 402 });
  }

  let outcome;
  try {
    if (kind === "research") outcome = await AgentService.research(sb, user.id, input);
    else if (kind === "buying") outcome = await AgentService.buying(sb, user.id, input);
    else outcome = await AgentService.solver(sb, user.id, input);
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

  await bumpUsage(sb, user.id, "agent_month");

  // Persist the run - but NEVER let a logging failure eat the result.
  let run: any = {
    id: "local", kind, input, status: "done",
    result: { ...outcome.result, _grounded: outcome.grounded },
    created_at: new Date().toISOString(),
  };
  const { data: saved, error: insertErr } = await admin.from("agent_runs").insert({
    user_id: user.id, kind, input,
    result: { ...outcome.result, _sources: outcome.sources, _grounded: outcome.grounded, _memory_ids: outcome.memoryIds },
    source_memory_ids: outcome.memoryIds,
  }).select().single();
  if (insertErr) {
    if (isMissingTable(insertErr)) {
      console.warn("[agents] agent_runs table missing - run supabase/migrations/0005_upgrade.sql (result still returned)");
    } else {
      console.error("[agents] run log failed:", insertErr);
    }
  } else if (saved) {
    run = saved;
  }

  const ph = getPostHogClient();
  if (ph) {
    ph.capture({
      distinctId: user.id,
      event: "agent_run_completed",
      properties: {
        agent_kind: kind,
        plan,
        grounded: outcome.grounded,
        source_count: outcome.sources?.length ?? 0,
        memory_count: outcome.memoryIds?.length ?? 0,
      },
    });
    await ph.flush();
  }

  return NextResponse.json({ run, grounded: outcome.grounded, sources: outcome.sources });
}
