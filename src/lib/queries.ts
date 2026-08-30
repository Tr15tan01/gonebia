import { createClient } from "@/lib/supabase/server";

export async function fetchTimeline(
  filters: { types?: string[]; status?: string; from?: string; to?: string },
  cursor?: string,
  limit = 20
) {
  const sb = await createClient();
  const metaFilter = !!(filters.types?.length || filters.status);
  // With a metadata filter we MUST use an inner join: PostgREST otherwise
  // filters only the embedded rows and returns every parent row, which made
  // the timeline filters appear broken.
  const embed = metaFilter
    ? "memory_metadata!inner(type, title, summary, importance, status, due_at, people, category)"
    : "memory_metadata(type, title, summary, importance, status, due_at, people, category)";

  let q = sb
    .from("memories")
    .select(`id, original_text, created_at, ${embed}`)
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

  return (data ?? []).map((m: any) => {
    const raw: unknown = m.memory_metadata;
    const meta = (Array.isArray(raw) ? raw[0] : raw) ?? {};
    return {
      id: m.id, original_text: m.original_text, created_at: m.created_at,
      type: meta.type ?? "thought", title: meta.title ?? "",
      summary: meta.summary ?? "", importance: meta.importance ?? 3,
      status: meta.status ?? "open", due_at: meta.due_at ?? null,
      people: meta.people ?? [],
    };
  });
}
