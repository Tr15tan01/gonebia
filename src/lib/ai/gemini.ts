const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const KEY = () => process.env.GEMINI_API_KEY;
// Override via env if a model is retired or you want a different tier,
// e.g. GEMINI_CHAT_MODEL=gemini-2.0-flash
const CHAT_MODEL = () => process.env.GEMINI_CHAT_MODEL ?? "gemini-3.6-flash";
const EMBED_MODEL = () => process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001";

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 400 * 2 ** i)); }
  }
  throw last;
}

async function generate(prompt: string, opts: { json?: boolean; temperature?: number } = {}): Promise<string> {
  const model = CHAT_MODEL();
  return withRetry(async () => {
    const res = await fetch(`${BASE}/${model}:generateContent?key=${KEY()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
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
    return text;
  });
}

export async function geminiJSON<T>(prompt: string): Promise<T> {
  const text = await generate(prompt, { json: true });
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

export async function geminiText(prompt: string, temperature = 0.4): Promise<string> {
  return (await generate(prompt, { temperature })).trim();
}

export async function embedQuery(text: string): Promise<number[]> {
  return embedWithTask(text, "RETRIEVAL_QUERY");
}
export async function embedDocument(text: string): Promise<number[]> {
  return embedWithTask(text.slice(0, 6000), "RETRIEVAL_DOCUMENT");
}

async function embedWithTask(text: string, taskType: string): Promise<number[]> {
  const model = EMBED_MODEL();
  return withRetry(async () => {
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
    const values = data?.embedding?.values;
    if (!Array.isArray(values) || values.length !== 768) throw new Error("Bad embedding response");
    return values as number[];
  });
}


/** Web-grounded generation (Gemini google_search tool). Returns the model's
 *  JSON-ish text plus real source links from grounding metadata. If the model
 *  or key doesn't support grounding, callers fall back to plain generation. */
export async function geminiGroundedJSON(prompt: string): Promise<{ data: Record<string, unknown>; sources: { title: string; uri: string }[] }> {
  const model = CHAT_MODEL();
  return withRetry(async () => {
    const res = await fetch(`${BASE}/${model}:generateContent?key=${KEY()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini grounded ${model} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
    if (!text) throw new Error("Gemini grounded returned empty response");
    const chunks = json?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
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
  });
}
