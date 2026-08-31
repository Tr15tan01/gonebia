import { getUser, createClient } from "@/lib/supabase/server";
import { getPlan, getUsage, LIMITS } from "@/lib/limits";
import { AgentsClient } from "@/components/agents-client";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const user = await getUser();
  const sb = await createClient();
  const plan = await getPlan(sb, user!.id);
  const usage = await getUsage(sb, user!.id);
  return (
    <AgentsClient plan={plan} used={usage.agents} limit={LIMITS[plan].agentRunsPerMonth} />
  );
}
