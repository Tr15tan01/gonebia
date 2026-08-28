import { NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();

  const [memsRes, relsRes, pplRes, mpRes] = await Promise.all([
    sb.from("memories").select("id, created_at, memory_metadata(type, title)")
      .is("deleted_at", null).order("created_at", { ascending: false }).limit(80),
    sb.from("memory_relationships").select("from_memory_id, to_memory_id, kind, score").limit(300),
    sb.from("people").select("id, name").order("last_mentioned_at", { ascending: false }).limit(20),
    sb.from("memory_people").select("memory_id, person_id").limit(300),
  ]);

  const nodes = [
    ...(memsRes.data ?? []).map((m: any) => ({
      id: m.id, label: m.memory_metadata?.title || "...", kind: m.memory_metadata?.type ?? "thought",
    })),
    ...(pplRes.data ?? []).map((p: any) => ({ id: `person:${p.id}`, label: p.name, kind: "person" })),
  ];
  const edges = [
    ...(relsRes.data ?? []).map((r: any) => ({ a: r.from_memory_id, b: r.to_memory_id, w: r.score })),
    ...(mpRes.data ?? []).map((l: any) => ({ a: l.memory_id, b: `person:${l.person_id}`, w: 0.9 })),
  ];
  const ids = new Set(nodes.map((n) => n.id));
  return NextResponse.json({ nodes, edges: edges.filter((e) => ids.has(e.a) && ids.has(e.b)) });
}
