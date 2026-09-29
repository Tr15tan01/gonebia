"use client";
import { useEffect, useRef, useState } from "react";
import { MemoryList, type Memory } from "@/components/memory";
import { Spinner, Empty } from "@/components/ui";

const SUGGESTIONS = [
  "things my wife asked me to do",
  "computers I considered buying",
  "everything related to my home office",
  "books I finished this year",
  "ideas similar to my app idea",
];

export function SearchClient() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Memory[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [corrections, setCorrections] = useState<{ from: string; to: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!q.trim()) { setResults(null); setCorrections([]); setError(null); return; }
    // a slower earlier response must never overwrite a newer one
    const ctl = new AbortController();
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=25`, { signal: ctl.signal });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? "Search failed - please try again."); setResults([]); return; }
        setError(null);
        setResults(data.results ?? []);
        setCorrections(data.corrections ?? []);
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") setError("Connection problem - please try again.");
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => { clearTimeout(timer.current); ctl.abort(); };
  }, [q]);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl">Search</h1>
      <input
        className="input !py-3 !text-base"
        placeholder="Search naturally - 'what did I buy last month?'"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      {!results && !loading && (
        <div className="space-y-1.5">
          <p className="label">Try asking</p>
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => setQ(s)} className="block text-sm text-ink-2 hover:text-ember">{s}</button>
          ))}
        </div>
      )}
      {loading && <div className="text-center py-4"><Spinner /></div>}
      {error && !loading && <p className="text-sm" style={{ color: "var(--danger)" }} role="alert">{error}</p>}
      {corrections.length > 0 && results && !loading && (
        <p className="text-sm text-ink-2 fade-up">
          Including results for{" "}
          {corrections.map((c, i) => (
            <span key={c.from}>{i > 0 && ", "}<span className="font-semibold text-ink">{c.to}</span> <span className="text-xs">(you typed “{c.from}”)</span></span>
          ))}
        </p>
      )}
      {results && !loading && (results.length
        ? <MemoryList memories={results} />
        : <Empty icon="◌" title="Nothing found." hint="Try different words - semantic search understands related meanings, but your memory only knows what you've told it." />)}
    </div>
  );
}
