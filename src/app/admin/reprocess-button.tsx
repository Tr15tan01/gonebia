"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReprocessButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/reprocess", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setMsg(d.error ?? "Failed.");
      else if (d.aiPaused) setMsg("The AI is still unavailable - fix the outage first.");
      else setMsg(`Sorted ${d.processed}${d.remaining ? `, ${d.remaining} left - run again` : " - all done"}.`);
      router.refresh();
    } catch {
      setMsg("Connection problem.");
    } finally { setBusy(false); }
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-ink-2">{msg}</span>}
      <button onClick={run} disabled={busy} className="btn-primary !py-1.5 !text-xs">
        {busy ? "Sorting…" : "Sort them now"}
      </button>
    </div>
  );
}
