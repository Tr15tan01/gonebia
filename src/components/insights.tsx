"use client";
import { useState } from "react";
import { Sheet, useToast, Empty, Spinner } from "@/components/ui";
import { MemoryList, type Memory } from "@/components/memory";
import { relTime } from "@/lib/dates";
import { UpgradeButton } from "@/components/upgrade-button";

const KIND_META: Record<string, { icon: string; label: string }> = {
  forgotten: { icon: "🔔", label: "You may have forgotten" },
  connection: { icon: "🧩", label: "I noticed a connection" },
  intention: { icon: "🎯", label: "Intention vs reality" },
  pattern: { icon: "🛒", label: "Pattern detected" },
  future_note: { icon: "🕰️", label: "Future memory" },
};

export function InsightsClient({ initial, weekly, plan = "pro" }: { initial: any[]; weekly: any | null; plan?: string }) {
  const [insights, setInsights] = useState(initial);
  const [why, setWhy] = useState<any | null>(null);
  const [sources, setSources] = useState<Memory[] | null>(null);
  const [loadingWhy, setLoadingWhy] = useState(false);
  const toast = useToast();

  async function act(id: string, action: string) {
    await fetch("/api/insights", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
    setInsights((list) => list.filter((i) => i.id !== id));
    toast(action === "goal_created" ? "Goal created." : "Noted - this helps TimelyMemo learn what to surface.");
  }

  async function openWhy(insight: any) {
    setWhy(insight);
    setSources(null);
    setLoadingWhy(true);
    const ids: string[] = insight.source_memory_ids ?? [];
    const results: Memory[] = [];
    for (const id of ids.slice(0, 10)) {
      const r = await fetch(`/api/memories/${id}`).then((x) => x.json()).catch(() => null);
      if (r?.memory) results.push(r.memory);
    }
    setSources(results);
    setLoadingWhy(false);
  }

  const order = ["forgotten", "pattern", "connection", "intention"];
  const sorted = [...insights].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl">Insights</h1>
        <p className="text-sm text-ink-2 mt-1">Observations, not diagnoses. Every insight links to the memories behind it.</p>
        {plan === "free" && (
          <div className="card p-4 mt-3 text-sm" style={{ background: "var(--ember-soft)", borderColor: "color-mix(in srgb, var(--ember) 30%, transparent)" }}>
            <p className="font-medium">You're on the Free plan</p>
            <p className="text-ink-2 mt-1">Intention vs Reality, Recurring Patterns and the Weekly Reflection are Pro features. Free includes Connect the Dots (3/month) and the forgotten check (1/week).</p>
            <UpgradeButton className="mt-3 !py-1.5 !text-xs" />
          </div>
        )}
      </header>

      {weekly && (
        <div className="card p-5">
          <p className="label mb-2">Your week</p>
          <p className="font-display text-lg">{weekly.content?.headline}</p>
          {weekly.content?.themes?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {weekly.content.themes.map((t: string) => <span key={t} className="chip">{t}</span>)}
            </div>
          )}
          <ul className="mt-3 space-y-1.5 text-sm text-ink-2 list-disc list-inside">
            {(weekly.content?.observations ?? []).map((o: string, i: number) => <li key={i}>{o}</li>)}
          </ul>
        </div>
      )}

      {sorted.length === 0 && !weekly && (
        <Empty icon="◈" title="No insights right now." hint="TimelyMemo notices patterns as your memory grows. Keep capturing." />
      )}

      {sorted.map((ins) => {
        const meta = KIND_META[ins.kind] ?? { icon: "◈", label: "Insight" };
        return (
          <div key={ins.id} className="card p-5 rise space-y-3">
            <p className="label text-ember">{meta.icon} {meta.label}</p>
            <p className="font-display text-lg leading-snug">{ins.title}</p>
            <p className="text-sm text-ink-2">{ins.body}</p>

            {ins.kind === "forgotten" && (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => act(ins.id, "done")} className="btn-primary !py-1.5 !text-xs">Done</button>
                <button onClick={() => act(ins.id, "dismiss")} className="btn-ghost !py-1.5 !text-xs">Remind me later</button>
                <button onClick={() => act(ins.id, "not_relevant")} className="btn-ghost !py-1.5 !text-xs">Not relevant</button>
              </div>
            )}
            {ins.kind === "pattern" && (
              <button onClick={() => act(ins.id, "done")} className="btn-primary !py-1.5 !text-xs">
                Remind me around day {Math.max(1, (ins.data?.avg_interval_days ?? 30) - 3)}
              </button>
            )}
            {ins.kind === "intention" && (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => act(ins.id, "goal_created")} className="btn-primary !py-1.5 !text-xs">Create a goal</button>
                <button onClick={() => act(ins.id, "dismiss")} className="btn-ghost !py-1.5 !text-xs">Dismiss</button>
              </div>
            )}

            <button onClick={() => openWhy(ins)} className="text-xs text-ink-2 hover:text-ember underline underline-offset-2">
              Why am I seeing this?
            </button>
          </div>
        );
      })}

      <Sheet open={!!why} onClose={() => setWhy(null)}>
        {why && (
          <div className="space-y-4">
            <p className="label">Why am I seeing this?</p>
            <p className="text-sm text-ink-2">
              This insight was generated from {why.source_memory_ids?.length ?? 0} of your own memories
              {why.created_at ? `, detected ${relTime(why.created_at)}` : ""}. Nothing here is a fact about you -
              it's a pattern TimelyMemo noticed, and you can dismiss it.
            </p>
            <p className="label">Underlying memories</p>
            {loadingWhy ? <Spinner /> : sources && sources.length
              ? <MemoryList memories={sources} />
              : <p className="text-sm text-ink-2">The source memories could not be loaded (they may have been deleted).</p>}
          </div>
        )}
      </Sheet>
    </div>
  );
}
