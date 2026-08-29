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

const DAY = 86_400_000;

export function TasksClient({ initial }: { initial: TaskRow[] }) {
  const [tasks, setTasks] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useToast();

  async function done(id: string) {
    setBusyId(id);
    const prev = tasks;
    setTasks((t) => t.filter((x) => x.id !== id)); // optimistic
    try {
      const res = await fetch(`/api/memories/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      if (!res.ok) throw new Error();
      toast("Done.");
    } catch {
      setTasks(prev); // restore on failure
      toast("Couldn't mark as done - please try again.");
    } finally { setBusyId(null); }
  }

  const now = Date.now();
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);

  const overdue = tasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < now);
  const today = tasks.filter((t) => t.due_at && new Date(t.due_at).getTime() >= now
    && new Date(t.due_at).getTime() <= endOfToday.getTime());
  const upcoming = tasks.filter((t) => t.due_at && new Date(t.due_at).getTime() > endOfToday.getTime());
  const someday = tasks.filter((t) => !t.due_at);

  if (tasks.length === 0) {
    return <Empty icon="☑" title="No open tasks." hint="Say 'I need to...' or 'my wife asked me to...' and it lands here." />;
  }

  return (
    <div className="space-y-6">
      {[
        { label: "Overdue", items: overdue, hot: true },
        { label: "Today", items: today, hot: false },
        { label: "Upcoming", items: upcoming, hot: false },
        { label: "No date", items: someday, hot: false },
      ].filter((g) => g.items.length > 0).map((group) => (
        <section key={group.label}>
          <h2 className={`label mb-2.5 ${group.hot ? "text-ember" : ""}`}>
            {group.label} <span className="normal-case">({group.items.length})</span>
          </h2>
          <ul className="space-y-2">
            {group.items.map((t) => (
              <li key={t.id} className={`card p-4 text-sm flex items-start justify-between gap-3 ${group.hot ? "border-ember/40" : ""}`}>
                <div className="min-w-0">
                  <p className="leading-snug">{t.text}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {t.due_at && <span className={`chip ${group.hot ? "!text-ember !border-ember/40" : ""}`}>due {relTime(t.due_at)}</span>}
                    {t.type !== "task" && <span className="chip">{t.type}</span>}
                    {t.people.slice(0, 2).map((p) => <span key={p} className="chip">{p}</span>)}
                  </div>
                </div>
                <button
                  onClick={() => done(t.id)}
                  disabled={busyId === t.id}
                  className="btn-primary !py-1.5 !px-3 !text-xs shrink-0"
                >Done</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
