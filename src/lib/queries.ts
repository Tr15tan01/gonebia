import { createClient } from "@/lib/supabase/server";

export async function fetchTimeline(
  filters: { types?: string[]; status?: string; from?: string; to?: string },
  cursor?: string,
  limit = 20
) {
  const sb = await createClient();
  let q = sb
    .from("memories")
    .select("id, original_text, created_at, memory_metadata(type, title, summary, importance, status, due_at, people, category)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (cursor) q = q.lt("created_at", cursor);
  if (filters.types?.length) q = q.in("memory_metadata.type", filters.types);
  if (filters.status) q = q.eq("memory_metadata.status", filters.status);
  if (filters.from) q = q.gte("created_at", filters.from);
  if (filters.to) q = q.lte("created_at", filters.to);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((m: any) => ({
    id: m.id, original_text: m.original_text, created_at: m.created_at,
    type: m.memory_metadata?.type ?? "thought", title: m.memory_metadata?.title ?? "",
    summary: m.memory_metadata?.summary ?? "", importance: m.memory_metadata?.importance ?? 3,
    status: m.memory_metadata?.status ?? "open", due_at: m.memory_metadata?.due_at ?? null,
    people: m.memory_metadata?.people ?? [],
  }));
}
