import { geminiJSON } from "@/lib/ai/gemini";
import { safetyIntentPrompt } from "@/lib/ai/prompts";
import type { UsageCtx } from "@/lib/ai/gemini";

/** Common practice for personal-journal-style apps is to leave private notes
 *  completely unmoderated (same as a paper journal) - the reason this app is
 *  different is that it doesn't just store text, it actively turns
 *  "remind me to X" into a real scheduled push notification. Mechanically
 *  scheduling *that* around language describing self-harm or harming someone
 *  else is where a generic notes app's hands-off approach stops being the
 *  right call - not because the note itself is being judged or policed.
 *
 *  Deliberately simple and conservative: false negatives (missing something)
 *  are far more likely than false positives with these patterns, and that's
 *  the right trade-off for a heuristic gate - it only ever WITHHOLDS an
 *  automatic notification and adds a supportive message, it never deletes,
 *  hides, or blocks the user from writing/saving whatever they want. This is
 *  not a clinical or legal risk assessment and should not be presented to
 *  users or stakeholders as one - if this product needs real crisis-content
 *  handling (human-reviewed escalation, jurisdiction-aware reporting duties,
 *  etc.), that's a policy + moderation-infrastructure decision beyond what a
 *  regex can respectably do, and worth a real conversation with legal/trust &
 *  safety before shipping at any real scale. */

const SELF_HARM = [
  /\b(kill|hurt|harm)\s+(myself|me)\b/i,
  /\b(end|take)\s+my\s+(own\s+)?life\b/i,
  /\bsuicid/i,
  /\bself[-\s]?harm/i,
  /\bwant\s+to\s+die\b/i,
  /\bnot\s+want\s+to\s+(be\s+alive|live)\b/i,
];

const VIOLENCE_TO_OTHERS = [
  /\b(kill|murder|hurt|harm|attack|stab|shoot)\s+(him|her|them|someone|somebody|[a-z]+)\b/i,
];

// Cheap way to rule out the overwhelmingly common non-literal uses of these
// words ("this deadline is killing me", "I could kill for a coffee right
// now", a movie/book/game reference) so the gate doesn't fire constantly on
// harmless hyperbole - checked only for the self-harm patterns, since
// violence-to-others phrasing is rarer to use figuratively in a personal note.
const HYPERBOLE = /\b(deadline|traffic|this (job|day|week|meeting)|could kill for|dying to|killing it)\b/i;

export interface SafetyScreenResult {
  flagged: boolean;
  kind?: "self_harm" | "violence_to_others";
}

export function screenForCrisisContent(text: string): SafetyScreenResult {
  if (SELF_HARM.some((re) => re.test(text)) && !HYPERBOLE.test(text)) {
    return { flagged: true, kind: "self_harm" };
  }
  if (VIOLENCE_TO_OTHERS.some((re) => re.test(text))) {
    return { flagged: true, kind: "violence_to_others" };
  }
  return { flagged: false };
}

/** Supportive, non-alarmist message shown in place of a normal "reminder
 *  scheduled" confirmation. Deliberately international/generic since the
 *  app doesn't reliably know the user's country - 988 only helps a US-based
 *  reader, so it's offered as an example alongside a general pointer rather
 *  than the only resource given. */
export function crisisMessage(kind: "self_harm" | "violence_to_others" | "illegal_activity" | "other_harm"): string {
  if (kind === "self_harm") {
    return "Your note is saved, but I didn't schedule this as an active reminder. " +
      "If you're going through something hard, you don't have to deal with it alone - " +
      "in the US you can call or text 988 (Suicide & Crisis Lifeline) any time; " +
      "outside the US, search \"crisis line\" plus your country, or contact local " +
      "emergency services if you're in immediate danger.";
  }
  return "Your note is saved, but I didn't schedule this as an active reminder. " +
    "If you or someone else is in danger, please contact local emergency services.";
}

/** Shown when an AGENT (Research/Buying/Problem Solver) refuses to run at
 *  all, as opposed to a reminder just not being scheduled - there's no note
 *  being "saved" in that flow, so the wording is a little different. */
export function agentSafetyMessage(kind: "self_harm" | "violence_to_others" | "illegal_activity" | "other_harm"): string {
  if (kind === "self_harm") {
    return "I'm not able to run this as an agent action. If you're going through something hard, " +
      "in the US you can call or text 988 (Suicide & Crisis Lifeline) any time; outside the US, " +
      "search \"crisis line\" plus your country.";
  }
  return "I'm not able to run this as an agent action, since it describes something that could cause real harm.";
}

export interface IntentClassification {
  genuineIntent: boolean;
  category: "none" | "violence_to_others" | "self_harm" | "illegal_activity" | "other_harm";
  confidence: number;
  reasoning: string;
}

/** The SECOND, LLM-based layer - catches things the regex screen structurally
 *  can't (calmly-phrased intent with none of the regex's trigger words) and
 *  is better at telling genuine intent apart from profanity, quotation,
 *  fiction, or historical discussion than a keyword list ever could be.
 *  IMPORTANT: this function's opinion is advisory input to
 *  assessActionabilitySafety() below, never the final word by itself - the
 *  actual authorization decision for turning something actionable is made by
 *  application code that combines this with the regex screen, per
 *  assessActionabilitySafety(). If the model call itself fails (quota, bad
 *  JSON, network), this fails CLOSED (treated as flagged) rather than
 *  silently letting an unclassifiable note through as if it were fine. */
async function classifyIntent(text: string, ctx: UsageCtx): Promise<IntentClassification> {
  try {
    const raw = await geminiJSON<{ genuine_intent: boolean; category: string; confidence: number; reasoning: string }>(
      safetyIntentPrompt(text), "safety_intent", ctx
    );
    const category = (["none", "violence_to_others", "self_harm", "illegal_activity", "other_harm"] as const)
      .includes(raw.category as any) ? (raw.category as IntentClassification["category"]) : "other_harm";
    return {
      genuineIntent: !!raw.genuine_intent,
      category: raw.genuine_intent ? category : "none",
      confidence: typeof raw.confidence === "number" ? raw.confidence : 0.5,
      reasoning: raw.reasoning ?? "",
    };
  } catch (e) {
    console.error("[safety] intent classification failed - failing closed (treated as flagged):", e);
    return { genuineIntent: true, category: "other_harm", confidence: 0, reasoning: "classifier unavailable" };
  }
}

export interface ActionabilityAssessment {
  safe: boolean;
  kind?: "self_harm" | "violence_to_others" | "illegal_activity" | "other_harm";
}

/** THE function every actionable pathway (task/reminder creation, agent
 *  execution) must call before treating user text as actionable. Combines
 *  the cheap regex screen with the LLM classifier - either one flagging it
 *  is enough to block, since the regex screen exists specifically to catch
 *  cases a language model might miss or be talked around, and the LLM exists
 *  to catch phrasings the regex structurally cannot. This is the
 *  application-code authorization boundary the LLM alone never gets to make
 *  unilaterally - callers should never treat classifyIntent() or
 *  screenForCrisisContent() results as sufficient on their own. */
export async function assessActionabilitySafety(text: string, ctx: UsageCtx): Promise<ActionabilityAssessment> {
  const regexScreen = screenForCrisisContent(text);
  if (regexScreen.flagged) return { safe: false, kind: regexScreen.kind };

  const llm = await classifyIntent(text, ctx);
  if (llm.genuineIntent && llm.category !== "none") {
    return { safe: false, kind: llm.category };
  }
  return { safe: true };
}
