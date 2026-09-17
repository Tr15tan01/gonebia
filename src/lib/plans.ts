export type Plan = "free" | "premium" | "pro";

/** A Deep Research run fans out into several grounded searches plus a long
 *  synthesis, so it draws this many runs from the monthly agent budget. */
export const DEEP_RESEARCH_COST = 3;

export const LIMITS = {
  free: {
    label: "Free",
    price: 0,
    textPerMonth: 100,
    voicePerMonth: 20,
    chatPerDay: 10,        // section-4 spec
    chatPerMonth: 20,      // pricing-table spec (both enforced)
    activeReminders: 20,
    connectDotsPerMonth: 3,
    youSaidThisBeforePerMonth: 3,
    forgottenPerWeek: 1,
    discoverPerMonth: 3,
    agentRunsPerMonth: 2,
    watchLimit: 1,
    semanticSearch: true, // now included on Free too - embeddings are genuinely cheap; see chat.ts
    memoryGraph: false,
    dailyBriefingNotification: false,
    weeklyReflection: false,
    intentionVsReality: false,
    recurringPatterns: false,
    futureMemory: false,
    googleCalendar: false,
    gmailContext: false,
    deepResearch: false,
    longRunningCases: false,
    watches: "limited" as "none" | "limited" | "unlimited",
    colorChoices: 1,
  },
  premium: {
    label: "Premium",
    price: 7.99,
    textPerMonth: 1000,
    voicePerMonth: 200,
    chatPerDay: 999999,
    chatPerMonth: 500,
    activeReminders: 999999,
    connectDotsPerMonth: 999999,
    youSaidThisBeforePerMonth: 999999,
    forgottenPerWeek: 999999,
    discoverPerMonth: 30,
    agentRunsPerMonth: 50,
    watchLimit: 15,
    semanticSearch: true,
    memoryGraph: true,
    dailyBriefingNotification: true,
    weeklyReflection: true,
    intentionVsReality: true,
    recurringPatterns: true,
    futureMemory: true,
    googleCalendar: true,
    gmailContext: true,
    deepResearch: true,
    longRunningCases: false,
    watches: "limited" as "none" | "limited" | "unlimited",
    // Premium unlocks the full custom color palette (see THEME_COLORS in theme.tsx)
    colorChoices: 999999,
  },
  pro: {
    label: "Pro",
    price: 19.99,
    textPerMonth: 5000,
    voicePerMonth: 1000,
    chatPerDay: 999999,
    chatPerMonth: 1000,
    activeReminders: 999999,
    connectDotsPerMonth: 999999,
    youSaidThisBeforePerMonth: 999999,
    forgottenPerWeek: 999999,
    discoverPerMonth: 999999,
    agentRunsPerMonth: 200,
    watchLimit: 100,
    semanticSearch: true,
    memoryGraph: true,
    dailyBriefingNotification: true,
    weeklyReflection: true,
    intentionVsReality: true,
    recurringPatterns: true,
    futureMemory: true,
    googleCalendar: true,
    gmailContext: true,
    deepResearch: true,
    longRunningCases: true,
    watches: "unlimited" as "none" | "limited" | "unlimited",
    colorChoices: 999999,
  },
} as const;

/** Ordered low -> high, useful for "is at least X" comparisons in the UI. */
export const PLAN_ORDER: Plan[] = ["free", "premium", "pro"];

export function planLabel(plan: Plan): string {
  return LIMITS[plan].label;
}
