import { getUser, createClient } from "@/lib/supabase/server";
import { PeopleClient } from "@/components/people-client";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const user = await getUser();
  const sb = await createClient();
  const { data: people } = await sb
    .from("people")
    .select("id, name, last_mentioned_at")
    .order("last_mentioned_at", { ascending: false })
    .limit(100);

  return <PeopleClient initial={people ?? []} />;
}
