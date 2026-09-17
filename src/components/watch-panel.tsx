"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui";
import { UpgradeButton } from "@/components/upgrade-button";
import { OrbitBlock } from "@/components/page-loader";
import { relTime } from "@/lib/dates";

type Kind = "price" | "jobs" | "content";

interface WatchEvent { id: string; watch_id: string; kind: string; summary: string; data: any; created_at: string }
interface Watch {
  id: string; url: string; kind: Kind; label: string; instructions: string | null;
  target_price: number | null; currency: string | null; status: "active" | "paused";
  image_url: string | null; last_value: number | null; last_snapshot: any;
  history: { t: string; v: number }[]; last_checked_at: string | null; last_changed_at: string | null;
  last_error: string | null; check_count: number; created_at: string;
}

const KINDS: { id: Kind; icon: string; name: string; hint: string; placeholder: string }[] = [
  { id: "price", icon: "🏷️", name: "Price", hint: "Product page - alerts on drops, target price, stock", placeholder: "https://store.com/product/…" },
  { id: "jobs", icon: "💼", name: "Job openings", hint: "Careers page - alerts when roles open or close", placeholder: "https://company.com/careers" },
  { id: "content", icon: "📰", name: "Any change", hint: "Any page - alerts on meaningful changes only", placeholder: "https://site.com/page" },
];

const EVENT_STYLE: Record<string, { icon: string; color: string }> = {
  baseline: { icon: "📍", color: "var(--ink-2)" },
  price_drop: { icon: "📉", color: "var(--success)" },
  price_rise: { icon: "📈", color: "var(--danger)" },
  target_hit: { icon: "🎯", color: "var(--success)" },
  back_in_stock: { icon: "✅", color: "var(--success)" },
  out_of_stock: { icon: "⛔", color: "var(--danger)" },
  jobs_added: { icon: "💼", color: "var(--c-task)" },
  jobs_removed: { icon: "🗂️", color: "var(--ink-2)" },
  changed: { icon: "👀", color: "var(--c-decision)" },
  error: { icon: "⚠️", color: "var(--danger)" },
};

function money(v: number | null | undefined, cur: string | null | undefined) {
  if (v == null) return "–";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur || "USD", maximumFractionDigits: 2 }).format(v); }
  catch { return `${v} ${cur ?? ""}`.trim(); }
}

function host(u: string) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}

/** Tiny inline chart of the watched value over time. */
function Sparkline({ points, color, target }: { points: { t: string; v: number }[]; color: string; target?: number | null }) {
  const W = 220, H = 56, P = 4;
  if (points.length < 2) {
    return <div className="h-14 grid place-items-center text-[11px] text-ink-2 rounded-xl bg-paper-2">Trend appears after the next check</div>;
  }
  const vals = points.map((p) => p.v).concat(target != null ? [target] : []);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => P + (i / (points.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - min) / span) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${d} L${x(points.length - 1)},${H - P} L${x(0)},${H - P} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14" role="img" aria-label="Value history">
      <path d={area} fill={color} opacity="0.12" />
      {target != null && (
        <line x1={P} x2={W - P} y1={y(target)} y2={y(target)} stroke="var(--success)" strokeDasharray="4 3" strokeWidth="1" />
      )}
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].v)} r="3" fill={color} />
    </svg>
  );
}

