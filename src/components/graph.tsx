"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MemorySheet } from "@/components/memory";
import { OrbitBlock } from "@/components/page-loader";
import { TYPE_COLOR, typeIcon } from "@/lib/type-style";
import { relTime } from "@/lib/dates";

interface GNode {
  id: string; label: string; kind: string; created_at?: string; importance?: number;
  x: number; y: number; vx: number; vy: number; r: number; degree: number;
}
interface GEdge { a: string; b: string; w: number; kind: string }
interface Person { id: string; name: string; count: number; last: string | null }
type TrendRow = Record<string, number | string>;

const H = 520;

function cssColor(el: HTMLElement, value: string): string {
  const m = value.match(/var\((--[^)]+)\)/);
  if (!m) return value;
  return getComputedStyle(el).getPropertyValue(m[1]).trim() || "#999";
}

/** Fruchterman-Reingold layout, pre-settled before the first paint. */
function layout(nodes: GNode[], edges: GEdge[], W: number) {
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const pairs = edges
    .map((e) => [idx.get(e.a), idx.get(e.b), e.w] as const)
    .filter((p): p is readonly [number, number, number] => p[0] != null && p[1] != null);
  const cx = W / 2, cy = H / 2;
  const k = Math.max(28, Math.sqrt((W * H) / Math.max(1, nodes.length)) * 0.6);
  let temp = W / 10;
  for (let it = 0; it < 300; it++) {
    for (const n of nodes) { n.vx = 0; n.vy = 0; }
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.5; }
        const f = (k * k) / d2; // unit * k²/d
        a.vx += dx * f; a.vy += dy * f;
        b.vx -= dx * f; b.vy -= dy * f;
      }
    }
    for (const [ai, bi, w] of pairs) {
      const a = nodes[ai], b = nodes[bi];
      const dx = a.x - b.x, dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d / k) * (0.6 + 0.6 * (w || 0.5)); // unit * d²/k
      a.vx -= dx * f; a.vy -= dy * f;
      b.vx += dx * f; b.vy += dy * f;
    }
    for (const n of nodes) {
      const g = n.degree ? 0.06 : 0.14;
      n.vx += (cx - n.x) * g * k * 0.05;
      n.vy += (cy - n.y) * g * k * 0.05;
      const len = Math.hypot(n.vx, n.vy) || 1;
      const step = Math.min(len, temp);
      n.x = Math.max(24, Math.min(W - 24, n.x + (n.vx / len) * step));
      n.y = Math.max(28, Math.min(H - 20, n.y + (n.vy / len) * step));
    }
    temp = Math.max(0.5, temp * 0.982);
  }
}

