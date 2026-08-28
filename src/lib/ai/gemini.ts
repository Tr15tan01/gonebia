const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const KEY = () => process.env.GEMINI_API_KEY;
const CHAT_MODEL = "gemini-2.0-flash";
const EMBED_MODEL = "gemini-embedding-001";

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 400 * 2 ** i)); }
  }
  throw last;
}

async function generate(prompt: string, opts: { json?: boolean; temperature?: number } = {}): Promise<string> {
  return withRetry(async () => {
    const res = await fetch(`${BASE}/${CHAT_MODEL}:generateContent?key=${KEY()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: opts.temperature ?? 0.2,
          maxOutputTokens: 2048,
          ...(opts.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
    if (!text) throw new Error("Gemini returned empty response");
    return text;
  });
}

export async function geminiJSON<T>(prompt: string): Promise<T> {
  const text = await generate(prompt, { json: true });
  return JSON.parse(text.replace(/^```json\s*|```\s*$/g, "").trim()) as T;
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
  return withRetry(async () => {
    const res = await fetch(`${BASE}/${EMBED_MODEL}:embedContent?key=${KEY()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: 768,
      }),
    });
    if (!res.ok) throw new Error(`Embedding ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const values = data?.embedding?.values;
    if (!Array.isArray(values) || values.length !== 768) throw new Error("Bad embedding response");
    return values as number[];
  });
}
