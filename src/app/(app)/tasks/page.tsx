import { getUser, createClient } from "@/lib/supabase/server";
import { TasksClient } from "@/components/tasks";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const user = await getUser();
  const sb = await createClient();
  const { data } = await sb
    .from("memories")
    .select("id, original_text, created_at, memory_metadata(type, title, importance, status, due_at, people)")
    .is("deleted_at", null)
    .in("memory_metadata.type", ["task", "promise", "commitment"])
    .eq("memory_metadata.status", "open")
    .order("created_at", { ascending: false })
    .limit(200);

  const tasks = (data ?? []).map((m: any) => {
    const raw: unknown = m.memory_metadata;
    const meta = (Array.isArray(raw) ? raw[0] : raw) ?? {};
    return {
      id: m.id,
      text: m.original_text,
      created_at: m.created_at,
      type: meta.type ?? "task",
      title: meta.title ?? "",
      due_at: meta.due_at ?? null,
      people: meta.people ?? [],
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl">Tasks</h1>
        <p className="text-sm text-ink-2 mt-1">
          Everything you or someone else put on your plate - extracted automatically from what you tell Gonebia.
        </p>
      </header>
      <TasksClient initial={tasks} />
    </div>
  );
}
