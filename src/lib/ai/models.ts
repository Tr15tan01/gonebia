/** Every distinct AI job in the app, mapped to a cost tier. Add new call
 *  sites here rather than hardcoding a model name at the call site - this
 *  is the single place that decides which model tier a job runs on. */
export type AiJob =
  | "extraction"       // capture: classify note, extract dates/metadata/type
  | "search_plan"      // chat: turn a question into retrieval parameters
  | "safety_intent"    // safety/intent classification (see lib/services/safety.ts)
  | "summarization"    // cheap labeling/summarizing, e.g. insight cluster names
  | "chat_answer"       // Ask My Memory - the actual grounded answer
  | "insights"          // weekly reflection / complex pattern analysis
  | "discover"          // Discover, Life Radar, and related analyses
  | "agent"             // Research Agent, Buying Agent, Problem Solver
  | "enrichment";       // grounded lookups: book metadata, price tracking

export type AiTier = "fast" | "general" | "reasoning";

const TIER_FOR_JOB: Record<AiJob, AiTier> = {
  extraction: "fast",
  search_plan: "fast",
  safety_intent: "fast",
  summarization: "fast",
  enrichment: "general",
  chat_answer: "reasoning",
  insights: "reasoning",
  discover: "reasoning",
  agent: "reasoning",
};

/** The model actually used before tiered env vars existed - kept as the
 *  fallback for every tier so an app with only GEMINI_CHAT_MODEL set (or
 *  nothing set at all) behaves EXACTLY as before. Set GEMINI_MODEL_FAST /
 *  _GENERAL / _REASONING to actually split cost across tiers. */
function legacyFallback(): string {
  return process.env.GEMINI_CHAT_MODEL || "gemini-3.6-flash";
}

export function modelForJob(job: AiJob): string {
  const tier = TIER_FOR_JOB[job];
  const fallback = legacyFallback();
  if (tier === "fast") return process.env.GEMINI_MODEL_FAST || fallback;
  if (tier === "reasoning") return process.env.GEMINI_MODEL_REASONING || fallback;
  return process.env.GEMINI_MODEL_GENERAL || fallback;
}

export function embeddingModel(): string {
  return process.env.GEMINI_MODEL_EMBEDDING || process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";
}

export function tierForJob(job: AiJob): AiTier {
  return TIER_FOR_JOB[job];
}

/** Rough $/1M token pricing, used only to estimate cost for the usage log -
 *  not billing-accurate, and Google changes these periodically. Update
 *  alongside whatever models you actually set in the tiered env vars.
 *  Unrecognized models fall back to the "general" row so a cost estimate is
 *  still recorded rather than silently omitted. */
const PRICING_PER_MILLION: Record<string, { input: number; output: number }> = {
  "gemini-3.5-flash-lite": { input: 0.30, output: 2.50 },
  "gemini-3.6-flash": { input: 0.75, output: 3.75 },
  "gemini-3.7-flash": { input: 0.75, output: 3.75 },
  "gemini-3.1-pro": { input: 2.00, output: 12.00 },
  "gemini-3.1-pro-preview": { input: 2.00, output: 12.00 },
  "gemini-embedding-001": { input: 0.15, output: 0 },
  _general_fallback: { input: 0.75, output: 3.75 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICING_PER_MILLION[model] ?? PRICING_PER_MILLION._general_fallback;
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}
