"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MemoryList, type Memory } from "@/components/memory";
import { Spinner, Empty } from "@/components/ui";

const TYPES = ["task", "purchase", "idea", "decision", "goal", "book", "person", "event", "knowledge", "promise", "thought"];

export function TimelineClient({ initial }: { initial: Memory[] }) {
  const [items, setItems] = useState<Memory[]>(initial);
  const [cursor, setCursor] = useState<string | null>(initial.length === 20 ? initial[initial.length - 1].created_at : null);
  const [loading, setLoading] = useState(false);
  const [types, setTypes] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const sentinel = useRef<HTMLDivElement>(null);

  const load = useCallback(async (reset: boolean) => {
    setLoading(true);
    const p = new URLSearchParams({ limit: "20" });
    if (types.length) p.set("types", types.join(","));
    if (status) p.set("status", status);
    if (from) p.set("from", new Date(from).toISOString());
    if (!reset && cursor) p.set("cursor", cursor);
    try {
      const res = await fetch(`/api/memories?${p}`);
      const data = await res.json();
      setItems((prev) => reset ? data.memories : [...prev, ...data.memories]);
      setCursor(data.nextCursor);
    } finally { setLoading(false); }
  }, [types, status, from, cursor]);

  // debounce filter changes (skip the initial mount)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => load(true), 300);
    return () => clearTimeout(t);
  }, [types, status, from]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => {
      if (e[0].isIntersecting && cursor && !loading) load(false);
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loading, load]);

  const toggle = (t: string) => setTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl">Timeline</h1>
      <div className="card p-3 space-y-2.5">
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <button key={t} onClick={() => toggle(t)}
              className={`chip cursor-pointer ${types.includes(t) ? "!bg-ember !text-white !border-ember" : ""}`}>{t}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <select className="input !py-1.5 !text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option><option value="open">Open</option><option value="done">Done</option>
          </select>
          <input className="input !py-1.5 !text-xs" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        </div>
      </div>

      {items.length ? <MemoryList memories={items} /> :
        <Empty icon="◌" title="No memories match." hint="Try clearing filters - or capture something new." />}
      {cursor && (
        <div className="text-center">
          <button onClick={() => load(false)} disabled={loading} className="btn-ghost">
            {loading ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
      <div ref={sentinel} className="h-4" />
      {loading && <div className="text-center"><Spinner /></div>}
    </div>
  );
}
