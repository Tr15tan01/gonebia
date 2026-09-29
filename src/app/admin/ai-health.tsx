import { createAdmin } from "@/lib/supabase/admin";
import { aiOutageOf, OUTAGE_LABEL, OWNER_ACTION_OUTAGES, type AiOutage } from "@/lib/ai/errors";
import { ReprocessService } from "@/lib/services/reprocess";
import { ReprocessButton } from "./reprocess-button";

interface OutageStat { reason: AiOutage; count: number; first: string; last: string; users: number; sample: string }

export interface AiHealth {
  outages: OutageStat[];
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failures24h: number;
  requests24h: number;
  unsorted: number;
}

/** Reads the last 24h of ai_usage_log and classifies every failure. No
 *  extra table: the log already records each failed call's error text. */
export async function getAiHealth(): Promise<AiHealth> {
  const admin = createAdmin();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [{ data: failures }, { data: lastOk }, { count: requests24h }, unsorted] = await Promise.all([
    admin.from("ai_usage_log").select("created_at, error, user_id")
      .eq("success", false).gte("created_at", since)
      .order("created_at", { ascending: false }).limit(2000),
    admin.from("ai_usage_log").select("created_at").eq("success", true)
      .order("created_at", { ascending: false }).limit(1),
    admin.from("ai_usage_log").select("id", { count: "exact", head: true }).gte("created_at", since),
    ReprocessService.pendingCount(admin).catch(() => 0),
  ]);

  const byReason = new Map<AiOutage, { count: number; first: string; last: string; users: Set<string>; sample: string }>();
  for (const f of failures ?? []) {
    const reason = aiOutageOf(String(f.error ?? ""));
    if (!reason) continue;
    const cur = byReason.get(reason);
    if (!cur) {
      byReason.set(reason, { count: 1, first: f.created_at, last: f.created_at, users: new Set(f.user_id ? [f.user_id] : []), sample: String(f.error ?? "").slice(0, 220) });
    } else {
      cur.count++;
      cur.first = f.created_at; // rows are newest-first
      if (f.user_id) cur.users.add(f.user_id);
    }
  }
  const order: AiOutage[] = ["spend_cap", "quota", "auth", "rate_limit", "overloaded"];
  return {
    outages: order.filter((r) => byReason.has(r)).map((r) => {
      const v = byReason.get(r)!;
      return { reason: r, count: v.count, first: v.first, last: v.last, users: v.users.size, sample: v.sample };
    }),
    lastSuccessAt: lastOk?.[0]?.created_at ?? null,
    lastFailureAt: failures?.[0]?.created_at ?? null,
    failures24h: failures?.length ?? 0,
    requests24h: requests24h ?? 0,
    unsorted,
  };
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

/** An owner-fixable outage is "active" if nothing has succeeded since. */
function isActive(o: OutageStat, lastSuccessAt: string | null) {
  return !lastSuccessAt || new Date(o.last) > new Date(lastSuccessAt);
}

/** Compact strip for every admin page - renders nothing when all is well. */
export async function AiHealthBanner() {
  let health: AiHealth;
  try { health = await getAiHealth(); } catch { return null; }
  const critical = health.outages.find((o) => OWNER_ACTION_OUTAGES.includes(o.reason) && isActive(o, health.lastSuccessAt));
  if (!critical) return null;
  const label = OUTAGE_LABEL[critical.reason];
  return (
    <div role="alert" className="px-6 py-3 text-sm flex flex-wrap items-center gap-x-4 gap-y-1"
      style={{ background: "var(--danger-soft)", borderBottom: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)" }}>
      <span className="font-semibold" style={{ color: "var(--danger)" }}>⚠️ {label.title}</span>
      <span className="text-ink-2">
        {critical.count} failed AI request{critical.count === 1 ? "" : "s"} · {critical.users} user{critical.users === 1 ? "" : "s"} affected · since {ago(critical.first)}
      </span>
      {label.href && (
        <a href={label.href} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2" style={{ color: "var(--danger)" }}>
          Fix it →
        </a>
      )}
    </div>
  );
}

/** Full health card for the overview page. */
export async function AiHealthCard() {
  let health: AiHealth;
  try { health = await getAiHealth(); } catch (e) {
    return <div className="card p-4 text-sm text-ink-2">AI health unavailable ({String(e).slice(0, 120)}).</div>;
  }
  const critical = health.outages.filter((o) => OWNER_ACTION_OUTAGES.includes(o.reason));
  const activeCritical = critical.filter((o) => isActive(o, health.lastSuccessAt));
  const status = activeCritical.length ? "down" : critical.length ? "recovered" : health.outages.length ? "degraded" : "ok";
  const tone = {
    down: { color: "var(--danger)", bg: "var(--danger-soft)", text: "AI features are failing for users" },
    recovered: { color: "var(--ember)", bg: "var(--ember-soft)", text: "Recovered - there was an outage in the last 24 hours" },
    degraded: { color: "var(--ember)", bg: "var(--ember-soft)", text: "Working, with some temporary errors" },
    ok: { color: "var(--success)", bg: "var(--success-soft)", text: "AI is healthy" },
  }[status];
  const errorRate = health.requests24h ? Math.round((health.failures24h / health.requests24h) * 100) : 0;

  return (
    <section className="card p-5 space-y-4" style={{ borderColor: `color-mix(in srgb, ${tone.color} 40%, transparent)` }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">AI health</h2>
          <p className="text-sm font-semibold mt-0.5" style={{ color: tone.color }}>● {tone.text}</p>
        </div>
        <div className="text-xs text-ink-2 text-right">
          <p>Last successful AI call: <span className="text-ink font-medium">{ago(health.lastSuccessAt)}</span></p>
          <p>Last 24 h: {health.requests24h} requests · {health.failures24h} failed ({errorRate}%)</p>
        </div>
      </div>

      {health.outages.length > 0 && (
        <ul className="space-y-2">
          {health.outages.map((o) => {
            const label = OUTAGE_LABEL[o.reason];
            const owner = OWNER_ACTION_OUTAGES.includes(o.reason);
            const active = owner && isActive(o, health.lastSuccessAt);
            return (
              <li key={o.reason} className="rounded-xl p-3 text-sm"
                style={{ background: active ? tone.bg : "var(--paper-2)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold" style={{ color: active ? "var(--danger)" : undefined }}>
                    {active ? "⚠️ " : ""}{label.title}{owner && !active ? " (resolved)" : ""}
                  </span>
                  <span className="text-xs text-ink-2">
                    {o.count}× · {o.users} user{o.users === 1 ? "" : "s"} · {ago(o.first)} → {ago(o.last)}
                  </span>
                </div>
                <p className="text-xs text-ink-2 mt-1">
                  {label.fix}{" "}
                  {label.href && <a href={label.href} target="_blank" rel="noopener noreferrer" className="text-ember underline underline-offset-2">Open</a>}
                </p>
                <details className="mt-1.5">
                  <summary className="text-[11px] text-ink-2 cursor-pointer">Raw error</summary>
                  <code className="block mt-1 text-[11px] break-all text-ink-2">{o.sample}</code>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      {health.unsorted > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-3 text-sm" style={{ background: "var(--paper-2)" }}>
          <span>
            <span className="font-semibold">{health.unsorted}</span> note{health.unsorted === 1 ? "" : "s"} saved during an outage
            {" "}{health.unsorted === 1 ? "is" : "are"} waiting to be sorted. They're sorted automatically every day and after each user's next capture.
          </span>
          <ReprocessButton />
        </div>
      )}
    </section>
  );
}
