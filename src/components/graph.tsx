"use client";
import { useEffect, useRef, useState } from "react";
import { MemorySheet } from "@/components/memory";
import { Spinner, Empty } from "@/components/ui";

const COLORS: Record<string, string> = {
  person: "#b45309", task: "#3b82f6", decision: "#8b5cf6", purchase: "#059669",
  idea: "#e8963f", event: "#0ea5e9", goal: "#d946ef", book: "#dc2626", default: "#a39a8c",
};

export function GraphClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "empty" | "ready">("loading");
  const [open, setOpen] = useState<string | null>(null);
  const sim = useRef<{ nodes: any[]; edges: any[]; w: number; h: number }>({ nodes: [], edges: [], w: 0, h: 0 });

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch("/api/graph");
      const data = await res.json();
      if (!alive) return;
      const nodes = data.nodes ?? [], edges = data.edges ?? [];
      if (!nodes.length) { setState("empty"); return; }
      const W = canvasRef.current!.parentElement!.clientWidth;
      const H = Math.min(620, Math.max(420, window.innerHeight * 0.6));
      const R = Math.min(W, H) / 3;
      sim.current = {
        nodes: nodes.map((n: any, i: number) => ({
          ...n, x: W / 2 + R * Math.cos((i / nodes.length) * 2 * Math.PI),
          y: H / 2 + R * Math.sin((i / nodes.length) * 2 * Math.PI), vx: 0, vy: 0,
          r: n.kind === "person" ? 9 : 5,
        })),
        edges, w: W, h: H,
      };
      // pre-settle the simulation so there's no per-frame jank on interaction
      for (let it = 0; it < 260; it++) step(sim.current.nodes, edges, W, H);
      draw(canvasRef.current!, sim.current, null);
      setState("ready");
    })();
    return () => { alive = false; };
  }, []);

  function nodeAt(x: number, y: number) {
    return sim.current.nodes.find((n) => (n.x - x) ** 2 + (n.y - y) ** 2 < (n.r + 6) ** 2);
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const hit = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
    if (hit) {
      if (hit.id.startsWith("person:")) window.location.href = `/people/${hit.id.slice(7)}`;
      else setOpen(hit.id);
    }
  }
  function handleHover(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const hit = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
    canvasRef.current!.style.cursor = hit ? "pointer" : "default";
    draw(canvasRef.current!, sim.current, hit ?? null);
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl">Memory graph</h1>
        <p className="text-sm text-ink-2 mt-1">People, purchases, decisions, books, ideas - and the lines between them. Click any node.</p>
      </header>
      {state === "loading" && <Spinner />}
      {state === "empty" && <Empty icon="⁂" title="Not enough memories yet." hint="The graph appears once you have some connected memories." />}
      <div className="card overflow-hidden">
        <canvas ref={canvasRef}
          className="w-full block"
          onClick={handleClick} onMouseMove={handleHover}
          style={{ display: state === "ready" ? "block" : "none" }}
        />
      </div>
      <MemorySheet id={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function step(N: any[], E: any[], W: number, H: number) {
  for (const n of N) { n.vx += (W / 2 - n.x) * 0.0004; n.vy += (H / 2 - n.y) * 0.0004; }
  for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) {
    const a = N[i], b = N[j];
    const dx = b.x - a.x, dy = b.y - a.y;
    const d2 = dx * dx + dy * dy || 1;
    const f = 1200 / d2;
    const d = Math.sqrt(d2);
    a.vx -= (dx / d) * f; a.vy -= (dy / d) * f;
    b.vx += (dx / d) * f; b.vy += (dy / d) * f;
  }
  for (const e of E) {
    const a = N.find((n) => n.id === e.a), b = N.find((n) => n.id === e.b);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const f = (d - 90) * 0.004;
    a.vx += (dx / d) * f; a.vy -= (dy / d) * f;
    b.vx -= (dx / d) * f; b.vy += (dy / d) * f;
  }
  for (const n of N) {
    n.vx *= 0.82; n.vy *= 0.82;
    n.x = Math.max(20, Math.min(W - 20, n.x + n.vx));
    n.y = Math.max(20, Math.min(H - 20, n.y + n.vy));
  }
}

function draw(canvas: HTMLCanvasElement, sim: any, hover: any | null) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = sim.w * dpr; canvas.height = sim.h * dpr;
  canvas.style.height = sim.h + "px";
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const dark = document.documentElement.classList.contains("dark");
  ctx.clearRect(0, 0, sim.w, sim.h);
  const index = new Map(sim.nodes.map((n: any) => [n.id, n]));
  ctx.strokeStyle = dark ? "#3a332a" : "#e6dfd2";
  ctx.lineWidth = 1;
  for (const e of sim.edges) {
    const a = index.get(e.a), b = index.get(e.b);
    if (!a || !b) continue;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.textAlign = "center";
  for (const n of sim.nodes) {
    ctx.fillStyle = COLORS[n.kind] ?? COLORS.default;
    ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
    if (n === hover || n.r >= 9) {
      ctx.fillStyle = dark ? "#ece7de" : "#1c1917";
      ctx.font = `${n === hover ? 12 : 10}px sans-serif`;
      ctx.fillText(n.label.slice(0, 22), n.x, n.y - n.r - 5);
    }
  }
}
