import * as Sentry from "@sentry/nextjs";
import { createAdmin } from "@/lib/supabase/admin";
import { LIMITS, type Plan } from "@/lib/plans";

/** Plan resolution: active/trialing = pro; canceled/past_due keep pro until period end. */
export async function getPlan(sb: any, userId: string): Promise<Plan> {
  try {
    const { data } = await sb
      .from("subscriptions")
      .select("plan, status, current_period_end")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return "free";
    const active = ["active", "trialing"].includes(data.status);
    const grace = ["canceled", "past_due"].includes(data.status)
      && data.current_period_end && new Date(data.current_period_end) > new Date();
    return data.plan === "pro" && (active || grace) ? "pro" : "free";
  } catch { return "free"; }
}

export async function getUsage(sb: any, userId: string) {
  const month = new Date().toISOString().slice(0, 7);
  const { data, error } = await sb
    .from("usage_counters").select("*").eq("user_id", userId).eq("month", month).maybeSingle();
  if (error) {
    // Previously silently swallowed - if this table/RLS/RPC ever has an issue,
    // usage would just look like "0 used" forever with zero visibility. Now it
    // shows up in Sentry instead of only ever being reported as "doesn't count."
    console.error("[limits] getUsage query failed - reporting 0 usage:", error);
    Sentry.captureException(error, { extra: { userId, month, stage: "getUsage" } });
  }
  const today = new Date().toISOString().slice(0, 10);
  return {
    month,
    text: data?.text_month ?? 0,
    voice: data?.voice_month ?? 0,
    chatMonth: data?.chat_month ?? 0,
    chatToday: data && data.chat_day === today ? (data.chat_today ?? 0) : 0,
    discover: data?.discover_month ?? 0,
    agents: data?.agent_month ?? 0,
    ystb: data?.ystb_month ?? 0,
  };
}

export async function bumpUsage(sb: any, userId: string, field: string): Promise<number> {
  const { data, error } = await sb.rpc("bump_usage", { p_user: userId, p_field: field, p_amount: 1 });
  if (error) {
    console.error(`[limits] bump_usage(${field}) failed - this interaction will NOT be counted:`, error);
    Sentry.captureException(error, { extra: { userId, field, stage: "bumpUsage" } });
  }
  return typeof data === "number" ? data : 0;
}

export async function bumpChatUsage(sb: any, userId: string) {
  const { data, error } = await sb.rpc("bump_chat_usage", { p_user: userId });
  if (error) {
    console.error("[limits] bump_chat_usage failed - this question will NOT be counted:", error);
    Sentry.captureException(error, { extra: { userId, stage: "bumpChatUsage" } });
  }
  return data;
}

/** Pre-checks BEFORE work happens; returns a standard 402-shaped payload when blocked. */
export function limitResponse(feature: string, message: string) {
  return Response.json(
    { error: message, code: "limit", feature, upgrade: true },
    { status: 402 }
  );
}

export async function activeReminderCount(admin: any, userId: string): Promise<number> {
  const { count } = await admin
    .from("reminders").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("status", "pending");
  return count ?? 0;
}

export { LIMITS } from "@/lib/plans";
