import { createAdmin } from "@/lib/supabase/admin";
import { AiUsageService } from "@/lib/services/ai-usage";

export const dynamic = "force-dynamic";

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-4">
      <p className="text-2xl font-display font-semibold">{value}</p>
      <p className="text-xs text-ink-2 mt-1">{label}</p>
    </div>
  );
}

export default async function AdminOverviewPage() {
  const admin = createAdmin();
  const [
    { count: totalUsers },
    { count: premiumUsers },
    { count: proUsers },
    { count: disabledUsers },
    { count: totalMemories },
    aiTotals30,
  ] = await Promise.all([
    admin.from("users").select("id", { count: "exact", head: true }),
    admin.from("subscriptions").select("user_id", { count: "exact", head: true }).eq("plan", "premium").in("status", ["active", "trialing"]),
    admin.from("subscriptions").select("user_id", { count: "exact", head: true }).eq("plan", "pro").in("status", ["active", "trialing"]),
    admin.from("users").select("id", { count: "exact", head: true }).not("disabled_at", "is", null),
    admin.from("memories").select("id", { count: "exact", head: true }),
    AiUsageService.totalsSince(30),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl">Overview</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total users" value={totalUsers ?? 0} />
        <StatCard label="Premium subscribers" value={premiumUsers ?? 0} />
        <StatCard label="Pro subscribers" value={proUsers ?? 0} />
        <StatCard label="Disabled accounts" value={disabledUsers ?? 0} />
        <StatCard label="Total memories" value={totalMemories ?? 0} />
        <StatCard label="AI cost (30d, est.)" value={`$${aiTotals30.totalCostUsd.toFixed(2)}`} />
        <StatCard label="AI requests (30d)" value={aiTotals30.requestCount} />
      </div>

      <p className="text-xs text-ink-2">
        Cost figures are estimates based on per-model $/token pricing in <code>lib/ai/models.ts</code> -
        update that table if your actual Gemini pricing changes.
      </p>
    </div>
  );
}
