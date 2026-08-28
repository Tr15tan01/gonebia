import { geminiJSON } from "@/lib/ai/gemini";
import { extractionPrompt } from "@/lib/ai/prompts";
import { structuredSchema } from "@/lib/validation";
import type { Structured } from "@/lib/types";

export const MemoryExtractionService = {
  /** Returns validated structured data, or null on failure (the memory is still saved unstructured). */
  async extract(text: string, now: Date, timezone: string): Promise<Structured | null> {
    try {
      const raw = await geminiJSON<unknown>(extractionPrompt(text, now, timezone));
      return structuredSchema.parse(raw);
    } catch (e) {
      console.error("[extraction] failed:", e);
      return null;
    }
  },
};
