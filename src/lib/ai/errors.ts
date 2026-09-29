/**
 * Recognising "the AI is unavailable" failures and turning them into
 * something a person can read.
 *
 *  spend_cap   - the Google project hit its monthly spending cap (429)
 *  quota       - a request/token quota is exhausted (429 RESOURCE_EXHAUSTED)
 *  rate_limit  - too many requests right now (429, clears on its own)
 *  auth        - the API key is missing, invalid, or not allowed (400/401/403)
 *  overloaded  - Google's side is busy or down (500/503)
 *
 * spend_cap, quota and auth are the app owner's problem to fix, so they also
 * raise an admin alert (see services/ai-alerts.ts). rate_limit/overloaded
 * are retried and simply clear up.
 */

export type AiOutage = "spend_cap" | "quota" | "rate_limit" | "auth" | "overloaded";

/** Outages that need the owner to act - retrying won't help. */
export const OWNER_ACTION_OUTAGES: AiOutage[] = ["spend_cap", "quota", "auth"];

export class AiUnavailableError extends Error {
  readonly reason: AiOutage;
  readonly retryable: boolean;
  constructor(reason: AiOutage, detail: string) {
    super(detail);
    this.name = "AiUnavailableError";
    this.reason = reason;
    this.retryable = reason === "rate_limit" || reason === "overloaded";
  }
}

/** Classifies an HTTP failure from the Gemini API. null = not an outage
 *  (e.g. a malformed request, which is a bug rather than unavailability). */
export function classifyAiHttpError(status: number, body: string): AiOutage | null {
  const b = body.toLowerCase();
  if (status === 429 || b.includes("resource_exhausted")) {
    if (b.includes("spending cap") || b.includes("spend cap") || b.includes("ai.studio/spend") || b.includes("billing")) return "spend_cap";
    if (b.includes("quota")) return "quota";
    return "rate_limit";
  }
  if (status === 401 || status === 403) return "auth";
  if (status === 400 && (b.includes("api key") || b.includes("api_key_invalid") || b.includes("permission"))) return "auth";
  if (status === 500 || status === 502 || status === 503 || status === 504 || b.includes("overloaded") || b.includes("unavailable")) return "overloaded";
  return null;
}

/** Works on a thrown error OR a logged error string (ai_usage_log.error). */
export function aiOutageOf(e: unknown): AiOutage | null {
  if (e instanceof AiUnavailableError) return e.reason;
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const m = msg.match(/HTTP (\d{3})/);
  if (!m) return /no gemini api key/i.test(msg) ? "auth" : null;
  return classifyAiHttpError(Number(m[1]), msg);
}

const MESSAGES: Record<AiOutage, string> = {
  spend_cap:
    "TimelyMemo's AI features are paused for a little while. Your memories are safe and saving still works - " +
    "answers, analysis and agents will be back soon.",
  quota:
    "TimelyMemo's AI features are paused for a little while. Your memories are safe and saving still works - " +
    "answers, analysis and agents will be back soon.",
  auth:
    "TimelyMemo's AI features are temporarily unavailable. Your memories are safe and saving still works - " +
    "we're on it.",
  rate_limit: "The AI is very busy right now. Please try again in a minute.",
  overloaded: "The AI service is having a moment. Please try again in a minute.",
};

export function aiOutageMessage(reason: AiOutage): string {
  return MESSAGES[reason];
}

/** A user-safe message for any failure: the outage message when the AI is
 *  unavailable, otherwise the given fallback. Never exposes raw error text. */
export function friendlyAiMessage(e: unknown, fallback: string): string {
  const reason = aiOutageOf(e);
  return reason ? MESSAGES[reason] : fallback;
}

/** Short labels for the admin panel. */
export const OUTAGE_LABEL: Record<AiOutage, { title: string; fix: string; href?: string }> = {
  spend_cap: {
    title: "Gemini monthly spending cap reached",
    fix: "Raise or remove the spend cap for this Google AI project.",
    href: "https://ai.studio/spend",
  },
  quota: {
    title: "Gemini quota exhausted",
    fix: "Check the project's quota and billing tier in Google AI Studio.",
    href: "https://aistudio.google.com/",
  },
  auth: {
    title: "Gemini API key rejected",
    fix: "Check GEMINI_API_KEY in the server environment, and that the key's project is active.",
    href: "https://aistudio.google.com/apikey",
  },
  rate_limit: {
    title: "Gemini rate limits hit",
    fix: "Short bursts clear on their own. If this is frequent, raise the project's rate tier.",
  },
  overloaded: {
    title: "Gemini service errors",
    fix: "Usually temporary on Google's side - nothing to do unless it persists.",
  },
};
