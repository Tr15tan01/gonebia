import { modelForJob, embeddingModel, type AiJob } from "./models";
import { AiUsageService } from "@/lib/services/ai-usage";

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

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 400 * 2 ** i)); }
  }
  throw last;
}

async function generate(
  prompt: string, job: AiJob, ctx: UsageCtx,
  opts: { json?: boolean; temperature?: number; tools?: unknown[] } = {}
): Promise<{ text: string; inputTokens: number; outputTokens: number; raw: any }> {
  const model = modelForJob(job);
  try {
    const result = await withRetry(async () => {
      const res = await fetch(`${BASE}/${model}:generateContent?key=${KEY()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          ...(opts.tools ? { tools: opts.tools } : {}),
          generationConfig: {
            temperature: opts.temperature ?? 0.2,
            maxOutputTokens: 4096,
            ...(opts.json ? { responseMimeType: "application/json" } : {}),
          },
        }),
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        throw new Error(`Gemini ${model} HTTP ${res.status}: ${body}`);
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
      if (!text) throw new Error(`Gemini ${model} returned empty response`);
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
    throw e;
  }
}

export async function geminiJSON<T>(prompt: string, job: AiJob, ctx: UsageCtx): Promise<T> {
  const { text } = await generate(prompt, job, ctx, { json: true });
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
      if (!res.ok) throw new Error(`Embedding ${model} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
    throw e;
  }
}

/** Web-grounded generation (Gemini google_search tool). Returns the model's
 *  JSON-ish text plus real source links from grounding metadata. If the model
 *  or key doesn't support grounding, callers fall back to plain generation. */
export async function geminiGroundedJSON(
  prompt: string, job: AiJob, ctx: UsageCtx
): Promise<{ data: Record<string, unknown>; sources: { title: string; uri: string }[] }> {
  const { text, raw } = await generate(prompt, job, ctx, { tools: [{ google_search: {} }] });
  const chunks = raw?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks
    .map((c: any) => c?.web ? { title: c.web.title ?? c.web.uri ?? "source", uri: c.web.uri } : null)
    .filter(Boolean)
    .slice(0, 8);
  // Grounded responses sometimes carry annotation text around the JSON -
  // use the same tolerant extractor; if it STILL fails, throw so callers
  // fall back to the structured (non-grounded) call instead of showing
  // raw model text to the user.
  const data = extractJSON<Record<string, unknown>>(text);
  return { data, sources };
}
