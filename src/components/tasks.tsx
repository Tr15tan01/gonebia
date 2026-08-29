"use client";
import { useState } from "react";
import { useToast, Empty } from "@/components/ui";
import { relTime } from "@/lib/dates";

interface TaskRow {
  id: string;
  text: string;
  created_at: string;
  type: string;
  title: string;
  due_at: string | null;
  people: string[];
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
      label: "Overdue", edge: "edge-overdue", headerColor: "var(--danger)", hot: true,
      items: tasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < now),
    },
    {
      label: "Today", edge: "edge-today", headerColor: "var(--ember)", hot: true,
      items: tasks.filter((t) => t.due_at && new Date(t.due_at).getTime() >= now
        && new Date(t.due_at).getTime() <= endOfToday.getTime()),
    },
    {
      label: "Tomorrow", edge: "edge-tomorrow", headerColor: "var(--c-task)", hot: true,
      items: tasks.filter((t) => t.due_at && new Date(t.due_at).getTime() > endOfToday.getTime()
        && new Date(t.due_at).getTime() <= endOfTomorrow.getTime()),
    },
    {
      label: "Upcoming", edge: "", headerColor: "var(--ink-2)", hot: false,
      items: tasks.filter((t) => t.due_at && new Date(t.due_at).getTime() > endOfTomorrow.getTime()),
    },
    {
      label: "No date", edge: "", headerColor: "var(--ink-2)", hot: false,
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
          <h2 className="label mb-3" style={{ color: group.headerColor }}>
            {group.label} <span className="normal-case font-semibold">({group.items.length})</span>
          </h2>
          <ul className="space-y-2">
            {group.items.map((t) => (
              <li key={t.id}
                className={`card p-4 flex items-start justify-between gap-3 ${group.edge} ${group.hot ? "task-hot" : ""} ${group.label === "Overdue" ? "!bg-[var(--danger-soft)]" : ""}`}>
                <div className="min-w-0">
                  <p className="leading-snug">{t.text}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {t.due_at && (
                      <span className={`chip font-semibold ${group.label === "Overdue" ? "!text-[var(--danger)]" : group.label === "Today" ? "!text-ember" : group.label === "Tomorrow" ? "chip-c-task" : ""}`}
                        style={group.label === "Overdue" ? { color: "var(--danger)", borderColor: "color-mix(in srgb, var(--danger) 40%, transparent)" } : group.label === "Today" ? { borderColor: "color-mix(in srgb, var(--ember) 45%, transparent)" } : undefined}>
                        {group.label === "Overdue" ? "⚠ " : ""}{group.label === "Today" ? "today" : group.label === "Tomorrow" ? "tomorrow" : "due"} {relTime(t.due_at) !== group.label.toLowerCase() && relTime(t.due_at) !== "today" ? relTime(t.due_at) : ""}
                      </span>
                    )}
                    {t.type !== "task" && <span className="chip">{t.type}</span>}
                    {t.people.slice(0, 2).map((p) => <span key={p} className="chip chip-c-person">{p}</span>)}
                  </div>
                </div>
                <button
                  onClick={() => done(t.id)}
                  disabled={busyId === t.id}
                  className={`!py-1.5 !px-3 !text-xs shrink-0 ${group.hot ? "btn-primary" : "btn-ghost"}`}
                >Done</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
