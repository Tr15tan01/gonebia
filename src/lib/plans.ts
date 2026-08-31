export type Plan = "free" | "pro";

export const LIMITS = {
  free: {
    label: "Free",
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
    priceWatches: 3,
    semanticSearch: false,
    dailyBriefingNotification: false,
    weeklyReflection: false,
    intentionVsReality: false,
    recurringPatterns: false,
    futureMemory: false,
  },
  pro: {
    label: "Pro",
    textPerMonth: 1000,
    voicePerMonth: 200,
    chatPerDay: 100,
    chatPerMonth: 500,
    activeReminders: 999999,
    connectDotsPerMonth: 999999,
    youSaidThisBeforePerMonth: 999999,
    forgottenPerWeek: 999,
    discoverPerMonth: 200,
    agentRunsPerMonth: 50,
    priceWatches: 10,
    semanticSearch: true,
    dailyBriefingNotification: true,
    weeklyReflection: true,
    intentionVsReality: true,
    recurringPatterns: true,
    futureMemory: true,
  },
} as const;
