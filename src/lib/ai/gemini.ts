import { modelForJob, embeddingModel, type AiJob } from "./models";
import { AiUsageService } from "@/lib/services/ai-usage";
import { AiUnavailableError, OWNER_ACTION_OUTAGES, classifyAiHttpError } from "./errors";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const KEY = () => process.env.GEMINI_API_KEY;

/** Every AI call is tagged with who it's for and what feature triggered it -
 *  this is what lands in ai_usage_log (see services/ai-usage.ts) for cost
 *  tracking and the admin dashboard. userId is nullable for system/cron jobs
 *  that aren't attributable to one user (e.g. a scheduled digest covering
 *  many users individually still passes each user's id per-call). */
export interface UsageCtx {
  userId: string | null;
  feature: string;
}

class NonRetryableError extends Error {}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      // no point retrying a deterministic failure (bad request, spend cap,
      // exhausted quota, rejected key)
      if (e instanceof NonRetryableError) throw e;
      if (e instanceof AiUnavailableError && !e.retryable) throw e;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    }
  }
  throw last;
}

/** Turns a failed Gemini HTTP response into the right error type. */
function httpError(label: string, status: number, body: string): Error {
  const msg = `${label} HTTP ${status}: ${body}`;
  const outage = classifyAiHttpError(status, body);
  if (outage) return new AiUnavailableError(outage, msg);
  // other 4xx (invalid model name, malformed request) won't succeed on retry
  if (status >= 400 && status < 500) return new NonRetryableError(msg);
  return new Error(msg);
}

/** Owner-fixable outages alert the admins (throttled inside). */
async function reportOutage(e: unknown) {
  if (e instanceof AiUnavailableError && OWNER_ACTION_OUTAGES.includes(e.reason)) {
    const { raiseAiOutageAlert } = await import("@/lib/services/ai-alerts");
    await raiseAiOutageAlert(e.reason, e.message);
  }
}