export function WatchPanel({ plan, watchLimit }: { plan: string; watchLimit: number }) {
  const [watches, setWatches] = useState<Watch[] | null>(null);
  const [events, setEvents] = useState<WatchEvent[]>([]);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [kind, setKind] = useState<Kind>("price");
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState("");
  const [instructions, setInstructions] = useState("");
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<{ msg: string; upgrade?: boolean } | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const d = await fetch("/api/watches", { cache: "no-store" }).then((r) => r.json());
      setWatches(d.watches ?? []);
      setEvents(d.events ?? []);
      setSetupNeeded(!!d.setupNeeded);
    } catch { setWatches([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const eventsByWatch = useMemo(() => {
    const m = new Map<string, WatchEvent[]>();
    for (const e of events) {
      const list = m.get(e.watch_id) ?? [];
      list.push(e);
      m.set(e.watch_id, list);
    }
    return m;
  }, [events]);

  const atLimit = (watches?.length ?? 0) >= watchLimit;
  const current = KINDS.find((k) => k.id === kind)!;

  async function create() {
    if (!url.trim() || creating) return;
    setCreating(true); setFormError(null);
    try {
      const res = await fetch("/api/watches", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, kind, target_price: kind === "price" ? target : null, instructions, label }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setFormError({ msg: d.error ?? "Couldn't create the watch.", upgrade: d.upgrade }); return; }
      setUrl(""); setTarget(""); setInstructions(""); setLabel("");
      toast(d.error ? `Watch added, but the first read failed: ${d.error}` : "Watching - you'll be notified about changes.");
      await load();
      if (d.watch?.id) setExpanded(d.watch.id);
    } catch {
      setFormError({ msg: "Connection problem - please try again." });
    } finally { setCreating(false); }
  }

  async function checkNow(id: string) {
    setChecking(id);
    try {
      const res = await fetch(`/api/watches/${id}/check`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) toast(d.error ?? "Couldn't check right now.");
      else if (d.error) toast(`Check failed: ${d.error}`);
      else {
        const changes = (d.events ?? []).filter((e: any) => e.kind !== "baseline");
        toast(changes.length ? changes.map((e: any) => e.summary).join(" · ") : "No changes since the last check.");
      }
      await load();
    } finally { setChecking(null); }
  }

  async function update(id: string, patch: Record<string, unknown>) {
    setWatches((ws) => (ws ?? []).map((w) => (w.id === id ? { ...w, ...patch } as Watch : w)));
    const res = await fetch(`/api/watches/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (!res.ok) { toast("Couldn't save that."); load(); }
  }

  async function remove(id: string) {
    if (!confirm("Stop watching and delete its history?")) return;
    setWatches((ws) => (ws ?? []).filter((w) => w.id !== id));
    await fetch(`/api/watches/${id}`, { method: "DELETE" });
  }

  return (
    <div className="space-y-6">
      {setupNeeded && (
        <div className="card p-4 text-sm" style={{ background: "var(--danger-soft)" }} role="alert">
          The watch tables are missing. Run <code>supabase/migrations/0023_timelymemo_v2.sql</code> in Supabase.
        </div>
      )}

      <div className="card p-5 space-y-4 soft-shadow">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="What to watch">
          {KINDS.map((k) => (
            <button key={k.id} role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)}
              className={`rounded-xl border px-3 py-2.5 text-left cursor-pointer transition-colors ${kind === k.id ? "border-ember bg-ember-soft" : "border-line hover:bg-paper-2"}`}>
              <span className="block text-sm font-semibold"><span aria-hidden>{k.icon}</span> {k.name}</span>
              <span className="hidden sm:block text-[11px] text-ink-2 mt-0.5 leading-snug">{k.hint}</span>
            </button>
          ))}
        </div>

        <label className="block text-sm">
          <span className="font-medium">Link</span>
          <input className="input mt-1 !py-2.5" type="url" inputMode="url" placeholder={current.placeholder}
            value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()}
            disabled={creating || atLimit} />
        </label>

        <div className={`grid gap-3 ${kind === "price" ? "sm:grid-cols-2" : ""}`}>
          {kind === "price" && (
            <label className="block text-sm">
              <span className="font-medium">Alert me at or below <span className="text-ink-2 font-normal">(optional)</span></span>
              <input className="input mt-1" type="number" min="0" step="0.01" inputMode="decimal" placeholder="e.g. 249"
                value={target} onChange={(e) => setTarget(e.target.value)} disabled={creating || atLimit} />
            </label>
          )}
          <label className="block text-sm">
            <span className="font-medium">Name <span className="text-ink-2 font-normal">(optional)</span></span>
            <input className="input mt-1" maxLength={120} placeholder={kind === "jobs" ? "e.g. Stripe - design roles" : "Found automatically"}
              value={label} onChange={(e) => setLabel(e.target.value)} disabled={creating || atLimit} />
          </label>
        </div>

        {kind !== "price" && (
          <label className="block text-sm">
            <span className="font-medium">What matters to you <span className="text-ink-2 font-normal">(optional)</span></span>
            <input className="input mt-1" maxLength={300}
              placeholder={kind === "jobs" ? "e.g. only product design roles in Europe or remote" : "e.g. tell me when the release date or ticket price changes"}
              value={instructions} onChange={(e) => setInstructions(e.target.value)} disabled={creating || atLimit} />
          </label>
        )}

        {formError && (
          <div className="rounded-xl p-3 text-sm flex items-center justify-between gap-3 flex-wrap" style={{ background: "var(--danger-soft)" }} role="alert">
            <span style={{ color: "var(--danger)" }}>{formError.msg}</span>
            {formError.upgrade && <UpgradeButton className="!py-1.5 !text-xs" tier={plan === "premium" ? "pro" : "premium"} />}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-ink-2">
            {watches ? `${watches.length} of ${watchLimit} watches used` : "\u00a0"} · checked daily, plus “Check now” any time
          </p>
          {atLimit ? (
            plan !== "pro" ? <UpgradeButton className="!py-2 !text-sm" tier={plan === "premium" ? "pro" : "premium"} label="Upgrade for more watches" /> : <span className="text-xs text-ink-2">Watch limit reached</span>
          ) : (
            <button onClick={create} disabled={!url.trim() || creating} className="btn-primary">
              {creating ? "Reading the page…" : "Start watching"}
            </button>
          )}
        </div>
        {creating && (
          <p className="text-xs text-ink-2 phase-in">Reading the page for the first time - this can take up to 30 seconds.</p>
        )}
      </div>

      <section className="space-y-2.5">
        <h2 className="font-display text-lg font-semibold">Your watch list</h2>
        {watches === null ? (
          <OrbitBlock title="Loading your watch list" height={220} />
        ) : watches.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="text-3xl mb-2" aria-hidden>👁️</div>
            <p className="font-semibold">Nothing watched yet</p>
            <p className="text-sm text-ink-2 mt-1 max-w-sm mx-auto">Paste a product, careers page or any link above. TimelyMemo checks it every day and only speaks up when something actually changes.</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {watches.map((w) => {
              const k = KINDS.find((x) => x.id === w.kind)!;
              const evs = eventsByWatch.get(w.id) ?? [];
              const open = expanded === w.id;
              const snap = w.last_snapshot ?? {};
              const color = w.kind === "price" ? "var(--c-buy)" : w.kind === "jobs" ? "var(--c-task)" : "var(--c-decision)";
              const first = w.history?.[0]?.v;
              const change = w.kind === "price" && first != null && w.last_value != null && first !== 0
                ? ((w.last_value - first) / first) * 100 : null;
              return (
                <li key={w.id} className={`card overflow-hidden ${w.status === "paused" ? "opacity-70" : ""}`}>
                  <button onClick={() => setExpanded(open ? null : w.id)} aria-expanded={open}
                    className="w-full p-4 flex items-center gap-3 text-left cursor-pointer hover:bg-paper-2 transition-colors">
                    {w.image_url ? (
                      <img src={w.image_url} alt="" referrerPolicy="no-referrer"
                        className="size-12 rounded-xl object-cover shrink-0 bg-paper-2"
                        onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                    ) : (
                      <span className="size-12 rounded-xl grid place-items-center text-xl shrink-0" aria-hidden
                        style={{ background: `color-mix(in srgb, ${color} 13%, transparent)` }}>{k.icon}</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{w.label || snap.title || host(w.url)}</p>
                      <p className="text-xs text-ink-2 truncate">
                        {host(w.url)} · {w.status === "paused" ? "paused" : w.last_checked_at ? `checked ${relTime(w.last_checked_at)}` : "waiting for first check"}
                      </p>
                      {w.last_error && <p className="text-xs mt-0.5 truncate" style={{ color: "var(--danger)" }}>⚠️ {w.last_error}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      {w.kind === "price" && (
                        <>
                          <p className="font-display text-lg font-bold" style={{ color }}>{money(w.last_value, w.currency)}</p>
                          {change != null && Math.abs(change) >= 0.1 && (
                            <p className="text-[11px] font-semibold" style={{ color: change < 0 ? "var(--success)" : "var(--danger)" }}>
                              {change < 0 ? "▼" : "▲"} {Math.abs(change).toFixed(1)}%
                            </p>
                          )}
                        </>
                      )}
                      {w.kind === "jobs" && (
                        <p className="font-display text-lg font-bold" style={{ color }}>{w.last_value ?? "–"} <span className="text-xs font-sans font-medium text-ink-2">roles</span></p>
                      )}
                      {w.kind === "content" && (
                        <p className="text-xs font-medium text-ink-2">{w.last_changed_at ? `changed ${relTime(w.last_changed_at)}` : "no changes yet"}</p>
                      )}
                    </div>
                  </button>

                  {open && (
                    <div className="px-4 pb-4 space-y-4 border-t border-line pt-4 phase-in">
                      {(w.kind === "price" || w.kind === "jobs") && (
                        <Sparkline points={w.history ?? []} color={color} target={w.kind === "price" ? w.target_price : null} />
                      )}

                      {w.kind === "price" && (
                        <div className="flex flex-wrap gap-1.5 text-xs">
                          {snap.in_stock != null && <span className="chip" style={{ color: snap.in_stock ? "var(--success)" : "var(--danger)" }}>{snap.in_stock ? "In stock" : "Out of stock"}</span>}
                          {w.history?.length > 1 && (
                            <span className="chip">Low {money(Math.min(...w.history.map((h) => h.v)), w.currency)} · High {money(Math.max(...w.history.map((h) => h.v)), w.currency)}</span>
                          )}
                          {(snap.key_facts ?? []).map((f: string) => <span key={f} className="chip">{f}</span>)}
                        </div>
                      )}

                      {w.kind === "price" && (
                        <label className="flex items-center gap-2 text-sm">
                          <span className="text-ink-2 shrink-0">Target price</span>
                          <input className="input !py-1.5 !w-32" type="number" min="0" step="0.01" defaultValue={w.target_price ?? ""}
                            onBlur={(e) => {
                              const v = e.target.value === "" ? null : Number(e.target.value);
                              if (v !== w.target_price) update(w.id, { target_price: v });
                            }} />
                        </label>
                      )}

                      {w.kind === "jobs" && (snap.jobs ?? []).length > 0 && (
                        <div>
                          <p className="label mb-1.5">Open roles</p>
                          <ul className="max-h-56 overflow-y-auto divide-y divide-line rounded-xl border border-line text-sm">
                            {snap.jobs.map((j: any, i: number) => (
                              <li key={i} className="px-3 py-2 flex items-center justify-between gap-2">
                                {j.url ? <a href={j.url} target="_blank" rel="noopener noreferrer" className="truncate hover:text-ember">{j.title}</a> : <span className="truncate">{j.title}</span>}
                                {j.location && <span className="text-xs text-ink-2 shrink-0">{j.location}</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {w.kind === "content" && (snap.summary || (snap.key_facts ?? []).length > 0) && (
                        <div className="text-sm space-y-1.5">
                          {snap.summary && <p>{snap.summary}</p>}
                          <ul className="list-disc list-inside text-ink-2 space-y-0.5">
                            {(snap.key_facts ?? []).map((f: string) => <li key={f}>{f}</li>)}
                          </ul>
                        </div>
                      )}

                      {w.instructions && <p className="text-xs text-ink-2">Focus: {w.instructions}</p>}

                      <div>
                        <p className="label mb-1.5">Activity</p>
                        {evs.length === 0 ? <p className="text-xs text-ink-2">No activity yet.</p> : (
                          <ol className="space-y-1.5 text-sm">
                            {evs.slice(0, 8).map((e) => {
                              const st = EVENT_STYLE[e.kind] ?? EVENT_STYLE.changed;
                              return (
                                <li key={e.id} className="flex items-start gap-2">
                                  <span aria-hidden>{st.icon}</span>
                                  <span className="flex-1 min-w-0" style={{ color: e.kind === "baseline" ? undefined : st.color }}>{e.summary}</span>
                                  <span className="text-[11px] text-ink-2 shrink-0">{relTime(e.created_at)}</span>
                                </li>
                              );
                            })}
                          </ol>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => checkNow(w.id)} disabled={checking === w.id}
                          className="btn-tint !py-1.5 !text-xs" style={{ "--tint": color } as React.CSSProperties}>
                          {checking === w.id ? "Checking…" : "🔄 Check now"}
                        </button>
                        <a href={w.url} target="_blank" rel="noopener noreferrer" className="btn-ghost !py-1.5 !text-xs">Open page</a>
                        <button onClick={() => update(w.id, { status: w.status === "active" ? "paused" : "active" })} className="btn-ghost !py-1.5 !text-xs">
                          {w.status === "active" ? "Pause" : "Resume"}
                        </button>
                        <button onClick={() => remove(w.id)} className="btn-ghost !py-1.5 !text-xs !text-danger ml-auto">Delete</button>
                      </div>
                      {snap.method === "search" && (
                        <p className="text-[11px] text-ink-2">This site blocks automated reading, so values come from web search and may lag behind the live page.</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
