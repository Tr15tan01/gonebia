import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser, createClient } from "@/lib/supabase/server";
import { MemoryList } from "@/components/memory";
import { Avatar } from "@/components/avatar";
import { PersonHeaderActions } from "@/components/person-header-actions";
import { relTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  const sb = await createClient();
  const { data: person } = await sb.from("people").select("*").eq("id", id).single();
  if (!person) notFound();

  const { data: rows } = await sb
    .from("memory_people")
    .select("memories(id, original_text, created_at, memory_metadata(type, title, summary, importance, status, due_at, people, category))")
    .eq("person_id", id)
    .order("memories.created_at", { ascending: false })
    .limit(50);

  const memories = (rows ?? []).map((r: any) => r.memories).filter(Boolean).map((m: any) => ({
    id: m.id, original_text: m.original_text, created_at: m.created_at,
    type: m.memory_metadata?.type ?? "thought", title: m.memory_metadata?.title ?? "",
    summary: m.memory_metadata?.summary ?? "", importance: m.memory_metadata?.importance ?? 3,
    status: m.memory_metadata?.status ?? "open", due_at: m.memory_metadata?.due_at ?? null,
    people: m.memory_metadata?.people ?? [],
  }));

  // Facts are derived ONLY from memories the user actually recorded - nothing inferred beyond their words.
  const facts: string[] = [];
  if (memories.length) {
    const { data: metas } = await sb
      .from("memory_metadata")
      .select("category, companies, places, products")
      .in("memory_id", memories.map((m) => m.id));
    const cats: Record<string, number> = {};
    const ents: Record<string, number> = {};
    for (const md of metas ?? []) {
      if (md.category) cats[md.category] = (cats[md.category] ?? 0) + 1;
      for (const e of [...(md.companies ?? []), ...(md.places ?? []), ...(md.products ?? [])]) {
        ents[e] = (ents[e] ?? 0) + 1;
      }
    }
    for (const [c, n] of Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 3)) {
      facts.push(`comes up around ${c} (${n} ${n === 1 ? "memory" : "memories"})`);
    }
    for (const [e, n] of Object.entries(ents).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3)) {
      facts.push(`mentioned alongside "${e}" ${n} times`);
    }
  }

  return (
    <div className="space-y-6">
      <header className="card p-6">
        <p className="label">Before you meet - things you've previously discussed</p>
        <div className="flex items-start justify-between gap-4 mt-3">
          <div className="flex items-center gap-4">
            <Avatar name={person.name} size={64} />
            <div>
              <h1 className="font-display text-3xl">{person.name}</h1>
              <p className="text-sm text-ink-2 mt-1">last mentioned {relTime(person.last_mentioned_at)}</p>
            </div>
          </div>
          <PersonHeaderActions id={person.id} name={person.name} />
        </div>
        {facts.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm list-disc list-inside text-ink-2">
            {facts.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        )}
        <p className="text-xs text-ink-2 mt-4">
          These facts are derived only from memories you recorded. Nothing is inferred beyond your own words.
        </p>
      </header>
      <section>
        <h2 className="label mb-2.5">Supporting memories</h2>
        {memories.length ? <MemoryList memories={memories} /> : <p className="text-sm text-ink-2">No memories yet.</p>}
      </section>
      <Link href="/people" className="text-sm text-ember">All people</Link>
    </div>
  );
}
