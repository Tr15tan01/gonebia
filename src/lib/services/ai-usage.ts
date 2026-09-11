import { createAdmin } from "@/lib/supabase/admin";
import { estimateCostUsd } from "@/lib/ai/models";

export interface UsageLogInput {
  userId: string | null;
  feature: string;
  job: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  success: boolean;
  error?: string;
}

export const AiUsageService = {
  /** Fire-and-forget by design - awaited by callers (so it's included if
   *  they want to await/ordering) but never throws, so a logging failure
   *  can't take down the AI call it's tracking. */
  async log(input: UsageLogInput): Promise<void> {
    try {
      const admin = createAdmin();
      const cost = estimateCostUsd(input.model, input.inputTokens ?? 0, input.outputTokens ?? 0);
      const { error } = await admin.from("ai_usage_log").insert({
        user_id: input.userId,
        feature: input.feature,
        job: input.job,
        model: input.model,
        input_tokens: input.inputTokens ?? null,
        output_tokens: input.outputTokens ?? null,
        estimated_cost_usd: cost,
        success: input.success,
        error: input.error ? input.error.slice(0, 500) : null,
      });
      if (error) console.error("[ai-usage] insert failed:", error);
    } catch (e) {
      console.error("[ai-usage] logging threw:", e);
    }
  },

  /** Per-user rollup for the admin user-detail page and any future
   *  self-serve "your AI usage" view. */
  async totalsForUser(userId: string, sinceDays = 30) {
    const admin = createAdmin();
    const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();
    const { data } = await admin
      .from("ai_usage_log")
      .select("estimated_cost_usd, input_tokens, output_tokens, feature, success")
      .eq("user_id", userId)
      .gte("created_at", since);
    const rows = data ?? [];
    return {
      totalCostUsd: rows.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0),
      totalInputTokens: rows.reduce((s, r) => s + (r.input_tokens ?? 0), 0),
      totalOutputTokens: rows.reduce((s, r) => s + (r.output_tokens ?? 0), 0),
      requestCount: rows.length,
      failureCount: rows.filter((r) => !r.success).length,
    };
  },

  /** Site-wide rollup for the admin overview page. */
  async totalsSince(sinceDays = 30) {
    const admin = createAdmin();
    const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();
    const { data } = await admin
      .from("ai_usage_log")
      .select("estimated_cost_usd")
      .gte("created_at", since);
    const rows = data ?? [];
    return {
      totalCostUsd: rows.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0),
      requestCount: rows.length,
    };
  },
};
