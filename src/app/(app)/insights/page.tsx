import { getUser, createClient } from "@/lib/supabase/server";
import { InsightsClient } from "@/components/insights";
import { ActivityChart, TypeBreakdown, type ActivityDay, type TypeCount } from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const user = await getUser();
  const sb = await createClient();
  const [{ data: insights }, { data: weekly }, { data: mems }] = await Promise.all([
    sb.from("insights").select("*")
      .in("status", ["new", "goal_created"])
      .order("created_at", { ascending: false }).limit(50),
    sb.from("weekly_analyses").select("*")
      .order("week_start", { ascending: false }).limit(1),
    sb.from("memories")
      .select("created_at, memory_metadata(type)")
      .is("deleted_at", null)
      .gte("created_at", new Date(Date.now() - 29 * 86_400_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  // aggregate: per calendar day (30 buckets) + per type
  const dayCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    dayCounts.set(d.toISOString().slice(0, 10), 0);
  }
  for (const m of mems ?? []) {
    const key = m.created_at.slice(0, 10);
    if (dayCounts.has(key)) dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
    const raw: unknown = (m as any).memory_metadata;
    const meta = (Array.isArray(raw) ? raw[0] : raw) ?? {};
    const t = (meta as any).type ?? "thought";
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }
  const activity: ActivityDay[] = [...dayCounts.entries()].map(([date, count]) => ({
    label: new Date(date + "T12:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    count,
  }));
  const types: TypeCount[] = [...typeCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const hasData = (mems ?? []).length > 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl">Insights</h1>
        <p className="text-sm text-ink-2 mt-1">Observations, not diagnoses. Every insight links to the memories behind it.</p>
      </header>

      {hasData && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card p-5">
            <p className="label mb-3" style={{ color: "var(--ember)" }}>Capture activity</p>
            <ActivityChart days={activity} />
          </div>
          <div className="card p-5">
            <p className="label mb-3" style={{ color: "var(--c-decision)" }}>What your memory is made of</p>
            <TypeBreakdown types={types} />
          </div>
        </div>
      )}

      <InsightsClient initial={insights ?? []} weekly={weekly?.[0] ?? null} />
    </div>
  );
}
