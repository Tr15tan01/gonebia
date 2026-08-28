import Link from "next/link";
import { getUser, createClient } from "@/lib/supabase/server";
import { relTime } from "@/lib/dates";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const user = await getUser();
  const sb = await createClient();
  const { data: people } = await sb
    .from("people")
    .select("*")
    .order("last_mentioned_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl">People</h1>
        <p className="text-sm text-ink-2 mt-1">Built automatically from your memories. Only what you actually said.</p>
      </header>
      {people && people.length > 0 ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {people.map((p: any) => (
            <Link key={p.id} href={`/people/${p.id}`} className="card p-4 hover:border-ember/50 transition-colors">
              <p className="font-display text-lg">{p.name}</p>
              <p className="text-xs text-ink-2 mt-1">last mentioned {relTime(p.last_mentioned_at)}</p>
            </Link>
          ))}
        </div>
      ) : <Empty icon="o" title="No people yet." hint="Mention someone by name and they'll appear here." />}
    </div>
  );
}
