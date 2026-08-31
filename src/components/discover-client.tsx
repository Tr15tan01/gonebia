"use client";
import { useState } from "react";
import Link from "next/link";
import { Spinner, useToast } from "@/components/ui";
import { UpgradeButton } from "@/components/upgrade-button";

const TOOLS = [
  { kind: "themes", icon: "\ud83d\udd2e", name: "What have I been thinking about?", desc: "Major themes, shares and trends across your memories.", windows: [30, 90, 365] },
  { kind: "missing", icon: "\ud83d\udc41\ufe0f", name: "What am I missing?", desc: "Unresolved tasks, old promises, pending decisions and quiet neglects.", windows: null },
  { kind: "past_me", icon: "\ud83e\udde0", name: "Talk to Past Me", desc: "Compare who you were with who you are.", windows: [30, 180, 365] },
  { kind: "radar", icon: "\ud83d\udce1", name: "Life Radar", desc: "What needs attention this week - and what's going fine.", windows: null },
  { kind: "myself", icon: "\ud83d\udd0d", name: "Discover Myself", desc: "Recurring interests, concerns, goals and how you've changed.", windows: null },
  { kind: "conflicts", icon: "\u2696\ufe0f", name: "Where I contradict myself", desc: "Tensions between what you said earlier and what you say now - asked gently.", windows: null },
];

