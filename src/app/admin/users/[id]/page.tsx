import { createAdmin } from "@/lib/supabase/admin";
import { AiUsageService } from "@/lib/services/ai-usage";
import { UserActionButtons } from "@/components/admin-user-actions";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdmin();

  const [
    { data: user },
    { data: sub },
    { count: memCount },
    { count: taskCount },
    { count: agentRunCount },
    usage90,
    { data: recentUsage },
    { data: auditLog },
  ] = await Promise.all([
    admin.from("users").select("id, email, full_name, created_at, role, disabled_at, ai_paused_at").eq("id", id).maybeSingle(),
    admin.from("subscriptions").select("*").eq("user_id", id).maybeSingle(),
    admin.from("memories").select("id", { count: "exact", head: true }).eq("user_id", id),
    admin.from("memory_metadata").select("memory_id", { count: "exact", head: true }).eq("user_id", id).in("type", ["task", "promise", "commitment"]),
    admin.from("agent_runs").select("id", { count: "exact", head: true }).eq("user_id", id),
    AiUsageService.totalsForUser(id, 90),
    admin.from("ai_usage_log").select("feature, model, input_tokens, output_tokens, estimated_cost_usd, success, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
    admin.from("admin_audit_log").select("action, details, created_at, admin_user_id").eq("target_user_id", id).order("created_at", { ascending: false }).limit(20),
  ]);

  if (!user) return <p className="text-ink-2">User not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">{user.email}</h1>
        <p className="text-ink-2 text-sm">{user.full_name || "No name"} - joined {new Date(user.created_at).toLocaleDateString()}</p>
      </div>

      <UserActionButtons
        userId={user.id}
        disabled={!!user.disabled_at}
        aiPaused={!!user.ai_paused_at}
      />

      <section className="card p-4">
        <h2 className="label mb-2">Subscription (from our database / Paddle webhook - never trusted from the client)</h2>
        {sub ? (
          <div className="text-sm space-y-1">
            <p><span className="text-ink-2">Plan:</span> {sub.plan}</p>
            <p><span className="text-ink-2">Status:</span> {sub.status}</p>
            <p><span className="text-ink-2">Paddle subscription ID:</span> {sub.paddle_subscription_id ?? "-"}</p>
            <p><span className="text-ink-2">Paddle customer ID:</span> {sub.paddle_customer_id ?? "-"}</p>
            <p><span className="text-ink-2">Price ID:</span> {sub.price_id ?? "-"}</p>
            <p><span className="text-ink-2">Current period ends:</span> {sub.current_period_end ? new Date(sub.current_period_end).toLocaleString() : "-"}</p>
            <p><span className="text-ink-2">Cancel at period end:</span> {sub.cancel_at_period_end ? "Yes" : "No"}</p>
            {sub.canceled_at && <p><span className="text-ink-2">Canceled at:</span> {new Date(sub.canceled_at).toLocaleString()}</p>}
            <p className="text-xs text-ink-2 mt-2">No payment-card details are ever stored or shown here - Paddle handles those entirely.</p>
          </div>
        ) : <p className="text-ink-2 text-sm">No subscription record - Free plan.</p>}
      </section>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4"><p className="text-xl font-display">{memCount ?? 0}</p><p className="text-xs text-ink-2">Memories</p></div>
        <div className="card p-4"><p className="text-xl font-display">{taskCount ?? 0}</p><p className="text-xl font-display"></p><p className="text-xs text-ink-2">Tasks/reminders</p></div>
        <div className="card p-4"><p className="text-xl font-display">{agentRunCount ?? 0}</p><p className="text-xs text-ink-2">Agent runs</p></div>
        <div className="card p-4"><p className="text-xl font-display">${usage90.totalCostUsd.toFixed(2)}</p><p className="text-xs text-ink-2">AI cost (90d, est.)</p></div>
      </div>

      <section className="card p-4">
        <h2 className="label mb-2">AI usage (90 days)</h2>
        <p className="text-sm text-ink-2">
          {usage90.requestCount} requests - {usage90.totalInputTokens.toLocaleString()} input tokens -{" "}
          {usage90.totalOutputTokens.toLocaleString()} output tokens - {usage90.failureCount} failures
        </p>
        <table className="w-full text-xs mt-3">
          <thead><tr className="text-ink-2 text-left border-b border-line">
            <th className="p-1.5">Feature</th><th className="p-1.5">Model</th><th className="p-1.5">Tokens</th><th className="p-1.5">Cost</th><th className="p-1.5">When</th>
          </tr></thead>
          <tbody>
            {(recentUsage ?? []).map((r: any, i: number) => (
              <tr key={i} className="border-b border-line/50">
                <td className="p-1.5">{r.feature}{!r.success && <span style={{ color: "var(--danger)" }}> (failed)</span>}</td>
                <td className="p-1.5 text-ink-2">{r.model}</td>
                <td className="p-1.5 text-ink-2">{(r.input_tokens ?? 0) + (r.output_tokens ?? 0)}</td>
                <td className="p-1.5 text-ink-2">${(r.estimated_cost_usd ?? 0).toFixed(5)}</td>
                <td className="p-1.5 text-ink-2">{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {(auditLog ?? []).length > 0 && (
        <section className="card p-4">
          <h2 className="label mb-2">Admin action history</h2>
          <ul className="text-xs space-y-1">
            {auditLog!.map((a: any, i: number) => (
              <li key={i} className="text-ink-2">{new Date(a.created_at).toLocaleString()} - {a.action}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
