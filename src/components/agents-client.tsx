"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui";
import { UpgradeButton } from "@/components/upgrade-button";
import { ResearchResult, type RunLike } from "@/components/research-result";
import { WatchPanel } from "@/components/watch-panel";
import { OrbitBlock } from "@/components/page-loader";
import { CharCounter } from "@/components/capture";
import { relTime } from "@/lib/dates";

export type AgentTab = "research" | "deep_research" | "watch";

const MAX_INPUT = 500;

const TABS: { id: AgentTab; icon: string; name: string; hint: string; color: string }[] = [
  { id: "research", icon: "🔎", name: "Research", hint: "A quick, sourced answer in under 30 seconds.", color: "var(--c-idea)" },
  { id: "deep_research", icon: "🔭", name: "Deep research", hint: "Investigates several angles, cross-checks, writes a full report.", color: "var(--c-know)" },
  { id: "watch", icon: "👁️", name: "Watch", hint: "Tracks a link for price drops, new jobs or changes.", color: "var(--c-ask)" },
];

const EXAMPLES: Record<"research" | "deep_research", string[]> = {
  research: ["Best stretches for desk workers", "Is intermittent fasting safe after 40?", "How do index funds work?"],
  deep_research: ["Should I switch to a standing desk? Health evidence", "Remote vs hybrid work: productivity research", "Electric vs hybrid car total cost over 5 years"],
};

const DEEP_PHASES = [
  { text: "Planning the investigation", sub: "Splitting your question into angles" },
  { text: "Searching the web", sub: "Several searches run in parallel" },
  { text: "Reading and cross-checking", sub: "Comparing what sources agree on" },
  { text: "Writing your report", sub: "Summary, sections, numbers and sources" },
];
const QUICK_PHASES = [
  { text: "Searching the web", sub: "Looking for reliable sources" },
  { text: "Connecting to your memories", sub: "Finding what's relevant to you" },
  { text: "Writing the answer", sub: "Usually 10-30 seconds" },
];

