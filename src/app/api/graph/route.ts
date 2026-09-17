import { NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const WEEKS = 12;

function weekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Monday = 0
  x.setUTCDate(x.getUTCDate() - dow);
  return x.toISOString().slice(0, 10);
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();
  const since = new Date(Date.now() - WEEKS * 7 * 86_400_000);

  const [memsRes, relsRes, pplRes, mpRes, trendRes] = await Promise.all([
    sb.from("memories").select("id, created_at, memory_metadata(type, title, importance)")
      .is("deleted_at", null).order("created_at", { ascending: false }).limit(160),
    sb.from("memory_relationships").select("from_memory_id, to_memory_id, kind, score").limit(600),
    sb.from("people").select("id, name, last_mentioned_at").order("last_mentioned_at", { ascending: false }).limit(30),
    sb.from("memory_people").select("memory_id, person_id").limit(1500),
    sb.from("memories").select("created_at, memory_metadata(type)")
      .is("deleted_at", null).gte("created_at", since.toISOString())
      .order("created_at", { ascending: false }).limit(2000),
  ]);

  const one = (raw: unknown): any => (Array.isArray(raw) ? raw[0] : raw) ?? {};

  const nodes = [
    ...(memsRes.data ?? []).map((m: any) => {
      const meta = one(m.memory_metadata);
      return { id: m.id, label: meta.title || "Untitled", kind: meta.type ?? "thought", created_at: m.created_at, importance: meta.importance ?? 3 };
    }),
    ...(pplRes.data ?? []).map((p: any) => ({ id: `person:${p.id}`, label: p.name, kind: "person", created_at: p.last_mentioned_at, importance: 4 })),
  ];
  const edges = [
    ...(relsRes.data ?? []).map((r: any) => ({ a: r.from_memory_id, b: r.to_memory_id, w: Number(r.score) || 0.5, kind: r.kind ?? "related" })),
    ...(mpRes.data ?? []).map((l: any) => ({ a: l.memory_id, b: `person:${l.person_id}`, w: 0.9, kind: "mentions" })),
  ];
  const ids = new Set(nodes.map((n) => n.id));
  const keptEdges = edges.filter((e) => ids.has(e.a) && ids.has(e.b) && e.a !== e.b);

  // people ranked by how many memories mention them (all time, capped query)
  const mentionCount = new Map<string, number>();
  for (const l of mpRes.data ?? []) mentionCount.set(l.person_id, (mentionCount.get(l.person_id) ?? 0) + 1);
  type PersonStat = { id: string; name: string; count: number; last: string | null };
  const people: PersonStat[] = (pplRes.data ?? [])
    .map((p: any): PersonStat => ({ id: p.id, name: p.name, count: mentionCount.get(p.id) ?? 0, last: p.last_mentioned_at }))
    .filter((p: PersonStat) => p.count > 0)
    .sort((a: PersonStat, b: PersonStat) => b.count - a.count)
    .slice(0, 8);

  // weekly focus: memories per week per type
  const weeks: string[] = [];
  for (let i = WEEKS - 1; i >= 0; i--) weeks.push(weekStart(new Date(Date.now() - i * 7 * 86_400_000)));
  const byWeek = new Map<string, Record<string, number>>(weeks.map((w) => [w, {}]));
  const totals = new Map<string, number>();
  for (const m of trendRes.data ?? []) {
    const wk = weekStart(new Date(m.created_at));
    const bucket = byWeek.get(wk);
    if (!bucket) continue;
    const t = one((m as any).memory_metadata).type ?? "thought";
    bucket[t] = (bucket[t] ?? 0) + 1;
    totals.set(t, (totals.get(t) ?? 0) + 1);
  }
  const topTypes = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t);
  const trend = weeks.map((w) => {
    const b = byWeek.get(w)!;
    const row: Record<string, number | string> = { week: w };
    let other = 0;
    for (const [t, c] of Object.entries(b)) {
      if (topTypes.includes(t)) row[t] = c; else other += c;
    }
    row.other = other;
    return row;
  });

  return NextResponse.json({ nodes, edges: keptEdges, people, trend, trendTypes: topTypes });
}
