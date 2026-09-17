"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sheet, useToast } from "@/components/ui";
import { ResearchResult, type RunLike } from "@/components/research-result";
import { OrbitBlock } from "@/components/page-loader";
import { relTime } from "@/lib/dates";

type Source = "research" | "deep_research" | "note" | "link" | "quote";

interface Entry {
  id: string; source: Source; title: string; summary: string; url: string | null;
  tags: string[]; pinned: boolean; created_at: string; sources_count?: number; confidence?: string | null;
}

const SOURCE: Record<Source, { label: string; plural: string; icon: string; color: string }> = {
  deep_research: { label: "Deep report", plural: "Deep reports", icon: "🔭", color: "var(--c-know)" },
  research: { label: "Research", plural: "Research", icon: "🔎", color: "var(--c-idea)" },
  note: { label: "Note", plural: "Notes", icon: "📝", color: "var(--c-task)" },
  link: { label: "Link", plural: "Links", icon: "🔗", color: "var(--c-ask)" },
  quote: { label: "Quote", plural: "Quotes", icon: "❝", color: "var(--c-movie)" },
};
const ORDER: Source[] = ["deep_research", "research", "note", "link", "quote"];

function host(u: string) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}

export function KnowledgeClient({ initialOpen }: { initialOpen: string | null }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [topTags, setTopTags] = useState<{ tag: string; count: number }[]>([]);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [filter, setFilter] = useState<Source | "all">("all");
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialOpen);
  const [researchTopic, setResearchTopic] = useState("");
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const d = await fetch("/api/knowledge", { cache: "no-store" }).then((r) => r.json());
      setEntries(d.entries ?? []);
      setCounts(d.counts ?? {});
      setTopTags(d.topTags ?? []);
      setSetupNeeded(!!d.setupNeeded);
    } catch { setEntries([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (openId) url.searchParams.set("open", openId); else url.searchParams.delete("open");
    window.history.replaceState(null, "", url.toString());
  }, [openId]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (entries ?? []).filter((e) =>
      (filter === "all" || e.source === filter)
      && (!tag || e.tags.includes(tag))
      && (!needle || `${e.title} ${e.summary} ${e.tags.join(" ")} ${e.url ?? ""}`.toLowerCase().includes(needle)));
  }, [entries, filter, tag, q]);

  const openEntry = entries?.find((e) => e.id === openId) ?? null;

  async function togglePin(e: Entry) {
    setEntries((list) => (list ?? []).map((x) => (x.id === e.id ? { ...x, pinned: !x.pinned } : x)));
    await fetch("/api/knowledge", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: e.id, source: e.source, pinned: !e.pinned }),
    });
  }

  async function remove(e: Entry) {
    if (!confirm(`Delete “${e.title}” from your knowledge base?`)) return;
    setEntries((list) => (list ?? []).filter((x) => x.id !== e.id));
    setOpenId(null);
    await fetch(`/api/knowledge?id=${e.id}&source=${e.source}`, { method: "DELETE" });
    load();
  }

  const researchTotal = (counts.research ?? 0) + (counts.deep_research ?? 0);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-bold">Knowledge base</h1>
        <p className="text-sm text-ink-2">Everything you've researched, plus notes, links and quotes worth keeping.</p>
      </header>

      {setupNeeded && (
        <div className="card p-4 text-sm" style={{ background: "var(--danger-soft)" }} role="alert">
          Part of the knowledge base isn't set up yet. Run <code>supabase/migrations/0023_timelymemo_v2.sql</code> in Supabase.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="stat-tile sm:col-span-2" style={{ "--tile": "var(--c-know)" } as React.CSSProperties}>
          <span className="text-xs font-semibold text-ink-2">Topics researched</span>
          <div className="flex items-end justify-between gap-3">
            <p className="stat-value">{entries ? researchTotal : "–"}</p>
            <p className="text-[11px] text-ink-2 text-right">{counts.deep_research ?? 0} deep reports<br />{counts.research ?? 0} quick answers</p>
          </div>
        </div>
        {(["note", "link"] as Source[]).map((s) => (
          <button key={s} onClick={() => setFilter(filter === s ? "all" : s)} className="stat-tile text-left cursor-pointer"
            style={{ "--tile": SOURCE[s].color } as React.CSSProperties} aria-pressed={filter === s}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-2">{SOURCE[s].plural}</span>
              <span className="stat-icon" aria-hidden>{SOURCE[s].icon}</span>
            </div>
            <p className="stat-value">{entries ? counts[s] ?? 0 : "–"}</p>
          </button>
        ))}
      </div>

      <div className="card p-4 flex flex-col sm:flex-row gap-2">
        <input className="input" placeholder="Research a new topic…" value={researchTopic} maxLength={500}
          onChange={(e) => setResearchTopic(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && researchTopic.trim()) router.push(`/agents?q=${encodeURIComponent(researchTopic.trim())}`); }} />
        <div className="flex gap-2 shrink-0">
          <Link href={`/agents?q=${encodeURIComponent(researchTopic.trim())}`} className="btn-tint flex-1" style={{ "--tint": "var(--c-idea)" } as React.CSSProperties}>🔎 Research</Link>
          <Link href={`/agents?tab=deep_research&q=${encodeURIComponent(researchTopic.trim())}`} className="btn-tint flex-1" style={{ "--tint": "var(--c-know)" } as React.CSSProperties}>🔭 Deep</Link>
          <button onClick={() => setAdding((a) => !a)} className="btn-primary flex-1" aria-expanded={adding}>{adding ? "Close" : "＋ Add"}</button>
        </div>
      </div>

      {adding && <AddForm onSaved={(e) => { setAdding(false); setEntries((list) => [e, ...(list ?? [])]); load(); }} />}

      <div className="space-y-2.5">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input className="input sm:max-w-xs !py-2" type="search" placeholder="Search your knowledge…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search knowledge base" />
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setFilter("all")} className={`chip cursor-pointer ${filter === "all" ? "!bg-ink !text-paper !border-ink" : ""}`}>All {counts.all ?? ""}</button>
            {ORDER.map((s) => (counts[s] ?? 0) > 0 && (
              <button key={s} onClick={() => setFilter(filter === s ? "all" : s)}
                className="chip cursor-pointer" aria-pressed={filter === s}
                style={filter === s ? { background: SOURCE[s].color, color: "#fff", borderColor: SOURCE[s].color } : { color: SOURCE[s].color }}>
                {SOURCE[s].icon} {SOURCE[s].plural} {counts[s]}
              </button>
            ))}
          </div>
        </div>
        {topTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-ink-2 mr-1">Tags</span>
            {topTags.map((t) => (
              <button key={t.tag} onClick={() => setTag(tag === t.tag ? null : t.tag)}
                className={`chip cursor-pointer !text-[11px] ${tag === t.tag ? "!bg-ember !text-white !border-ember" : ""}`}>#{t.tag} <span className="opacity-60 ml-1">{t.count}</span></button>
            ))}
          </div>
        )}
      </div>

      {entries === null ? (
        <OrbitBlock title="Opening your knowledge base" sub="Gathering reports, notes and links" height={300} />
      ) : shown.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3" aria-hidden>🧠</div>
          <p className="font-semibold">{entries.length === 0 ? "Your knowledge base is empty" : "Nothing matches"}</p>
          <p className="text-sm text-ink-2 mt-1 max-w-sm mx-auto">
            {entries.length === 0
              ? "Run a research agent or add a note, link or quote - everything you learn collects here."
              : "Try another search, tag or filter."}
          </p>
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-2.5">
          {shown.map((e) => {
            const st = SOURCE[e.source];
            return (
              <li key={e.id} className="card overflow-hidden flex flex-col" style={{ borderTop: `3px solid ${st.color}` }}>
                <button onClick={() => setOpenId(e.id)} className="p-4 text-left cursor-pointer flex-1 hover:bg-paper-2 transition-colors">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: st.color }}>
                    <span aria-hidden>{st.icon}</span>{st.label}
                    {e.pinned && <span className="text-ember ml-1" title="Pinned">★</span>}
                    <span className="ml-auto font-normal text-ink-2">{relTime(e.created_at)}</span>
                  </div>
                  <p className="font-semibold mt-1.5 leading-snug line-clamp-2">{e.title}</p>
                  {e.summary && <p className="text-sm text-ink-2 mt-1 line-clamp-3 leading-snug">{e.source === "quote" ? `“${e.summary}”` : e.summary}</p>}
                  <div className="flex flex-wrap items-center gap-1 mt-2.5">
                    {e.url && <span className="chip !text-[10px]">{host(e.url)}</span>}
                    {!!e.sources_count && <span className="chip !text-[10px]">{e.sources_count} sources</span>}
                    {e.tags.slice(0, 3).map((t) => <span key={t} className="chip !text-[10px]">#{t}</span>)}
                  </div>
                </button>
                <div className="flex border-t border-line text-xs">
                  <button onClick={() => togglePin(e)} className="flex-1 py-2 cursor-pointer hover:bg-paper-2 text-ink-2">{e.pinned ? "★ Unpin" : "☆ Pin"}</button>
                  <Link href={`/chat?q=${encodeURIComponent(`What do I know about ${e.title}?`.slice(0, 170))}`} className="flex-1 py-2 text-center hover:bg-paper-2 text-ink-2 border-l border-line">Ask about it</Link>
                  <button onClick={() => remove(e)} className="flex-1 py-2 cursor-pointer hover:bg-paper-2 text-ink-2 hover:text-danger border-l border-line">Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={!!openId} onClose={() => setOpenId(null)}>
        {openId && (
          <EntryDetail
            id={openId}
            entry={openEntry}
            onDelete={openEntry ? () => remove(openEntry) : undefined}
            onTagsSaved={load}
          />
        )}
      </Sheet>
    </div>
  );
}

function AddForm({ onSaved }: { onSaved: (e: Entry) => void }) {
  const [kind, setKind] = useState<"note" | "link" | "quote">("note");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  async function save() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, title, content, url, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? "Couldn't save."); return; }
      toast("Added to your knowledge base.");
      onSaved(d.entry);
    } finally { setBusy(false); }
  }

  const ready = kind === "link" ? !!url.trim() : !!content.trim();

  return (
    <div className="card p-5 space-y-3 rise soft-shadow">
      <div className="flex gap-1.5" role="radiogroup" aria-label="Type">
        {(["note", "link", "quote"] as const).map((k) => (
          <button key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
            className="chip cursor-pointer !py-1 !px-3 !text-sm"
            style={kind === k ? { background: SOURCE[k].color, color: "#fff", borderColor: SOURCE[k].color } : undefined}>
            {SOURCE[k].icon} {SOURCE[k].label}
          </button>
        ))}
      </div>
      {kind === "link" && (
        <input className="input" type="url" inputMode="url" placeholder="https://… (title is fetched automatically)" value={url} onChange={(e) => setUrl(e.target.value)} />
      )}
      <input className="input" maxLength={160} placeholder={kind === "quote" ? "Who said it / where it's from" : kind === "link" ? "Title (optional)" : "Title (optional)"}
        value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="input resize-y" rows={kind === "note" ? 5 : 3} maxLength={8000}
        placeholder={kind === "quote" ? "The quote" : kind === "link" ? "Why it's worth keeping (optional)" : "What you want to remember"}
        value={content} onChange={(e) => setContent(e.target.value)} />
      <input className="input" placeholder="Tags, comma separated - e.g. health, sleep" value={tags} onChange={(e) => setTags(e.target.value)} />
      {error && <p className="text-sm" style={{ color: "var(--danger)" }} role="alert">{error}</p>}
      <button onClick={save} disabled={!ready || busy} className="btn-primary w-full">{busy ? "Saving…" : `Save ${SOURCE[kind].label.toLowerCase()}`}</button>
    </div>
  );
}

