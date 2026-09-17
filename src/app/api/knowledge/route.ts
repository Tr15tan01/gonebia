import { NextRequest, NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { fetchPageMeta, normalizeUrl } from "@/lib/services/watch";

export const dynamic = "force-dynamic";

type Source = "research" | "deep_research" | "note" | "link" | "quote";
const ITEM_KINDS = ["note", "link", "quote"] as const;

interface KnowledgeEntry {
  id: string;
  source: Source;
  title: string;
  summary: string;
  url: string | null;
  tags: string[];
  pinned: boolean;
  created_at: string;
  sources_count?: number;
  confidence?: string | null;
}

const cleanTags = (v: unknown): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().toLowerCase().replace(/^#/, "").slice(0, 30)).filter(Boolean))].slice(0, 8)
    : [];

function runToEntry(r: any): KnowledgeEntry {
  const res = r.result ?? {};
  return {
    id: r.id,
    source: r.kind,
    title: String(res.title || r.input).slice(0, 160),
    summary: String(res.answer ?? "").slice(0, 320),
    url: null,
    tags: r.tags?.length ? r.tags : cleanTags(res.tags),
    pinned: !!r.pinned,
    created_at: r.created_at,
    sources_count: Array.isArray(res._sources) ? res._sources.length : 0,
    confidence: res.confidence?.level ?? null,
  };
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();
  const [runsRes, itemsRes] = await Promise.all([
    sb.from("agent_runs").select("id, kind, input, result, created_at, pinned, tags")
      .in("kind", ["research", "deep_research"]).eq("status", "done")
      .order("created_at", { ascending: false }).limit(300),
    sb.from("knowledge_items").select("*").order("created_at", { ascending: false }).limit(500),
  ]);
  const setupNeeded = !!(runsRes.error || itemsRes.error);
  if (setupNeeded) console.error("[knowledge] query failed - has migration 0023 been run?", runsRes.error ?? itemsRes.error);

  const entries: KnowledgeEntry[] = [
    ...(runsRes.data ?? []).map(runToEntry),
    ...(itemsRes.data ?? []).map((i: any) => ({
      id: i.id, source: i.kind as Source, title: i.title, summary: String(i.content ?? "").slice(0, 320),
      url: i.url, tags: i.tags ?? [], pinned: !!i.pinned, created_at: i.created_at,
    })),
  ].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at));

  const counts: Record<string, number> = { all: entries.length };
  const tagCounts = new Map<string, number>();
  for (const e of entries) {
    counts[e.source] = (counts[e.source] ?? 0) + 1;
    for (const t of e.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([tag, count]) => ({ tag, count }));
  return NextResponse.json({ entries, counts, topTags, setupNeeded });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const kind = (ITEM_KINDS as readonly string[]).includes(body.kind) ? body.kind : "note";
  let title = String(body.title ?? "").trim().slice(0, 160);
  let content = String(body.content ?? "").trim().slice(0, 8000);
  let url: string | null = null;

  if (kind === "link") {
    const u = normalizeUrl(String(body.url ?? ""));
    if (!u) return NextResponse.json({ error: "Enter a valid public link." }, { status: 400 });
    url = u.toString();
    if (!title || !content) {
      const metaInfo = await fetchPageMeta(url);
      if (metaInfo) {
        url = metaInfo.url;
        title ||= metaInfo.title ?? u.hostname;
        content ||= metaInfo.description ?? "";
      }
    }
  }
  if (!title && content) title = content.split(/\n|[.!?]\s/)[0].slice(0, 80);
  if (!title) return NextResponse.json({ error: "Give it a title or some content." }, { status: 400 });
  if (kind !== "link" && !content) return NextResponse.json({ error: "Add some content to save." }, { status: 400 });

  const sb = await createClient();
  const { data, error } = await sb.from("knowledge_items")
    .insert({ kind, title, content, url, tags: cleanTags(body.tags) }).select("*").single();
  if (error) {
    console.error("[knowledge] insert failed:", error);
    return NextResponse.json({ error: "Couldn't save. Has database migration 0023 been run?" }, { status: 500 });
  }
  return NextResponse.json({
    entry: { id: data.id, source: data.kind, title: data.title, summary: data.content.slice(0, 320), url: data.url, tags: data.tags, pinned: data.pinned, created_at: data.created_at },
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const isRun = body.source === "research" || body.source === "deep_research";
  const patch: Record<string, unknown> = {};
  if (typeof body.pinned === "boolean") patch.pinned = body.pinned;
  if (Array.isArray(body.tags)) patch.tags = cleanTags(body.tags);
  if (!isRun) {
    if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim().slice(0, 160);
    if (typeof body.content === "string") patch.content = body.content.slice(0, 8000);
    if (Object.keys(patch).length) patch.updated_at = new Date().toISOString();
  }
  if (!id || !Object.keys(patch).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  const sb = await createClient();
  const { error } = await sb.from(isRun ? "agent_runs" : "knowledge_items").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  const source = req.nextUrl.searchParams.get("source");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const sb = await createClient();
  const table = source === "research" || source === "deep_research" ? "agent_runs" : "knowledge_items";
  const { error } = await sb.from(table).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