export function GraphClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "empty" | "ready" | "error">("loading");
  const [data, setData] = useState<{ nodes: GNode[]; edges: GEdge[]; people: Person[]; trend: TrendRow[]; trendTypes: string[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [onlyConnected, setOnlyConnected] = useState(true);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<GNode | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const view = useRef({ scale: 1, ox: 0, oy: 0, w: 600 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/graph", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const d = await res.json();
        if (!alive) return;
        const rawNodes = (d.nodes ?? []) as any[];
        if (!rawNodes.length) { setState("empty"); return; }
        const edges = (d.edges ?? []) as GEdge[];
        const degree = new Map<string, number>();
        for (const e of edges) { degree.set(e.a, (degree.get(e.a) ?? 0) + 1); degree.set(e.b, (degree.get(e.b) ?? 0) + 1); }
        const W = wrapRef.current?.clientWidth || 640;
        view.current.w = W;
        const nodes: GNode[] = rawNodes.map((n, i) => {
          const deg = degree.get(n.id) ?? 0;
          const ang = (i / rawNodes.length) * Math.PI * 2;
          const rad = Math.min(W, H) * (deg ? 0.22 : 0.4);
          return {
            ...n, degree: deg,
            x: W / 2 + rad * Math.cos(ang) + Math.random() * 6,
            y: H / 2 + rad * Math.sin(ang) + Math.random() * 6,
            vx: 0, vy: 0,
            r: n.kind === "person" ? 7 + Math.min(9, Math.sqrt(deg) * 2) : 4 + Math.min(7, Math.sqrt(deg) * 1.6),
          };
        });
        // let the loader paint before the heavy layout
        await new Promise((r) => setTimeout(r, 30));
        layout(nodes, edges, W);
        if (!alive) return;
        setData({ nodes, edges, people: d.people ?? [], trend: d.trend ?? [], trendTypes: d.trendTypes ?? [] });
        setState("ready");
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => { alive = false; };
  }, []);

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of data?.edges ?? []) {
      if (!m.has(e.a)) m.set(e.a, new Set());
      if (!m.has(e.b)) m.set(e.b, new Set());
      m.get(e.a)!.add(e.b); m.get(e.b)!.add(e.a);
    }
    return m;
  }, [data]);

  const kinds = useMemo(() => {
    const c = new Map<string, number>();
    for (const n of data?.nodes ?? []) c.set(n.kind, (c.get(n.kind) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  const visible = useCallback((n: GNode) => !hidden.has(n.kind) && (!onlyConnected || n.degree > 0), [hidden, onlyConnected]);

  const hubs = useMemo(() => (data?.nodes ?? []).filter((n) => n.degree > 0).sort((a, b) => b.degree - a.degree).slice(0, 6), [data]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set((data?.nodes ?? []).filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id));
  }, [query, data]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const W = view.current.w;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const { scale, ox, oy } = view.current;
    ctx.translate(ox, oy); ctx.scale(scale, scale);

    const active = hover?.id ?? focus;
    const near = active ? neighbors.get(active) ?? new Set<string>() : null;
    const isDim = (id: string) => (!!active && id !== active && !near!.has(id)) || (!!matches && !matches.has(id));
    const index = new Map(data.nodes.map((n) => [n.id, n]));
    const lineColor = cssColor(canvas, "var(--ink-2)");
    const inkColor = cssColor(canvas, "var(--ink)");
    const accent = cssColor(canvas, "var(--ember)");
    const paper = cssColor(canvas, "var(--card)");

    for (const e of data.edges) {
      const a = index.get(e.a), b = index.get(e.b);
      if (!a || !b || !visible(a) || !visible(b)) continue;
      const lit = !!active && (e.a === active || e.b === active);
      ctx.strokeStyle = lit ? accent : lineColor;
      ctx.globalAlpha = lit ? 0.9 : active ? 0.06 : 0.22;
      ctx.lineWidth = (lit ? 2 : 1) / scale;
      ctx.setLineDash(e.kind === "mentions" ? [3 / scale, 3 / scale] : []);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const n of data.nodes) {
      if (!visible(n)) continue;
      ctx.globalAlpha = isDim(n.id) ? 0.16 : 1;
      ctx.fillStyle = cssColor(canvas, TYPE_COLOR[n.kind] ?? "var(--ink-2)");
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      if (n.kind === "person") { ctx.strokeStyle = paper; ctx.lineWidth = 2 / scale; ctx.stroke(); }
      if (n.id === active || matches?.has(n.id)) {
        ctx.strokeStyle = accent; ctx.lineWidth = 2.5 / scale;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 3.5, 0, Math.PI * 2); ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = `600 ${11 / Math.max(0.8, scale)}px ui-sans-serif, system-ui, sans-serif`;
    for (const n of data.nodes) {
      if (!visible(n) || isDim(n.id)) continue;
      const important = n.kind === "person" || n.degree >= 4 || n.id === active || near?.has(n.id) || matches?.has(n.id);
      if (!important) continue;
      const text = n.label.length > 24 ? `${n.label.slice(0, 23)}…` : n.label;
      ctx.lineWidth = 3 / scale; ctx.strokeStyle = paper;
      ctx.strokeText(text, n.x, n.y - n.r - 4);
      ctx.fillStyle = inkColor;
      ctx.fillText(text, n.x, n.y - n.r - 4);
    }
  }, [data, hover, focus, neighbors, visible, matches]);

  useEffect(() => { if (state === "ready") draw(); }, [state, draw]);

  // keep crisp on resize and theme/accent changes
  useEffect(() => {
    if (state !== "ready" || !wrapRef.current) return;
    const ro = new ResizeObserver(() => {
      const w = wrapRef.current?.clientWidth ?? view.current.w;
      if (Math.abs(w - view.current.w) > 2) {
        view.current.ox += (w - view.current.w) / 2;
        view.current.w = w;
      }
      draw();
    });
    ro.observe(wrapRef.current);
    const mo = new MutationObserver(() => draw());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [state, draw]);

  function nodeAt(clientX: number, clientY: number): GNode | null {
    if (!data || !canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const { scale, ox, oy } = view.current;
    const px = (clientX - rect.left - ox) / scale, py = (clientY - rect.top - oy) / scale;
    let best: GNode | null = null, bestD = Infinity;
    for (const n of data.nodes) {
      if (!visible(n)) continue;
      const d = Math.hypot(n.x - px, n.y - py);
      if (d < n.r + 8 / scale && d < bestD) { best = n; bestD = d; }
    }
    return best;
  }

  const zoom = useCallback((factor: number, cx?: number, cy?: number) => {
    const v = view.current;
    const px = cx ?? v.w / 2, py = cy ?? H / 2;
    const next = Math.max(0.5, Math.min(3.5, v.scale * factor));
    v.ox = px - ((px - v.ox) * next) / v.scale;
    v.oy = py - ((py - v.oy) * next) / v.scale;
    v.scale = next;
    draw();
  }, [draw]);

  function reset() {
    view.current = { ...view.current, scale: 1, ox: 0, oy: 0 };
    setFocus(null); setQuery("");
    draw();
  }

  function centerOn(id: string) {
    const n = data?.nodes.find((x) => x.id === id);
    if (!n) return;
    const v = view.current;
    v.scale = Math.max(v.scale, 1.4);
    v.ox = v.w / 2 - n.x * v.scale;
    v.oy = H / 2 - n.y * v.scale;
    if (hidden.has(n.kind)) setHidden((h) => { const s = new Set(h); s.delete(n.kind); return s; });
    setFocus(id);
    draw();
    wrapRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function activate(n: GNode) {
    if (n.id.startsWith("person:")) window.location.href = `/people/${n.id.slice(7)}`;
    else setOpen(n.id);
  }

  // wheel zoom needs a non-passive listener
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || state !== "ready") return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, [state, zoom]);

  const visibleCount = (data?.nodes ?? []).filter(visible).length;
  const memCount = (data?.nodes ?? []).filter((n) => n.kind !== "person").length;
  const peopleCount = (data?.nodes ?? []).length - memCount;
  const focusNode = data?.nodes.find((n) => n.id === (hover?.id ?? focus)) ?? null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-bold">Memory graph</h1>
        <p className="text-sm text-ink-2 mt-1">How your memories, people and ideas connect. Hover to trace links, click to open, scroll or use the buttons to zoom.</p>
      </header>

      {state === "loading" && (
        <OrbitBlock title="Mapping connections" sub="Placing memories and people, then untangling the lines between them" height={H} />
      )}
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

      {/* the canvas wrapper exists from the start so its width is known for layout */}
      <div className={state === "ready" ? "space-y-3" : "h-0 overflow-hidden"} aria-hidden={state !== "ready"}>
        {data && (
          <div className="card p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input className="input !py-1.5 sm:!w-56" type="search" placeholder="Find a memory or person…"
                value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the graph" />
              <label className="flex items-center gap-1.5 text-xs text-ink-2 cursor-pointer select-none">
                <input type="checkbox" checked={onlyConnected} onChange={(e) => setOnlyConnected(e.target.checked)} className="accent-[var(--ember)]" />
                Only connected
              </label>
              <span className="text-xs text-ink-2 sm:ml-auto tabular-nums">
                {memCount} memories · {peopleCount} people · {data.edges.length} links · {visibleCount} shown
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
        )}

        <div ref={wrapRef} className="card overflow-hidden relative select-none" style={{ touchAction: "none" }}>
          <canvas ref={canvasRef} className="block w-full" style={{ cursor: "grab" }}
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY, ox: view.current.ox, oy: view.current.oy, moved: false };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (d) {
                const dx = e.clientX - d.x, dy = e.clientY - d.y;
                if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
                if (d.moved) {
                  view.current.ox = d.ox + dx; view.current.oy = d.oy + dy;
                  canvasRef.current!.style.cursor = "grabbing";
                  draw();
                  return;
                }
              }
              if (e.pointerType === "mouse") {
                const hit = nodeAt(e.clientX, e.clientY);
                canvasRef.current!.style.cursor = hit ? "pointer" : "grab";
                if (hit?.id !== hover?.id) setHover(hit);
              }
            }}
            onPointerUp={(e) => {
              const d = drag.current;
              drag.current = null;
              canvasRef.current!.style.cursor = "grab";
              if (d?.moved) return;
              const hit = nodeAt(e.clientX, e.clientY);
              if (!hit) { setFocus(null); return; }
              // touch: first tap previews, second tap opens
              if (e.pointerType !== "mouse" && focus !== hit.id) { setFocus(hit.id); return; }
              activate(hit);
            }}
            onPointerLeave={() => setHover(null)}
          />
          <div className="absolute right-3 top-3 flex flex-col gap-1.5">
            <button onClick={() => zoom(1.25)} className="btn-ghost !p-0 size-9 bg-card soft-shadow" aria-label="Zoom in">＋</button>
            <button onClick={() => zoom(1 / 1.25)} className="btn-ghost !p-0 size-9 bg-card soft-shadow" aria-label="Zoom out">－</button>
            <button onClick={reset} className="btn-ghost !p-0 size-9 bg-card soft-shadow" aria-label="Reset view">⟲</button>
          </div>
          {focusNode && (
            <div className="absolute left-3 bottom-3 right-16 sm:right-auto sm:max-w-xs card p-3 soft-shadow phase-in">
              <p className="text-[11px] font-semibold capitalize" style={{ color: TYPE_COLOR[focusNode.kind] ?? "var(--ink-2)" }}>
                {typeIcon(focusNode.kind)} {focusNode.kind}{focusNode.created_at ? ` · ${relTime(focusNode.created_at)}` : ""}
              </p>
              <p className="text-sm font-semibold leading-snug mt-0.5">{focusNode.label}</p>
              <p className="text-xs text-ink-2 mt-0.5">{focusNode.degree} connection{focusNode.degree === 1 ? "" : "s"}</p>
              <button onClick={() => activate(focusNode)} className="text-xs font-semibold text-ember mt-1.5 cursor-pointer hover:underline">
                {focusNode.kind === "person" ? "Open person" : "Open memory"}
              </button>
            </div>
          )}
        </div>
      </div>

      {state === "ready" && data && (
        <>
          {hubs.length > 0 && (
            <section>
              <h2 className="font-display text-lg font-semibold mb-2">Most connected</h2>
              <div className="flex flex-wrap gap-2">
                {hubs.map((n) => (
                  <button key={n.id} onClick={() => centerOn(n.id)}
                    className={`chip cursor-pointer !py-1 !px-3 !text-sm gap-1.5 ${focus === n.id ? "!border-ember !text-ember" : ""}`}>
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
