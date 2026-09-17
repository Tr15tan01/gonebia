import { getUser, createClient } from "@/lib/supabase/server";
import { getPlan, getUsage, LIMITS } from "@/lib/limits";
import { DEEP_RESEARCH_COST } from "@/lib/plans";
import { AgentsClient, type AgentTab } from "@/components/agents-client";

export const dynamic = "force-dynamic";

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { tab, q } = await searchParams;
  const user = await getUser();
  const sb = await createClient();
  const [plan, usage] = await Promise.all([getPlan(sb, user!.id), getUsage(sb, user!.id)]);
  const lim = LIMITS[plan];
  const initialTab: AgentTab = tab === "watch" || tab === "deep_research" ? tab : "research";
  return (
    <AgentsClient
      plan={plan}
      used={usage.agents}
      limit={lim.agentRunsPerMonth}
      deepAllowed={lim.deepResearch}
      deepCost={DEEP_RESEARCH_COST}
      watchLimit={lim.watchLimit}
      initialTab={initialTab}
      initialQuery={q?.slice(0, 500) ?? ""}
    />
  );
}
