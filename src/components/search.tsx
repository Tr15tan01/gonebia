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
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!q.trim()) { setResults(null); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=25`);
        const data = await res.json();
        setResults(data.results ?? []);
      } finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(timer.current);
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
      {results && !loading && (results.length
        ? <MemoryList memories={results} />
        : <Empty icon="◌" title="Nothing found." hint="Try different words - semantic search understands related meanings, but your memory only knows what you've told it." />)}
    </div>
  );
}