async function generate(
  prompt: string, job: AiJob, ctx: UsageCtx,
  opts: { json?: boolean; temperature?: number; tools?: unknown[]; maxTokens?: number } = {}
): Promise<{ text: string; inputTokens: number; outputTokens: number; raw: any }> {
  const model = modelForJob(job);
  try {
    if (!KEY()) throw new AiUnavailableError("auth", "No Gemini API key configured (GEMINI_API_KEY)");
    const result = await withRetry(async () => {
      const res = await fetch(`${BASE}/${model}:generateContent?key=${KEY()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          ...(opts.tools ? { tools: opts.tools } : {}),
          generationConfig: {
            temperature: opts.temperature ?? 0.2,
            maxOutputTokens: opts.maxTokens ?? 4096,
            ...(opts.json ? { responseMimeType: "application/json" } : {}),
          },
        }),
      });
      if (!res.ok) {
        throw httpError(`Gemini ${model}`, res.status, (await res.text()).slice(0, 400));
      }
      const data = await res.json();
      const candidate = data?.candidates?.[0];
      const text = candidate?.content?.parts?.map((p: any) => p.text).join("") ?? "";
      if (!text) {
        // A 200 OK with no text is almost always Gemini's safety filter
        // blocking the response (finishReason "SAFETY"/"RECITATION"/etc.),
        // not a transient failure - retrying won't change the outcome, and
        // the previous version of this code retried 3 times anyway, which
        // is exactly what made a safety-blocked answer look like "the
        // language model couldn't be reached" after a long pointless delay.
        const reason = candidate?.finishReason ?? "unknown";
        throw new NonRetryableError(`Gemini ${model} returned no text (finishReason: ${reason})`);
      }
      const inputTokens = data?.usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = data?.usageMetadata?.candidatesTokenCount ?? 0;
      return { text, inputTokens, outputTokens, raw: data };
    });
    await AiUsageService.log({
      userId: ctx.userId, feature: ctx.feature, job, model,
      inputTokens: result.inputTokens, outputTokens: result.outputTokens, success: true,
    });
    return result;
  } catch (e) {
    await AiUsageService.log({
      userId: ctx.userId, feature: ctx.feature, job, model, success: false,
      error: e instanceof Error ? e.message : String(e),
    });
    await reportOutage(e);
    throw e;
  }
}

export interface GenOpts { maxTokens?: number; temperature?: number }

export async function geminiJSON<T>(prompt: string, job: AiJob, ctx: UsageCtx, gen: GenOpts = {}): Promise<T> {
  const { text } = await generate(prompt, job, ctx, { json: true, ...gen });
  return extractJSON<T>(text);
}

/** Tolerant JSON extraction: strips fences, then finds the outermost {...}
 *  or [...] if strict parsing fails (long contexts sometimes get chatter). */
export function extractJSON<T>(text: string): T {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/g, "").trim();
  try { return JSON.parse(cleaned) as T; } catch {}
  const start = cleaned.search(/[{[]/);
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)) as T; } catch {}
  }
  throw new Error("Model returned unparseable JSON");
}

export async function geminiText(prompt: string, job: AiJob, ctx: UsageCtx, temperature = 0.4): Promise<string> {
  const { text } = await generate(prompt, job, ctx, { temperature });
  return text.trim();
}

export async function embedQuery(text: string, ctx: UsageCtx): Promise<number[]> {
  return embedWithTask(text, "RETRIEVAL_QUERY", ctx);
}
export async function embedDocument(text: string, ctx: UsageCtx): Promise<number[]> {
  return embedWithTask(text.slice(0, 6000), "RETRIEVAL_DOCUMENT", ctx);
}

async function embedWithTask(text: string, taskType: string, ctx: UsageCtx): Promise<number[]> {
  const model = embeddingModel();
  try {
    if (!KEY()) throw new AiUnavailableError("auth", "No Gemini API key configured (GEMINI_API_KEY)");
    const values = await withRetry(async () => {
      const res = await fetch(`${BASE}/${model}:embedContent?key=${KEY()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: 768,
        }),
      });
      if (!res.ok) throw httpError(`Embedding ${model}`, res.status, (await res.text()).slice(0, 400));
      const data = await res.json();
      const v = data?.embedding?.values;
      if (!Array.isArray(v) || v.length !== 768) throw new Error("Bad embedding response");
      return v as number[];
    });
    // Embedding responses don't return token usage the way generateContent
    // does - approximate input tokens from text length (~4 chars/token) so
    // the cost estimate isn't just left blank.
    await AiUsageService.log({
      userId: ctx.userId, feature: ctx.feature, job: "embedding", model,
      inputTokens: Math.ceil(text.length / 4), outputTokens: 0, success: true,
    });
    return values;
  } catch (e) {
    await AiUsageService.log({
      userId: ctx.userId, feature: ctx.feature, job: "embedding", model, success: false,
      error: e instanceof Error ? e.message : String(e),
    });
    await reportOutage(e);
    throw e;
  }
}

/** Web-grounded generation (Gemini google_search tool). Returns the model's
 *  JSON-ish text plus real source links from grounding metadata. If the model
 *  or key doesn't support grounding, callers fall back to plain generation. */
export async function geminiGroundedJSON(
  prompt: string, job: AiJob, ctx: UsageCtx, gen: GenOpts = {}
): Promise<{ data: Record<string, unknown>; sources: { title: string; uri: string }[] }> {
  const { text, raw } = await generate(prompt, job, ctx, { tools: [{ google_search: {} }], ...gen });
  const chunks = raw?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks
    .map((c: any) => c?.web ? { title: c.web.title ?? c.web.uri ?? "source", uri: c.web.uri } : null)
    .filter(Boolean)
    .filter((s: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.uri === s.uri) === i)
    .slice(0, 12);
  // Grounded responses sometimes carry annotation text around the JSON -
  // use the same tolerant extractor; if it STILL fails, throw so callers
  // fall back to the structured (non-grounded) call instead of showing
  // raw model text to the user.
  const data = extractJSON<Record<string, unknown>>(text);
  return { data, sources };
}