function EntryDetail({ id, entry, onDelete, onTagsSaved }: { id: string; entry: Entry | null; onDelete?: () => void; onTagsSaved: () => void }) {
  const [run, setRun] = useState<RunLike | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [tagDraft, setTagDraft] = useState("");
  const isRun = !entry || entry.source === "research" || entry.source === "deep_research";
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    setTagDraft(entry?.tags.join(", ") ?? "");
    if (!isRun) { setState("ready"); return; }
    let alive = true;
    setState("loading");
    fetch(`/api/agents?id=${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!alive) return;
      if (d?.run) { setRun(d.run); setState("ready"); } else setState(entry ? "ready" : "missing");
    }).catch(() => alive && setState("missing"));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isRun, entry?.id]);

  async function saveTags() {
    if (!entry) return;
    await fetch("/api/knowledge", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id, source: entry.source, tags: tagDraft.split(",").map((t) => t.trim()).filter(Boolean) }),
    });
    toast("Tags saved.");
    onTagsSaved();
  }

  if (state === "loading") return <div className="py-10"><OrbitBlock title="Opening" height={200} /></div>;
  if (state === "missing") return <p className="py-8 text-center text-ink-2">This item no longer exists.</p>;

  return (
    <div className="space-y-5 pt-2">
      {isRun && run ? (
        <ResearchResult run={run} compact={false}
          onFollowUp={(q) => router.push(`/agents?tab=${run.kind === "deep_research" ? "deep_research" : "research"}&q=${encodeURIComponent(q)}`)} />
      ) : entry ? (
        <article className="space-y-3">
          <p className="text-xs font-semibold" style={{ color: SOURCE[entry.source].color }}>{SOURCE[entry.source].icon} {SOURCE[entry.source].label} · {relTime(entry.created_at)}</p>
          <h2 className="font-display text-2xl font-bold leading-tight pr-6">{entry.title}</h2>
          {entry.url && (
            <a href={entry.url} target="_blank" rel="noopener noreferrer" className="btn-tint !py-1.5 !text-xs w-fit" style={{ "--tint": "var(--c-ask)" } as React.CSSProperties}>
              Open {host(entry.url)}
            </a>
          )}
          {entry.summary && (
            entry.source === "quote"
              ? <blockquote className="font-display text-xl leading-snug border-l-4 pl-4" style={{ borderColor: "var(--c-movie)" }}>{entry.summary}</blockquote>
              : <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{entry.summary}</p>
          )}
        </article>
      ) : null}

      {entry && (
        <div className="pt-4 border-t border-line space-y-3">
          <label className="block text-sm">
            <span className="font-medium">Tags</span>
            <div className="flex gap-2 mt-1">
              <input className="input !py-1.5" value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder="comma, separated" />
              <button onClick={saveTags} className="btn-ghost !py-1.5 !text-xs shrink-0">Save tags</button>
            </div>
          </label>
          <div className="flex flex-wrap gap-2">
            {isRun && run?.kind === "research" && (
              <Link href={`/agents?tab=deep_research&q=${encodeURIComponent(run.input)}`} className="btn-tint !py-1.5 !text-xs" style={{ "--tint": "var(--c-know)" } as React.CSSProperties}>🔭 Go deeper</Link>
            )}
            <Link href={`/chat?q=${encodeURIComponent(`What do I know about ${entry.title}?`.slice(0, 170))}`} className="btn-ghost !py-1.5 !text-xs">Ask my memory about it</Link>
            {onDelete && <button onClick={onDelete} className="btn-ghost !py-1.5 !text-xs !text-danger ml-auto">Delete</button>}
          </div>
        </div>
      )}
    </div>
  );
}
