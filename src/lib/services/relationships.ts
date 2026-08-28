export const MemoryRelationshipService = {
  /** Memories explicitly linked as "similar"/"cluster" to a given memory, newest/most-similar first. */
  async relatedFor(sb: any, memoryId: string) {
    const { data: rels } = await sb
      .from("memory_relationships")
      .select("from_memory_id, to_memory_id, kind, score")
      .or(`from_memory_id.eq.${memoryId},to_memory_id.eq.${memoryId}`)
      .order("score", { ascending: false })
      .limit(12);
    if (!rels?.length) return [];
    const ids = rels.map((r: any) => (r.from_memory_id === memoryId ? r.to_memory_id : r.from_memory_id));
    const { data } = await sb
      .from("memories")
      .select("id, original_text, created_at, memory_metadata(title, type)")
      .in("id", ids);
    return (data ?? []).map((m: any) => ({
      id: m.id,
      title: m.memory_metadata?.title || m.original_text.slice(0, 60),
      type: m.memory_metadata?.type,
      created_at: m.created_at,
      kind: rels.find((r: any) => (r.from_memory_id === memoryId ? r.to_memory_id : r.from_memory_id) === m.id)?.kind,
    }));
  },
};
