import { NextRequest, NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { getPlan, LIMITS, isAiPaused, aiPausedResponse } from "@/lib/limits";
import { WatchService, WATCH_KINDS, normalizeUrl, type WatchKind, type WatchRow } from "@/lib/services/watch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LIST_COLS = "id, url, kind, label, instructions, target_price, currency, status, image_url, last_value, last_snapshot, history, last_checked_at, last_changed_at, last_error, check_count, created_at";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();
  const [{ data: watches, error }, { data: events }] = await Promise.all([
    sb.from("watches").select(LIST_COLS).order("created_at", { ascending: false }).limit(100),
    sb.from("watch_events").select("id, watch_id, kind, summary, data, created_at")
      .order("created_at", { ascending: false }).limit(200),
  ]);
  if (error) {
    console.error("[watches] list failed - has migration 0023 been run?", error);
    return NextResponse.json({ watches: [], events: [], setupNeeded: true });
  }
  // trim heavy snapshot fields the UI doesn't need
  const slim = (watches ?? []).map((w: any) => ({
    ...w,
    last_snapshot: w.last_snapshot
      ? { title: w.last_snapshot.title, price: w.last_snapshot.price, currency: w.last_snapshot.currency, in_stock: w.last_snapshot.in_stock, jobs: (w.last_snapshot.jobs ?? []).slice(0, 40), key_facts: w.last_snapshot.key_facts, summary: w.last_snapshot.summary, method: w.last_snapshot.method }
      : null,
  }));
  return NextResponse.json({ watches: slim, events: events ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();
  const admin = createAdmin();
  if (await isAiPaused(admin, user.id)) return aiPausedResponse();

  const body = await req.json().catch(() => ({}));
  const url = normalizeUrl(String(body.url ?? ""));
  if (!url) return NextResponse.json({ error: "Enter a full public web address, e.g. https://shop.com/item" }, { status: 400 });
  const kind = (WATCH_KINDS.includes(body.kind) ? body.kind : "price") as WatchKind;
  const target = body.target_price != null && body.target_price !== "" ? Number(body.target_price) : null;
  if (target != null && (!Number.isFinite(target) || target <= 0)) {
    return NextResponse.json({ error: "Target price must be a positive number." }, { status: 400 });
  }
  const label = String(body.label ?? "").trim().slice(0, 120);
  const instructions = String(body.instructions ?? "").trim().slice(0, 300) || null;

  const plan = await getPlan(sb, user.id);
  const lim = LIMITS[plan];
  const { count } = await sb.from("watches").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= lim.watchLimit) {
    return NextResponse.json({
      error: `${lim.label} includes ${lim.watchLimit} watch${lim.watchLimit === 1 ? "" : "es"}. Remove one or upgrade to add more.`,
      code: "limit", feature: "watch", upgrade: plan !== "pro",
    }, { status: 402 });
  }
  const { data: dup } = await sb.from("watches").select("id").eq("url", url.toString()).eq("kind", kind).maybeSingle();
  if (dup) return NextResponse.json({ error: "You're already watching this page for the same thing." }, { status: 409 });

  const { data: watch, error } = await sb.from("watches").insert({
    url: url.toString(), kind, label, instructions,
    target_price: kind === "price" ? target : null,
  }).select("*").single();
  if (error || !watch) {
    console.error("[watches] insert failed:", error);
    return NextResponse.json({ error: "Couldn't create the watch. Has database migration 0023 been run?" }, { status: 500 });
  }

  // first reading right away, so the user immediately sees what was found
  const outcome = await WatchService.check(admin, watch as WatchRow);
  const { data: fresh } = await sb.from("watches").select(LIST_COLS).eq("id", watch.id).single();
  return NextResponse.json({ watch: fresh ?? watch, events: outcome.events, error: outcome.error ?? null });
}
