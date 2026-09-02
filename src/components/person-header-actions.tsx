"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui";

export function PersonHeaderActions({ id, name }: { id: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();

  async function save() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) { setEditing(false); setValue(name); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/people/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast(body?.error ?? "Couldn't rename - please try again.");
        setValue(name);
      } else {
        setEditing(false);
        router.refresh();
      }
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm(`Remove "${name}"? Their memories stay in your timeline, just untagged.`)) return;
    setBusy(true);
    const res = await fetch(`/api/people/${id}`, { method: "DELETE" });
    if (!res.ok) { toast("Couldn't remove - please try again."); setBusy(false); return; }
    router.push("/people");
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditing(false); setValue(name); } }}
          className="input !py-1.5 !text-sm" />
        <button onClick={save} disabled={busy} className="btn-ghost !py-1 !px-2 !text-xs">Save</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button onClick={() => setEditing(true)} title="Rename" aria-label={`Rename ${name}`}
        className="btn-ghost !py-1 !px-2 !text-xs cursor-pointer">✎ Rename</button>
      <button onClick={remove} disabled={busy} title="Remove" aria-label={`Remove ${name}`}
        className="btn-ghost !py-1 !px-2 !text-xs cursor-pointer text-ink-2 hover:!text-[var(--danger)]">🗑 Remove</button>
    </div>
  );
}
