"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Empty, useToast } from "@/components/ui";
import { relTime } from "@/lib/dates";

interface Person { id: string; name: string; last_mentioned_at: string }

export function PeopleClient({ initial }: { initial: Person[] }) {
  const [people, setPeople] = useState(initial);
  const [mergeMode, setMergeMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [mergeName, setMergeName] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const selectedPeople = useMemo(
    () => people.filter((p) => selected.includes(p.id)),
    [people, selected]
  );

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = s.includes(id) ? s.filter((x) => x !== id) : [...s, id];
      // default the merged name to whichever selected person was mentioned most recently
      const chosen = people.filter((p) => next.includes(p.id))
        .sort((a, b) => +new Date(b.last_mentioned_at) - +new Date(a.last_mentioned_at))[0];
      setMergeName(chosen?.name ?? "");
      return next;
    });
  }

  function exitMergeMode() {
    setMergeMode(false); setSelected([]); setMergeName("");
  }

  async function startRename(p: Person) {
    setEditingId(p.id); setEditValue(p.name);
  }

  async function saveRename(id: string) {
    const name = editValue.trim();
    if (!name) { setEditingId(null); return; }
    const prev = people;
    setPeople((ps) => ps.map((p) => (p.id === id ? { ...p, name } : p))); // optimistic
    setEditingId(null);
    const res = await fetch(`/api/people/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setPeople(prev);
      toast(body?.error ?? "Couldn't rename - please try again.");
    }
  }

  async function removePerson(p: Person) {
    if (!confirm(`Remove "${p.name}"? Their memories stay in your timeline, just untagged.`)) return;
    const prev = people;
    setPeople((ps) => ps.filter((x) => x.id !== p.id)); // optimistic
    const res = await fetch(`/api/people/${p.id}`, { method: "DELETE" });
    if (!res.ok) { setPeople(prev); toast("Couldn't remove - please try again."); }
    else toast(`Removed "${p.name}".`);
  }

  async function confirmMerge() {
    if (selected.length < 2) return;
    setBusy(true);
    // keep whichever selected person has the most recent activity as the target row -
    // its id/history sticks around, everything else re-points to it
    const target = selectedPeople.slice().sort(
      (a, b) => +new Date(b.last_mentioned_at) - +new Date(a.last_mentioned_at)
    )[0];
    const sourceIds = selected.filter((id) => id !== target.id);
    try {
      const res = await fetch("/api/people/merge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: target.id, source_ids: sourceIds, name: mergeName.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast(body?.error ?? "Couldn't merge - please try again.");
        return;
      }
      const finalName = mergeName.trim() || target.name;
      setPeople((ps) => ps
        .filter((p) => !sourceIds.includes(p.id))
        .map((p) => (p.id === target.id ? { ...p, name: finalName } : p)));
      toast(`Merged into "${finalName}".`);
      exitMergeMode();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">People</h1>
          <p className="text-sm text-ink-2 mt-1">Built automatically from your memories. Only what you actually said.</p>
        </div>
        {people.length > 1 && (
          mergeMode ? (
            <button onClick={exitMergeMode} className="btn-ghost !text-xs shrink-0">Cancel</button>
          ) : (
            <button onClick={() => setMergeMode(true)} className="btn-ghost !text-xs shrink-0">
              Merge duplicates
            </button>
          )
        )}
      </header>

      {mergeMode && (
        <p className="text-sm text-ink-2 -mt-2">
          Select two or more people who are actually the same person (e.g. "Nico" and "Nico - my cousin"), then merge them.
        </p>
      )}

      {people.length > 0 ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {people.map((p) => {
            const isSelected = selected.includes(p.id);
            const card = (
              <div className={`card p-4 flex items-center gap-3 transition-colors ${mergeMode ? "cursor-pointer" : ""} ${isSelected ? "border-ember" : mergeMode ? "" : "hover:border-ember/50"}`}
                style={isSelected ? { background: "var(--ember-soft)" } : undefined}
                onClick={mergeMode ? () => toggleSelect(p.id) : undefined}>
                {mergeMode && (
                  <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(p.id)}
                    className="size-4 shrink-0 cursor-pointer" onClick={(e) => e.stopPropagation()} />
                )}
                <Avatar name={p.name} size={44} />
                <div className="min-w-0 flex-1">
                  {editingId === p.id ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => { if (e.key === "Enter") saveRename(p.id); if (e.key === "Escape") setEditingId(null); }}
                      onBlur={() => saveRename(p.id)}
                      className="input !py-1 !px-2 !text-base w-full"
                    />
                  ) : (
                    <p className="font-display text-lg truncate">{p.name}</p>
                  )}
                  <p className="text-xs text-ink-2">last mentioned {relTime(p.last_mentioned_at)}</p>
                </div>
                {!mergeMode && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); startRename(p); }}
                      aria-label={`Rename ${p.name}`} title="Rename"
                      className="btn-ghost !py-1 !px-1.5 !text-xs cursor-pointer">✎</button>
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); removePerson(p); }}
                      aria-label={`Remove ${p.name}`} title="Remove"
                      className="btn-ghost !py-1 !px-1.5 !text-xs cursor-pointer text-ink-2 hover:!text-[var(--danger)]">🗑</button>
                  </div>
                )}
              </div>
            );
            return mergeMode ? (
              <div key={p.id}>{card}</div>
            ) : (
              <Link key={p.id} href={`/people/${p.id}`}>{card}</Link>
            );
          })}
        </div>
      ) : <Empty icon="o" title="No people yet." hint="Mention someone by name and they'll appear here." />}

      {mergeMode && selected.length >= 2 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[90] card p-4 rise shadow-lg w-[min(92vw,28rem)]">
          <p className="label mb-2">Merge {selected.length} people into one</p>
          <div className="flex gap-2">
            <input value={mergeName} onChange={(e) => setMergeName(e.target.value)}
              placeholder="Name to keep" className="input flex-1 !py-2" />
            <button onClick={confirmMerge} disabled={busy} className="btn-primary !px-4">
              {busy ? "Merging..." : "Merge"}
            </button>
          </div>
          <p className="text-xs text-ink-2 mt-2">
            All their memories move to this one person. Nothing is deleted.
          </p>
        </div>
      )}
    </div>
  );
}
