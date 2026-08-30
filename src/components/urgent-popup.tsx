"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { playAlert } from "@/lib/sound";

interface UrgentItem { id: string; text: string; title: string; when: number }

const KEY = (id: string) => `gonebia-urgent-${id}`;
function snoozed(id: string) {
  try {
    const v = +(localStorage.getItem(KEY(id)) ?? 0);
    return v > Date.now();
  } catch { return false; }
}

/** Red dialog for tasks that are due now (in addition to system notifications).
 *  One task at a time; each dismissal is remembered per task.
 *  Plays an insistent alert sound when a due task first appears. */
export function UrgentPopup() {
  const [item, setItem] = useState<UrgentItem | null>(null);
  const router = useRouter();

  const poll = useCallback(async () => {
    try {
      const r = await fetch("/api/urgent");
      if (!r.ok) return;
      const d = await r.json();
      const next: UrgentItem | undefined = (d.items ?? []).find((i: UrgentItem) => !snoozed(i.id));
      setItem(next ?? null);
    } catch {}
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 45_000);
    return () => clearInterval(t);
  }, [poll]);

  // sound when a new urgent task first surfaces (not on every poll)
  useEffect(() => {
    if (item) playAlert();
  }, [item?.id]);

  function snooze(hours: number) {
    if (!item) return;
    try { localStorage.setItem(KEY(item.id), String(Date.now() + hours * 3600_000)); } catch {}
    setItem(null);
  }

  async function done() {
    if (!item) return;
    await fetch(`/api/memories/${item.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    snooze(24);
    router.refresh();
  }

  if (!item) return null;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => snooze(0.5)} />
      <div
        className="relative card w-full max-w-md p-5 rise"
        style={{ borderLeft: "4px solid var(--danger)", background: "var(--danger-soft)" }}
        role="alertdialog" aria-modal="true"
      >
        <p className="label flex items-center gap-2" style={{ color: "var(--danger)" }}>
          <span className="pulse-dot" /> Due now
        </p>
        <p className="task-hot mt-2 leading-snug">{item.text}</p>
        <p className="text-xs text-ink-2 mt-2">
          {new Date(item.when).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={done} className="btn-primary !py-1.5 !text-xs">Done</button>
          <button onClick={() => snooze(0.5)} className="btn-ghost !py-1.5 !text-xs">Snooze 30 min</button>
          <button onClick={() => snooze(6)} className="btn-ghost !py-1.5 !text-xs">Later today</button>
        </div>
      </div>
    </div>
  );
}
