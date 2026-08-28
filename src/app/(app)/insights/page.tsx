import { getUser, createClient } from "@/lib/supabase/server";
import { InsightsClient } from "@/components/insights";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const user = await getUser();
  const sb = await createClient();
  const [{ data: insights }, { data: weekly }] = await Promise.all([
    sb.from("insights").select("*")
      .in("status", ["new", "goal_created"])
      .order("created_at", { ascending: false }).limit(50),
    sb.from("weekly_analyses").select("*")
      .order("week_start", { ascending: false }).limit(1),
  ]);
  return <InsightsClient initial={insights ?? []} weekly={weekly?.[0] ?? null} />;
}