export function DiscoverClient({ plan, used, limit }: { plan: string; used: number; limit: number }) {
  const [active, setActive] = useState<string | null>(null);
  const [window, setWindow] = useState<number | null>(null);
  const [data, setData] = useState<any>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [cached, setCached] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const toast = useToast();

  async function run(kind: string, win: number | null, force = false) {
    setBusy(true); setData(null); setSources([]); setCached(false); setRunError(null);
    try {
      const res = await fetch("/api/discover", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, window: win, force }),
      });
      const d = await res.json();
      if (d.code === "limit") { toast(d.error); return; }
      if (d.error) { setRunError(d.error); return; }
      setData(d.result); setSources(d.sources ?? []); setCached(!!d.cached);
    } catch { setRunError("Something went wrong - please try again."); }
    finally { setBusy(false); }
  }

  const tool = TOOLS.find((t) => t.kind === active);
  const outOfRuns = used >= limit;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl">Discover</h1>
        <p className="text-sm text-ink-2 mt-1">
          AI analysis of your own memories - every claim linked to its source.
          {plan === "free" && <> {used}/{limit} analyses used this month.</>}
        </p>
      </header>

      {outOfRuns && (
        <div className="card p-4 text-sm" style={{ background: "var(--ember-soft)", borderColor: "color-mix(in srgb, var(--ember) 30%, transparent)" }}>
          <p className="font-medium">Monthly Discover analyses used up</p>
          <p className="text-ink-2 mt-1">Pro gives you {200} per month plus unlimited insights.</p>
          <UpgradeButton className="mt-3 !py-1.5 !text-xs" />
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {TOOLS.map((t) => (
          <button key={t.kind}
            onClick={() => { setActive(t.kind); setWindow(t.windows ? t.windows[1] : null); setData(null); }}
            className={`card p-4 text-left cursor-pointer hover:border-ember/60 transition-colors ${active === t.kind ? "!border-ember" : ""}`}>
            <p className="font-medium">{t.icon} {t.name}</p>
            <p className="text-sm text-ink-2 mt-1">{t.desc}</p>
          </button>
        ))}
      </div>

      {tool && (
        <div className="card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{tool.icon} {tool.name}</p>
            {tool.windows && (
              <div className="flex gap-1.5">
                {tool.windows.map((w) => (
                  <button key={w} onClick={() => setWindow(w)}
                    className={`chip cursor-pointer ${window === w ? "!bg-ember !text-white !border-ember" : ""}`}>
                    {w === 30 ? "30 days" : w === 90 ? "90 days" : w === 180 ? "6 months" : w === 365 ? "1 year" : `${w}d`}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => run(tool.kind, window)} disabled={busy || outOfRuns} className="btn-primary w-full">
            {busy ? "Analyzing your memories..." : "Run analysis"}
          </button>

          {runError && !busy && (
            <div className="card p-4 text-sm" style={{ background: "var(--danger-soft)", borderLeft: "3px solid var(--danger)" }}>
              <p className="font-medium" style={{ color: "var(--danger)" }}>Not yet</p>
              <p className="text-ink-2 mt-1">{runError}</p>
            </div>
          )}

          {busy && (
            <div className="text-center py-8 flex flex-col items-center gap-3">
              <div className="run-ring" />
              <p className="text-sm font-medium">Reading your memories<span className="loader-dots"><span /><span /><span /></span></p>
              <p className="text-xs text-ink-2">Connecting the dots - usually 10-30 seconds.</p>
            </div>
          )}

          {data && !busy && (
            <DiscoverResult kind={tool.kind} data={data} sources={sources} cached={cached}
              onRegenerate={() => run(tool.kind, window, true)} />
          )}
        </div>
      )}
    </div>
  );
}

function Ref({ id, sources }: { id?: string; sources: any[] }) {
  if (!id) return null;
  const hit = sources.find((s) => s.id.startsWith(id) || id.startsWith(s.id.slice(0, 8)));
  if (!hit) return <span className="chip !text-[10px]">{id.slice(0, 8)}</span>;
  return (
    <Link href="/timeline" className="chip !text-[10px] hover:!border-ember cursor-pointer" title={hit.text}>
      {hit.text.slice(0, 28)}...
    </Link>
  );
}

function DiscoverResult({ kind, data, sources, cached, onRegenerate }: any) {
  return (
    <div className="space-y-4 rise">
      <p className="text-xs text-ink-2">{cached ? "Cached from earlier today" : "Fresh analysis"}{" "}
        <button onClick={onRegenerate} className="text-ember hover:underline cursor-pointer">regenerate</button></p>

      {data.summary && <p className="text-[15px] leading-relaxed">{data.summary}</p>}
      {data.headline && <p className="font-display text-lg">{data.headline}</p>}
      {data.letter && <div className="card p-4 text-[15px] leading-relaxed" style={{ background: "var(--ember-soft)" }}>{data.letter}</div>}
      {data.one_liner && <p className="font-display text-lg text-ember">{data.one_liner}</p>}
      {data.calm_note && <p className="text-sm text-ink-2">🌤 {data.calm_note}</p>}

      {(data.themes ?? []).map((t: any, i: number) => (
        <div key={i} className="card p-4">
          <div className="flex justify-between items-baseline">
            <p className="font-medium">{t.name}</p>
            <span className="chip">{t.percent}%</span>
          </div>
          <div className="h-1.5 rounded-full mt-2" style={{ background: "color-mix(in srgb, var(--ink-2) 12%, transparent)" }}>
            <div className="h-full rounded-full bg-ember" style={{ width: `${Math.min(100, t.percent)}%` }} />
          </div>
          <p className="text-sm text-ink-2 mt-2">{t.note}</p>
          <p className="text-xs mt-1" style={{ color: t.trend === "rising" ? "var(--success)" : t.trend === "fading" ? "var(--ink-2)" : "var(--ember)" }}>{t.trend}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">{(t.memory_ids ?? []).map((id: string) => <Ref key={id} id={id} sources={sources} />)}</div>
        </div>
      ))}

      {(data.items ?? data.alerts ?? []).map((it: any, i: number) => {
        const urgencyColor = it.urgency === "high" ? "var(--danger)" : it.urgency === "medium" ? "var(--ember)" : "var(--success)";
        return (
          <div key={i} className="card p-4" style={{ borderLeft: `3px solid ${urgencyColor}` }}>
            <div className="flex justify-between gap-2">
              <p className="font-medium">{it.title ?? it.message}</p>
              {it.urgency && <span className="chip" style={{ color: urgencyColor, borderColor: `color-mix(in srgb, ${urgencyColor} 40%, transparent)` }}>{it.urgency}</span>}
            </div>
            {it.detail && <p className="text-sm text-ink-2 mt-1">{it.detail}</p>}
            {it.note && <p className="text-sm text-ink-2 mt-1">{it.note}</p>}
            <div className="flex flex-wrap gap-1.5 mt-2">{(it.memory_ids ?? []).map((id: string) => <Ref key={id} id={id} sources={sources} />)}</div>
          </div>
        );
      })}

      {(data.what_changed ?? data.changes ?? []).map((c: any, i: number) => (
        <div key={i} className="card p-4 text-sm">
          <p><span className="text-ink-2">was:</span> {c.from ?? c.change}</p>
          {c.to && <p><span className="text-ink-2">now:</span> {c.to}</p>}
          {c.note && <p className="text-ink-2 mt-1">{c.note}</p>}
        </div>
      ))}

      {data.past_themes && (
        <div className="flex flex-wrap gap-1.5">{data.past_themes.map((t: string) => <span key={t} className="chip">{t}</span>)}</div>
      )}
      {(data.what_persisted ?? []).length > 0 && (
        <div className="card p-4 text-sm">
          <p className="label mb-2">Still true</p>
          <ul className="list-disc list-inside text-ink-2">{data.what_persisted.map((p: string) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      {(data.open_loops_then ?? []).length > 0 && (
        <div className="card p-4 text-sm">
          <p className="label mb-2">You were mid-way through</p>
          <ul className="list-disc list-inside text-ink-2">{data.open_loops_then.map((p: string) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      {(data.conflicts ?? []).length > 0 && (
        <div className="space-y-3">
          {data.framing && <p className="text-sm text-ink-2">{data.framing}</p>}
          {(data.conflicts ?? []).map((c: any, i: number) => (
            <div key={i} className="card p-4" style={{ borderLeft: "3px solid var(--c-decision)" }}>
              <div className="flex justify-between gap-2">
                <p className="font-medium">{c.tension}</p>
                {c.kind && <span className="chip chip-c-decision">{String(c.kind).replace(/_/g, " ")}</span>}
              </div>
              <div className="grid sm:grid-cols-2 gap-2 mt-3 text-sm">
                <div className="card p-3">
                  <p className="label">Earlier{c.earlier?.date ? ` - ${c.earlier.date}` : ""}</p>
                  <p className="mt-1">{c.earlier?.claim}</p>
                </div>
                <div className="card p-3">
                  <p className="label">Later{c.later?.date ? ` - ${c.later.date}` : ""}</p>
                  <p className="mt-1">{c.later?.claim}</p>
                </div>
              </div>
              {c.question && <p className="text-sm mt-3" style={{ color: "var(--c-decision)" }}>{c.question}</p>}
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Ref id={c.earlier?.memory_id} sources={sources} />
                <Ref id={c.later?.memory_id} sources={sources} />
              </div>
            </div>
          ))}
        </div>
      )}

      {(data.interests ?? []).length > 0 && (
        <div className="card p-4">
          <p className="label mb-2">Interests</p>
          {(data.interests ?? []).map((x: any, i: number) => (
            <div key={i} className="text-sm mt-2"><p className="font-medium">{x.topic}</p><p className="text-ink-2">{x.evidence}</p>
              <div className="flex flex-wrap gap-1.5 mt-1">{(x.memory_ids ?? []).map((id: string) => <Ref key={id} id={id} sources={sources} />)}</div></div>
          ))}
        </div>
      )}
      {(data.concerns ?? []).length > 0 && (
        <div className="card p-4">
          <p className="label mb-2">Concerns</p>
          {(data.concerns ?? []).map((x: any, i: number) => (
            <div key={i} className="text-sm mt-2"><p className="font-medium">{x.topic}</p><p className="text-ink-2">{x.evidence}</p>
              <div className="flex flex-wrap gap-1.5 mt-1">{(x.memory_ids ?? []).map((id: string) => <Ref key={id} id={id} sources={sources} />)}</div></div>
          ))}
        </div>
      )}
      {(data.goals ?? []).length > 0 && (
        <div className="card p-4">
          <p className="label mb-2">Goals</p>
          {(data.goals ?? []).map((x: any, i: number) => (
            <div key={i} className="text-sm mt-2"><p className="font-medium">{x.goal}</p><p className="text-ink-2">{x.status_hint}</p>
              <div className="flex flex-wrap gap-1.5 mt-1">{(x.memory_ids ?? []).map((id: string) => <Ref key={id} id={id} sources={sources} />)}</div></div>
          ))}
        </div>
      )}
    </div>
  );
}