function RunSkeleton() {
  return (
    <div className="space-y-2" role="status" aria-label="Loading recent runs">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card p-4 flex items-center gap-3">
          <div className="skeleton size-8 !rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <div className={`skeleton h-3.5 ${i === 1 ? "w-1/2" : "w-3/4"}`} />
            <div className="skeleton h-2.5 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AgentsClient({
  plan, used: usedInitial, limit, deepAllowed, deepCost, watchLimit, initialTab, initialQuery,
}: {
  plan: string; used: number; limit: number; deepAllowed: boolean; deepCost: number;
  watchLimit: number; initialTab: AgentTab; initialQuery: string;
}) {
  const [tab, setTab] = useState<AgentTab>(initialTab);
  const [input, setInput] = useState(initialQuery);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(0);
  const [run, setRun] = useState<RunLike | null>(null);
  const [history, setHistory] = useState<RunLike[] | null>(null);
  const [runError, setRunError] = useState<{ msg: string; upgrade?: boolean } | null>(null);
  const [used, setUsed] = useState(usedInitial);
  const resultRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const isResearch = tab === "research" || tab === "deep_research";
  const cost = tab === "deep_research" ? deepCost : 1;
  const locked = tab === "deep_research" && !deepAllowed;
  const outOfRuns = used + cost > limit;
  const phases = tab === "deep_research" ? DEEP_PHASES : QUICK_PHASES;

  const loadHistory = useCallback(async () => {
    try {
      const d = await fetch("/api/agents?limit=20").then((r) => r.json());
      setHistory(d?.runs ?? []);
    } catch { setHistory([]); }
  }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (tab === "research") url.searchParams.delete("tab"); else url.searchParams.set("tab", tab);
    url.searchParams.delete("q");
    window.history.replaceState(null, "", url.toString());
  }, [tab]);

  useEffect(() => {
    if (!busy) { setPhase(0); return; }
    const step = tab === "deep_research" ? 9000 : 5000;
    const t = setInterval(() => setPhase((p) => Math.min(p + 1, phases.length - 1)), step);
    return () => clearInterval(t);
  }, [busy, tab, phases.length]);

  async function go(text = input, kind: "research" | "deep_research" = tab === "deep_research" ? "deep_research" : "research") {
    const q = text.trim();
    if (q.length < 3 || busy) return;
    setBusy(true); setRun(null); setRunError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, input: q }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.error) {
        setRunError({ msg: d.detail ? `${d.error} ${d.detail}` : (d.error ?? "The agent couldn't finish - please try again."), upgrade: !!d.upgrade });
        return;
      }
      setRun(d.run);
      if (d.run?.status !== "safety_blocked") setUsed((u) => u + (d.cost ?? 1));
      loadHistory();
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch {
      setRunError({ msg: "Connection lost while the agent was working. Check your network and try again." });
    } finally { setBusy(false); }
  }

  async function removeRun(id: string) {
    if (!confirm("Remove this from your history and knowledge base?")) return;
    setHistory((h) => (h ?? []).filter((x) => x.id !== id));
    if (run?.id === id) setRun(null);
    await fetch(`/api/agents?id=${id}`, { method: "DELETE" });
  }

  async function addTask(action: string) {
    const res = await fetch("/api/capture", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `I need to ${action}`.slice(0, 800), source: "typed", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    });
    const d = await res.json().catch(() => ({}));
    toast(res.ok ? "Saved as a task." : (d.error ?? "Couldn't save."));
  }

  const shownHistory = (history ?? []).filter((h) => !isResearch || h.kind === tab);
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold">Agents</h1>
          <p className="text-sm text-ink-2 mt-1">Assistants that research and keep watch for you, grounded in your own context.</p>
        </div>
        <div className="min-w-[160px]" title="Agent runs this month">
          <div className="flex justify-between text-xs text-ink-2 mb-1">
            <span>Runs this month</span>
            <span className="tabular-nums font-semibold text-ink">{used}/{limit >= 9999 ? "∞" : limit}</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "color-mix(in srgb, var(--ink-2) 14%, transparent)" }}>
            <div className="h-full rounded-full transition-all" style={{
              width: `${Math.min(100, (used / Math.max(1, limit)) * 100)}%`,
              background: used / Math.max(1, limit) > 0.85 ? "var(--danger)" : "var(--ember)",
            }} />
          </div>
        </div>
      </header>

      <div role="tablist" aria-label="Agent type" className="grid grid-cols-3 gap-2">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button key={t.id} role="tab" aria-selected={active}
              onClick={() => { setTab(t.id); setRunError(null); if (t.id !== tab) setRun(null); }}
              className="card p-3 sm:p-4 text-left cursor-pointer transition-all"
              style={active ? { borderColor: t.color, boxShadow: `0 0 0 3px color-mix(in srgb, ${t.color} 18%, transparent)` } : undefined}>
              <div className="flex items-center gap-2">
                <span className="grid place-items-center size-8 rounded-xl text-base shrink-0"
                  style={{ background: `color-mix(in srgb, ${t.color} 14%, transparent)` }} aria-hidden>{t.icon}</span>
                <span className="font-semibold text-sm leading-tight">{t.name}</span>
              </div>
              <p className="text-xs text-ink-2 mt-2 leading-snug hidden sm:block">{t.hint}</p>
              {t.id === "deep_research" && (
                <p className="text-[11px] mt-1.5 font-semibold" style={{ color: t.color }}>
                  {deepAllowed ? `${deepCost} runs each` : "Premium & Pro"}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {tab === "watch" ? (
        <WatchPanel plan={plan} watchLimit={watchLimit} />
      ) : (
        <>
          <div className="card p-5 space-y-3 soft-shadow">
            <p className="text-sm text-ink-2 sm:hidden">{current.hint}</p>
            <textarea
              className="input !py-3 resize-none"
              rows={tab === "deep_research" ? 3 : 2}
              placeholder={tab === "deep_research" ? "What should be investigated in depth?" : "What do you want to know?"}
              value={input}
              maxLength={MAX_INPUT}
              onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT))}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } }}
              disabled={busy || locked}
            />
            {input.length > 400 && <CharCounter used={input.length} max={MAX_INPUT} />}
            {!input && !busy && (
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES[tab].map((ex) => (
                  <button key={ex} onClick={() => setInput(ex)} className="chip cursor-pointer hover:!border-ember hover:!text-ember">{ex}</button>
                ))}
              </div>
            )}
            {locked ? (
              <div className="rounded-2xl p-4 text-sm space-y-2" style={{ background: "color-mix(in srgb, var(--c-know) 9%, transparent)" }}>
                <p className="font-semibold">Deep research is part of Premium and Pro</p>
                <p className="text-ink-2">Each report investigates four angles in parallel, cross-checks sources and writes a structured report you keep in your knowledge base.</p>
                <UpgradeButton className="!py-1.5 !text-xs" showBenefitsLink />
              </div>
            ) : (
              <button onClick={() => go()} disabled={busy || input.trim().length < 3 || outOfRuns} className="btn-primary w-full !py-2.5">
                {busy ? "Working…" : tab === "deep_research" ? `Start deep research · ${deepCost} runs` : "Research"}
              </button>
            )}
            {outOfRuns && !locked && (
              <div className="rounded-2xl p-3 text-sm flex items-center justify-between gap-3 flex-wrap" style={{ background: "var(--ember-soft)" }}>
                <span>Not enough runs left this month for this agent.</span>
                {plan !== "pro" && <UpgradeButton className="!py-1.5 !text-xs" tier={plan === "premium" ? "pro" : "premium"} />}
              </div>
            )}
          </div>

          <div ref={resultRef} className="scroll-mt-20" />

          {busy && (
            <div className="card p-6 space-y-5">
              <OrbitBlock title={phases[phase].text} sub={phases[phase].sub} height={240} />
              <ol className="flex flex-wrap justify-center gap-2 text-xs" aria-label="Progress">
                {phases.map((p, i) => (
                  <li key={p.text} className="chip" style={i <= phase ? { color: current.color, borderColor: `color-mix(in srgb, ${current.color} 40%, transparent)` } : undefined}>
                    {i < phase ? "✓" : i === phase ? "●" : "○"} {p.text}
                  </li>
                ))}
              </ol>
              {tab === "deep_research" && (
                <p className="text-xs text-ink-2 text-center">Deep research takes 1–3 minutes. You'll also get a notification when the report is ready.</p>
              )}
            </div>
          )}

          {runError && !busy && (
            <div className="card p-4 text-sm" style={{ background: "var(--danger-soft)", borderColor: "color-mix(in srgb, var(--danger) 30%, transparent)" }} role="alert">
              <p className="font-semibold" style={{ color: "var(--danger)" }}>The run didn't finish</p>
              <p className="text-ink-2 mt-1">{runError.msg}</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => go()} className="btn-ghost !py-1.5 !text-xs">Try again</button>
                {runError.upgrade && <UpgradeButton className="!py-1.5 !text-xs" />}
              </div>
            </div>
          )}

          {run && !busy && (
            <div className="card p-5 md:p-6 rise soft-shadow">
              <ResearchResult
                run={run}
                onFollowUp={(q) => { setInput(q); go(q); }}
                onSaveTask={addTask}
              />
              <div className="mt-5 pt-4 border-t border-line flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
                <span>Saved to your knowledge base.</span>
                <div className="flex gap-2">
                  {run.kind === "research" && deepAllowed && (
                    <button onClick={() => { setTab("deep_research"); go(run.input, "deep_research"); }}
                      className="btn-tint !py-1.5 !text-xs" style={{ "--tint": "var(--c-know)" } as React.CSSProperties}>
                      🔭 Go deeper on this
                    </button>
                  )}
                  <Link href={`/knowledge?open=${run.id}`} className="btn-ghost !py-1.5 !text-xs">Open in knowledge base</Link>
                </div>
              </div>
            </div>
          )}

          <section>
            <div className="flex items-baseline justify-between mb-2.5">
              <h2 className="font-display text-lg font-semibold">Recent {tab === "deep_research" ? "reports" : "research"}</h2>
              <Link href="/knowledge" className="text-xs font-semibold text-ember hover:underline underline-offset-2">Knowledge base</Link>
            </div>
            {history === null ? <RunSkeleton /> : shownHistory.length === 0 ? (
              <div className="card p-8 text-center">
                <div className="text-3xl mb-2" aria-hidden>{current.icon}</div>
                <p className="font-semibold">Nothing here yet</p>
                <p className="text-sm text-ink-2 mt-1">
                  {tab === "deep_research" ? "Your deep research reports will collect here." : "Ask something above - every answer is kept for later."}
                </p>
              </div>
            ) : (
              <ul className="card divide-y divide-line overflow-hidden">
                {shownHistory.map((h) => (
                  <li key={h.id} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-paper-2 transition-colors">
                    <button
                      onClick={() => {
                        setRun(h); setInput(h.input); setRunError(null);
                        requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
                      }}
                      className="min-w-0 flex-1 flex items-center gap-3 text-left cursor-pointer"
                      title="Open this result"
                    >
                      <span className="grid place-items-center size-8 rounded-lg shrink-0" aria-hidden
                        style={{ background: `color-mix(in srgb, ${h.kind === "deep_research" ? "var(--c-know)" : "var(--c-idea)"} 13%, transparent)` }}>
                        {h.kind === "deep_research" ? "🔭" : "🔎"}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{h.result?.title || h.input}</span>
                        <span className="block text-xs text-ink-2">{relTime(h.created_at)}</span>
                      </span>
                    </button>
                    <button onClick={() => removeRun(h.id)} aria-label="Remove from history" title="Remove"
                      className="text-ink-2 hover:text-danger cursor-pointer px-1">🗑</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
