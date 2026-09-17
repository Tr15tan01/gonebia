"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { MemorySheet } from "@/components/memory";
import { OrbitBlock } from "@/components/page-loader";
import { TYPE_COLOR, typeIcon } from "@/lib/type-style";
import { relTime } from "@/lib/dates";

interface GNode { id: string; label: string; kind: string; created_at?: string; importance?: number; degree: number }
interface GEdge { a: string; b: string; w: number; kind: string }
interface Person { id: string; name: string; count: number; last: string | null }
type TrendRow = Record<string, number | string>;

/** true on the sm+ layout - the orbit gets a wider canvas and more spokes. */
function useWideLayout() {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia("(min-width: 640px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => matchMedia("(min-width: 640px)").matches,
    () => false,
  );
}

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function GraphClient() {
  const [state, setState] = useState<"loading" | "empty" | "ready" | "error">("loading");
  const [data, setData] = useState<{ nodes: GNode[]; edges: GEdge[]; people: Person[]; trend: TrendRow[]; trendTypes: string[] } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [trail, setTrail] = useState<string[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const wide = useWideLayout();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/graph", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const d = await res.json();
        if (!alive) return;
        const raw = (d.nodes ?? []) as any[];
        if (!raw.length) { setState("empty"); return; }
        const edges = (d.edges ?? []) as GEdge[];
        const degree = new Map<string, number>();
        for (const e of edges) { degree.set(e.a, (degree.get(e.a) ?? 0) + 1); degree.set(e.b, (degree.get(e.b) ?? 0) + 1); }
        const nodes: GNode[] = raw.map((n) => ({ ...n, degree: degree.get(n.id) ?? 0 }));
        setData({ nodes, edges, people: d.people ?? [], trend: d.trend ?? [], trendTypes: d.trendTypes ?? [] });
        const start = [...nodes].sort((a, b) => b.degree - a.degree)[0];
        setFocusId(start?.degree ? start.id : null);
        setState("ready");
      } catch { if (alive) setState("error"); }
    })();
    return () => { alive = false; };
  }, []);

  const byId = useMemo(() => new Map((data?.nodes ?? []).map((n) => [n.id, n])), [data]);

  const neighbors = useMemo(() => {
    const m = new Map<string, { id: string; kind: string }[]>();
    for (const e of data?.edges ?? []) {
      if (!m.has(e.a)) m.set(e.a, []);
      if (!m.has(e.b)) m.set(e.b, []);
      m.get(e.a)!.push({ id: e.b, kind: e.kind });
      m.get(e.b)!.push({ id: e.a, kind: e.kind });
    }
    return m;
  }, [data]);

  const kinds = useMemo(() => {
    const c = new Map<string, number>();
    for (const n of data?.nodes ?? []) c.set(n.kind, (c.get(n.kind) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  const hubs = useMemo(
    () => (data?.nodes ?? []).filter((n) => n.degree > 0).sort((a, b) => b.degree - a.degree).slice(0, 8),
    [data],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (data?.nodes ?? []).filter((n) => n.label.toLowerCase().includes(q)).slice(0, 8);
  }, [query, data]);

  const focus = focusId ? byId.get(focusId) ?? null : null;
  const links = useMemo(() => {
    if (!focus) return [];
    const seen = new Set<string>();
    return (neighbors.get(focus.id) ?? [])
      .filter((l) => {
        const n = byId.get(l.id);
        if (!n || hidden.has(n.kind) || seen.has(l.id)) return false;
        seen.add(l.id);
        return true;
      })
      .map((l) => ({ ...byId.get(l.id)!, edgeKind: l.kind }))
      .sort((a, b) => b.degree - a.degree);
  }, [focus, neighbors, byId, hidden]);

  function goTo(id: string) {
    if (id === focusId) return;
    setTrail((t) => (focusId ? [...t.slice(-9), focusId] : t));
    setFocusId(id);
    setShowAll(false);
    setQuery("");
  }
  function back() {
    setTrail((t) => {
      const prev = t[t.length - 1];
      if (prev) setFocusId(prev);
      return t.slice(0, -1);
    });
  }
  function activate(n: GNode) {
    if (n.id.startsWith("person:")) window.location.href = `/people/${n.id.slice(7)}`;
    else setOpen(n.id);
  }

  const ringMax = wide ? 14 : 8;
  const ringLinks = links.slice(0, ringMax);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-bold">Memory graph</h1>
        <p className="text-sm text-ink-2 mt-1">
          One memory or person at a time, with everything it connects to around it. Tap any spoke to travel there.
        </p>
      </header>

      {state === "loading" && <OrbitBlock title="Mapping connections" sub="Linking memories, people, books and decisions" height={420} />}
      {state === "error" && (
        <div className="card p-8 text-center" role="alert">
          <p className="font-semibold">Couldn't load the graph.</p>
          <p className="text-sm text-ink-2 mt-1">Check your connection and reload the page.</p>
        </div>
      )}
      {state === "empty" && (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3" aria-hidden>⁂</div>
          <p className="font-semibold">Not enough memories yet</p>
          <p className="text-sm text-ink-2 mt-1">Mention people, books and plans in a few notes - connections appear here automatically.</p>
          <Link href="/dashboard" className="btn-primary mt-4">Capture a memory</Link>
        </div>
      )}

      {state === "ready" && data && (
        <>
          <div className="card p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative sm:w-64">
                <input className="input !py-1.5 w-full" type="search" placeholder="Find a memory or person…"
                  value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the graph" />
                {results.length > 0 && (
                  <ul className="absolute z-20 mt-1 w-full card p-1 soft-shadow max-h-64 overflow-y-auto">
                    {results.map((n) => (
                      <li key={n.id}>
                        <button onClick={() => goTo(n.id)} className="w-full text-left px-2 py-1.5 rounded-lg text-sm hover:bg-paper-2 cursor-pointer flex items-center gap-2">
                          <span aria-hidden>{typeIcon(n.kind)}</span>
                          <span className="truncate flex-1">{n.label}</span>
                          <span className="text-xs text-ink-2">{n.degree}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <span className="text-xs text-ink-2 sm:ml-auto tabular-nums">
                {data.nodes.filter((n) => n.kind !== "person").length} memories · {data.nodes.filter((n) => n.kind === "person").length} people · {data.edges.length} links
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {kinds.map(([k, c]) => {
                const off = hidden.has(k);
                return (
                  <button key={k} aria-pressed={!off}
                    onClick={() => setHidden((h) => { const s = new Set(h); if (s.has(k)) s.delete(k); else s.add(k); return s; })}
                    className="chip cursor-pointer !text-[11px] gap-1.5 capitalize" style={{ opacity: off ? 0.45 : 1 }}>
                    <span className="inline-block size-2.5 rounded-full" style={{ background: TYPE_COLOR[k] ?? "var(--ink-2)" }} />
                    {k} <span className="text-ink-2">{c}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {focus ? (
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-line text-sm">
                <button onClick={back} disabled={!trail.length} className="btn-ghost !py-1 !px-2 !text-xs disabled:opacity-40" aria-label="Back">←</button>
                <span className="text-ink-2 text-xs truncate flex-1">
                  {trail.length ? `${short(byId.get(trail[trail.length - 1])?.label ?? "", 24)} → ` : ""}
                  <span className="text-ink font-medium">{short(focus.label, 28)}</span>
                </span>
                <button onClick={() => activate(focus)} className="btn-tint !py-1 !px-2.5 !text-xs"
                  style={{ "--tint": TYPE_COLOR[focus.kind] ?? "var(--ember)" } as React.CSSProperties}>
                  {focus.kind === "person" ? "Open person" : "Open memory"}
                </button>
              </div>

              <OrbitView focus={focus} links={ringLinks} wide={wide} onPick={goTo} />

              <div className="px-4 pb-4">
                <p className="label mb-2">
                  {links.length} connection{links.length === 1 ? "" : "s"}
                  {links.length > ringMax && !showAll ? ` · showing ${ringMax} in the orbit` : ""}
                </p>
                <ul className="grid sm:grid-cols-2 gap-1.5">
                  {(showAll ? links : links.slice(0, ringMax)).map((n) => (
                    <li key={n.id}>
                      <button onClick={() => goTo(n.id)}
                        className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-paper-2 transition-colors cursor-pointer">
                        <span className="grid place-items-center size-7 rounded-lg shrink-0" aria-hidden
                          style={{ background: `color-mix(in srgb, ${TYPE_COLOR[n.kind] ?? "var(--ink-2)"} 14%, transparent)` }}>
                          {typeIcon(n.kind)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{n.label}</span>
                          <span className="block text-[11px] text-ink-2 capitalize">
                            {n.edgeKind === "mentions" ? "mentioned" : n.edgeKind}{n.created_at ? ` · ${relTime(n.created_at)}` : ""}
                          </span>
                        </span>
                        <span className="text-[11px] text-ink-2 tabular-nums shrink-0">{n.degree}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {links.length > ringMax && (
                  <button onClick={() => setShowAll((v) => !v)} className="btn-ghost !py-1.5 !text-xs mt-2">
                    {showAll ? "Show fewer" : `Show all ${links.length}`}
                  </button>
                )}
                {links.length === 0 && (
                  <p className="text-sm text-ink-2">No connections match the current filters.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="card p-8 text-center">
              <p className="font-semibold">Nothing is connected yet</p>
              <p className="text-sm text-ink-2 mt-1">Once memories share people, books or topics, they'll link up here.</p>
            </div>
          )}

          {hubs.length > 0 && (
            <section>
              <h2 className="font-display text-lg font-semibold mb-2">Most connected</h2>
              <div className="flex flex-wrap gap-2">
                {hubs.map((n) => (
                  <button key={n.id} onClick={() => goTo(n.id)}
                    className={`chip cursor-pointer !py-1 !px-3 !text-sm gap-1.5 ${focusId === n.id ? "!border-ember !text-ember" : ""}`}>
                    <span aria-hidden>{typeIcon(n.kind)}</span>
                    <span className="max-w-[16ch] truncate">{n.label}</span>
                    <span className="text-[11px] font-semibold text-ink-2">{n.degree}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="grid md:grid-cols-5 gap-4">
            <FocusTrend rows={data.trend} types={data.trendTypes} />
            <PeopleList people={data.people} />
          </div>
        </>
      )}

      <MemorySheet id={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/** The focused node in the middle, its connections on one or two rings.
 *  Everything always fits - no zooming, no dragging, labels stay readable. */
function OrbitView({
  focus, links, wide, onPick,
}: {
  focus: GNode;
  links: (GNode & { edgeKind: string })[];
  wide: boolean;
  onPick: (id: string) => void;
}) {
  const W = wide ? 760 : 380;
  const Hh = wide ? 440 : 400;
  const cx = W / 2, cy = Hh / 2;
  const perRing = wide ? 8 : 5;
  const rings = links.length > perRing ? 2 : 1;
  const r1 = wide ? (rings === 1 ? 150 : 118) : rings === 1 ? 118 : 96;
  const r2 = wide ? 188 : 158;
  const focusColor = TYPE_COLOR[focus.kind] ?? "var(--ink-2)";

  const placed = links.map((n, i) => {
    const ring = rings === 2 && i >= Math.ceil(links.length / 2) ? 1 : 0;
    const group = rings === 2
      ? (ring === 0 ? links.slice(0, Math.ceil(links.length / 2)) : links.slice(Math.ceil(links.length / 2)))
      : links;
    const idxInRing = rings === 2 && ring === 1 ? i - Math.ceil(links.length / 2) : i;
    const count = group.length;
    const angle = (idxInRing / count) * Math.PI * 2 - Math.PI / 2 + (ring === 1 ? Math.PI / count : 0);
    const r = ring === 0 ? r1 : r2;
    return { n, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), cos: Math.cos(angle), radius: 7 + Math.min(7, Math.sqrt(n.degree) * 1.8) };
  });

  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full block" style={{ maxHeight: 460 }} role="img"
      aria-label={`${focus.label} and its ${links.length} connections`}>
      {placed.map(({ n, x, y }) => (
        <line key={`l-${n.id}`} x1={cx} y1={cy} x2={x} y2={y}
          strokeDasharray={n.edgeKind === "mentions" ? "4 3" : undefined}
          style={{ stroke: TYPE_COLOR[n.kind] ?? "var(--ink-2)", strokeOpacity: 0.35, strokeWidth: 1.5 }} />
      ))}

      <circle cx={cx} cy={cy} r={wide ? 74 : 62} style={{ fill: focusColor, fillOpacity: 0.09 }} />
      <circle cx={cx} cy={cy} r={wide ? 74 : 62} fill="none" style={{ stroke: focusColor, strokeOpacity: 0.35, strokeWidth: 1.5 }} />
      <text x={cx} y={cy - (wide ? 20 : 18)} textAnchor="middle" fontSize="18" aria-hidden>{typeIcon(focus.kind)}</text>
      {wrapLabel(focus.label, wide ? 20 : 16, 3).map((line, i) => (
        <text key={i} x={cx} y={cy + 2 + i * 14} textAnchor="middle" fontSize="12.5" fontWeight="650" style={{ fill: "var(--ink)" }}>{line}</text>
      ))}
      <text x={cx} y={cy + (wide ? 56 : 48)} textAnchor="middle" fontSize="11" style={{ fill: "var(--ink-2)" }}>
        {focus.degree} connection{focus.degree === 1 ? "" : "s"}
      </text>

      {placed.map(({ n, x, y, cos, radius }) => {
        const anchor = cos > 0.25 ? "start" : cos < -0.25 ? "end" : "middle";
        const dx = anchor === "start" ? radius + 6 : anchor === "end" ? -(radius + 6) : 0;
        const dy = anchor === "middle" ? (y < cy ? -(radius + 8) : radius + 16) : 4;
        return (
          <g key={n.id} className="cursor-pointer" onClick={() => onPick(n.id)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onPick(n.id); }}>
            <title>{n.label} · {n.kind} · {n.degree} connections</title>
            <circle cx={x} cy={y} r={radius + 8} fill="transparent" />
            <circle cx={x} cy={y} r={radius}
              style={{ fill: TYPE_COLOR[n.kind] ?? "var(--ink-2)", stroke: "var(--card)", strokeWidth: n.kind === "person" ? 2.5 : 0 }} />
            <text x={x + dx} y={y + dy} textAnchor={anchor} fontSize="11.5" fontWeight="500" paintOrder="stroke"
              style={{ fill: "var(--ink)", stroke: "var(--card)", strokeWidth: 3 }}>
              {short(n.label, wide ? 22 : 14)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function wrapLabel(text: string, per: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (!line.length) line = w;
    else if (`${line} ${w}`.length <= per) line += ` ${w}`;
    else { lines.push(line); line = w; }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  const out = lines.slice(0, maxLines);
  if (out.length === maxLines) out[maxLines - 1] = short(out[maxLines - 1], per);
  return out;
}

const otherColor = "color-mix(in srgb, var(--ink-2) 35%, transparent)";

/** Stacked weekly bars: where attention went over the last 12 weeks. */
function FocusTrend({ rows, types }: { rows: TrendRow[]; types: string[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const keys = [...types, "other"];
  const totals = rows.map((r) => keys.reduce((s, k) => s + (Number(r[k]) || 0), 0));
  const max = Math.max(1, ...totals);
  const sum = totals.reduce((a, b) => a + b, 0);
  const firstHalf = totals.slice(0, 6).reduce((a, b) => a + b, 0);
  const lastHalf = totals.slice(6).reduce((a, b) => a + b, 0);
  const trendPct = firstHalf ? Math.round(((lastHalf - firstHalf) / firstHalf) * 100) : null;
  const label = (w: unknown) => new Date(`${String(w)}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const hi = hoverIdx != null ? rows[hoverIdx] : null;
  const riser = types
    .map((t) => ({
      t,
      delta: rows.slice(-4).reduce((s, r) => s + (Number(r[t]) || 0), 0) - rows.slice(-8, -4).reduce((s, r) => s + (Number(r[t]) || 0), 0),
    }))
    .sort((a, b) => b.delta - a.delta)[0];

  return (
    <section className="card p-5 md:col-span-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Where your attention went</h2>
          <p className="text-xs text-ink-2 mt-0.5">Memories per week by type, last 12 weeks</p>
        </div>
        {trendPct != null && sum > 0 && (
          <span className="chip font-semibold shrink-0" style={{ color: trendPct >= 0 ? "var(--success)" : "var(--danger)" }}>
            {trendPct >= 0 ? "▲" : "▼"} {Math.abs(trendPct)}% vs prior 6 wks
          </span>
        )}
      </div>

      {sum === 0 ? (
        <p className="text-sm text-ink-2 py-10 text-center">No memories in the last 12 weeks yet.</p>
      ) : (
        <>
          <div className="mt-4 h-40 flex items-end gap-1.5" onMouseLeave={() => setHoverIdx(null)}>
            {rows.map((r, i) => (
              <button key={String(r.week)} type="button"
                className="flex-1 h-full flex flex-col justify-end cursor-default"
                onMouseEnter={() => setHoverIdx(i)} onFocus={() => setHoverIdx(i)} onClick={() => setHoverIdx(i)}
                aria-label={`Week of ${label(r.week)}: ${totals[i]} memories`}>
                <div className="w-full flex flex-col-reverse rounded-md overflow-hidden bar-grow transition-opacity"
                  style={{
                    height: `${(totals[i] / max) * 100}%`, minHeight: totals[i] ? 3 : 0,
                    animationDelay: `${i * 25}ms`, opacity: hoverIdx == null || hoverIdx === i ? 1 : 0.45,
                  }}>
                  {keys.map((k) => {
                    const v = Number(r[k]) || 0;
                    return v ? <div key={k} style={{ height: `${(v / (totals[i] || 1)) * 100}%`, background: k === "other" ? otherColor : TYPE_COLOR[k] ?? "var(--ink-2)" }} /> : null;
                  })}
                </div>
              </button>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-ink-2 mt-1.5">
            <span>{label(rows[0]?.week)}</span>
            <span>{label(rows[rows.length - 1]?.week)}</span>
          </div>
          <div className="min-h-[2.5rem] mt-3 text-xs" aria-live="polite">
            {hi ? (
              <p>
                <span className="font-semibold">Week of {label(hi.week)}:</span>{" "}
                {keys.filter((k) => Number(hi[k])).map((k) => `${hi[k]} ${k}`).join(" · ") || "nothing captured"}
              </p>
            ) : riser && riser.delta > 0 ? (
              <p className="text-ink-2">
                Rising lately: <span className="font-semibold capitalize" style={{ color: TYPE_COLOR[riser.t] }}>{typeIcon(riser.t)} {riser.t}</span> (+{riser.delta} in the last 4 weeks)
              </p>
            ) : (
              <p className="text-ink-2">Hover or tap a bar to see that week.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
            {keys.map((k) => (
              <span key={k} className="flex items-center gap-1.5 text-[11px] text-ink-2 capitalize">
                <span className="size-2.5 rounded-sm" style={{ background: k === "other" ? otherColor : TYPE_COLOR[k] ?? "var(--ink-2)" }} />{k}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function PeopleList({ people }: { people: Person[] }) {
  const max = Math.max(1, ...people.map((p) => p.count));
  return (
    <section className="card p-5 md:col-span-2">
      <h2 className="font-display text-lg font-semibold">Your people</h2>
      <p className="text-xs text-ink-2 mt-0.5">Who appears most in your memories</p>
      {people.length === 0 ? (
        <p className="text-sm text-ink-2 py-8 text-center">Mention people by name in your notes to see them here.</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {people.map((p) => (
            <li key={p.id}>
              <Link href={`/people/${p.id}`} className="group block">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium truncate group-hover:text-ember">{p.name}</span>
                  <span className="text-xs text-ink-2 tabular-nums shrink-0 ml-2">{p.count}{p.last ? ` · ${relTime(p.last)}` : ""}</span>
                </div>
                <div className="h-2 rounded-full mt-1 overflow-hidden" style={{ background: "color-mix(in srgb, var(--ink-2) 12%, transparent)" }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(6, (p.count / max) * 100)}%`, background: "var(--c-person)" }} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
