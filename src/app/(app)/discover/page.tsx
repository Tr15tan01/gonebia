import { getUser, createClient } from "@/lib/supabase/server";
import { getPlan, getUsage, LIMITS } from "@/lib/limits";
import { DiscoverClient } from "@/components/discover-client";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const user = await getUser();
  const sb = await createClient();
  const plan = await getPlan(sb, user!.id);
  const usage = await getUsage(sb, user!.id);
  return (
    <DiscoverClient
      plan={plan}
      used={usage.discover}
      limit={LIMITS[plan].discoverPerMonth}
    />
  );
}
