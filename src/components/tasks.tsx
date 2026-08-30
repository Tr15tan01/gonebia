"use client";
import { useState } from "react";
import { useToast, Empty } from "@/components/ui";
import { relTime } from "@/lib/dates";
import { TimeChip } from "@/components/time-chip";

interface TaskRow {
  id: string; text: string; created_at: string;
  type: string; title: string; due_at: string | null; people: string[];
}

export function TasksClient({ initial }: { initial: TaskRow[] }) {
  const [tasks, setTasks] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useToast();

  async function done(id: string) {
    setBusyId(id);
    const prev = tasks;
    setTasks((t) => t.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/memories/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      if (!res.ok) throw new Error();
      toast("Done.");
    } catch {
      setTasks(prev);
      toast("Couldn't mark as done - please try again.");
    } finally { setBusyId(null); }
  }

  const now = Date.now();
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
  const endOfTomorrow = new Date(endOfToday.getTime() + 86_400_000);

  const groups = [
    {
      label: "Due now", edge: "edge-overdue", headerColor: "var(--danger)", hot: true, pulse: true,
      bg: "var(--danger-soft)",
      items: tasks.filter((t) => t.due_at !== null
        && new Date(t.due_at).getTime() <= now + 15 * 60_000
        && new Date(t.due_at).getTime() >= now - 24 * 3600_000),
    },
    {
      label: "Overdue", edge: "edge-overdue", headerColor: "var(--danger)", hot: true, pulse: false,
      bg: undefined,
      items: tasks.filter((t) => t.due_at !== null && new Date(t.due_at).getTime() < now - 24 * 3600_000),
    },
    {
      label: "Today", edge: "edge-today", headerColor: "var(--ember)", hot: true, pulse: false,
      bg: undefined,
      items: tasks.filter((t) => t.due_at && new Date(t.due_at).getTime() > now + 15 * 60_000
        && new Date(t.due_at).getTime() <= endOfToday.getTime()),
    },
    {
      label: "Tomorrow", edge: "edge-tomorrow", headerColor: "var(--c-task)", hot: true, pulse: false,
      bg: undefined,
      items: tasks.filter((t) => t.due_at && new Date(t.due_at).getTime() > endOfToday.getTime()
        && new Date(t.due_at).getTime() <= endOfTomorrow.getTime()),
    },
    {
      label: "Upcoming", edge: "", headerColor: "var(--ink-2)", hot: false, pulse: false,
      bg: undefined,
      items: tasks.filter((t) => t.due_at && new Date(t.due_at).getTime() > endOfTomorrow.getTime()),
    },
    {
      label: "No date", edge: "", headerColor: "var(--ink-2)", hot: false, pulse: false,
      bg: undefined,
      items: tasks.filter((t) => !t.due_at),
    },
  ].filter((g) => g.items.length > 0);

  if (tasks.length === 0) {
    return <Empty icon="☑" title="No open tasks." hint="Say 'I need to...' or 'my wife asked me to...' and it lands here." />;
  }

  return (
    <div className="space-y-7">
      {groups.map((group) => (
        <section key={group.label}>
          <h2 className="label mb-3 flex items-center gap-2" style={{ color: group.headerColor }}>
            {group.pulse && <span className="pulse-dot" />}
            {group.label} <span className="normal-case font-semibold">({group.items.length})</span>
          </h2>
          <ul className="space-y-2">
            {group.items.map((t) => (
              <li key={t.id}
                className={`card p-4 flex items-start justify-between gap-3 ${group.edge} ${group.hot ? "task-hot" : ""}`}
                style={group.bg ? { background: group.bg } : undefined}>
                <div className="min-w-0">
                  <p className="leading-snug">{t.text}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {t.due_at && (
                      <TimeChip iso={t.due_at}
                        prefix={group.label === "Due now" ? "⚠ now " : group.label === "Overdue" ? "overdue " : "due "} />
                    )}
                    {t.type !== "task" && <span className="chip">{t.type}</span>}
                    {t.people.slice(0, 2).map((p) => <span key={p} className="chip chip-c-person">{p}</span>)}
                  </div>
                </div>
                <button
                  onClick={() => done(t.id)}
                  disabled={busyId === t.id}
                  className="btn !py-1.5 !px-3 !text-xs shrink-0 text-white"
                  style={{ background: "var(--danger)" }}
                >Done</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
