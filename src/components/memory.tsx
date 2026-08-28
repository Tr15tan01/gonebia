"use client";
import { useEffect, useState } from "react";
import { Sheet, useToast } from "@/components/ui";
import { relTime, fmtDate } from "@/lib/dates";

export interface Memory {
  id: string; original_text: string; created_at: string;
  type: string; title: string; summary: string;
  importance: number; status: string; due_at: string | null; people: string[];
}

export function MemoryCard({ memory, onOpen }: { memory: Memory; onOpen?: () => void }) {
  return (
    <button onClick={onOpen} className="card p-4 text-left w-full hover:border-ember/50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] leading-snug">{memory.original_text}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="chip">{memory.type}</span>
            {memory.status === "open" && (memory.type === "task" || memory.type === "promise") && <span className="chip !text-ember !border-ember/40">open</span>}
            {memory.due_at && <span className="chip">due {relTime(memory.due_at)}</span>}
            {memory.people.slice(0, 2).map((p) => <span key={p} className="chip">{p}</span>)}
            {memory.importance >= 4 && <span className="chip !text-ember !border-ember/40">★</span>}
          </div>
        </div>
        <span className="text-xs text-ink-2 whitespace-nowrap">{relTime(memory.created_at)}</span>
      </div>
    </button>
  );
}

export function MemoryList({ memories }: { memories: Memory[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <>
      <div className="space-y-2.5">
        {memories.map((m) => <MemoryCard key={m.id} memory={m} onOpen={() => setOpenId(m.id)} />)}
      </div>
      <MemorySheet id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

export function MemorySheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [memory, setMemory] = useState<Memory | null>(null);
  const [related, setRelated] = useState<{ id: string; title: string; type?: string; created_at: string; kind?: string }[]>([]);
  const [mergeTarget, setMergeTarget] = useState("");
  const toast = useToast();

  useEffect(() => {
    if (!id) { setMemory(null); setRelated([]); return; }
    let alive = true;
    (async () => {
      const [mRes, rRes] = await Promise.all([
        fetch(`/api/memories/${id}`),
        fetch(`/api/memories/${id}/related`),
      ]);
      const mData = await mRes.json();
      const rData = await rRes.json();
      if (!alive) return;
      setMemory(mData.memory ?? null);
      setRelated(rData.related ?? []);
    })();
    return () => { alive = false; };
  }, [id]);

  async function act(action: "done" | "delete" | "merge") {
    if (!id) return;
    if (action === "done") {
      await fetch(`/api/memories/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "done" }) });
      toast("Marked as done.");
    } else if (action === "delete") {
      await fetch(`/api/memories/${id}`, { method: "DELETE" });
      toast("Memory deleted.");
      onClose();
    } else if (action === "merge" && mergeTarget) {
      await fetch(`/api/memories/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "archived" }) });
      toast("Merged - the duplicate is archived, the original is kept.");
      onClose();
    }
  }

  return (
    <Sheet open={!!id} onClose={onClose}>
      {!memory ? <p className="text-ink-2 text-sm">Loading...</p> : (
        <div className="space-y-4">
          <p className="font-display text-lg leading-snug">{memory.original_text}</p>
          <div className="flex flex-wrap gap-1.5">
            <span className="chip">{memory.type}</span>
            <span className="chip">importance {memory.importance}/5</span>
            <span className="chip">{fmtDate(memory.created_at)}</span>
            {memory.status !== "open" && <span className="chip">{memory.status}</span>}
          </div>

          <div>
            <p className="label mb-1.5">Connected memories</p>
            {related.length ? (
              <ul className="space-y-1.5">
                {related.map((r) => (
                  <li key={r.id} className="text-sm text-ink-2">
                    <span className="text-ink">{r.title}</span> · {relTime(r.created_at)} {r.kind ? `· ${r.kind}` : ""}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-2">No connections found yet.</p>}
          </div>

          {related.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <select className="input !py-1.5 !text-xs" value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)}>
                <option value="">Merge into... (mark as duplicate of)</option>
                {related.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
              <button onClick={() => act("merge")} disabled={!mergeTarget} className="btn-ghost !py-1.5 !text-xs">Merge</button>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {memory.status === "open" && <button onClick={() => act("done")} className="btn-primary !py-1.5 !text-xs">Mark done</button>}
            <button onClick={() => act("delete")} className="btn-ghost !py-1.5 !text-xs !text-red-600 dark:!text-red-400">Delete</button>
          </div>
          <p className="text-xs text-ink-2">AI metadata is a suggestion - your original words above are always kept exactly as written.</p>
        </div>
      )}
    </Sheet>
  );
}
