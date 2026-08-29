import { geminiJSON } from "@/lib/ai/gemini";
import { extractionPrompt } from "@/lib/ai/prompts";
import { structuredSchema } from "@/lib/validation";
import type { Structured } from "@/lib/types";

export const MemoryExtractionService = {
  /** Returns validated structured data, or null on failure (the memory is still saved unstructured).
   *  pickedAt: optional user-picked date/time from the capture UI. */
  async extract(
    text: string,
    now: Date,
    timezone: string,
    pickedAt?: string | null
  ): Promise<Structured | null> {
    try {
      const raw = await geminiJSON<unknown>(
        extractionPrompt(text, now, timezone, pickedAt ?? null)
      );
      return structuredSchema.parse(raw);
    } catch (e) {
      console.error("[extraction] failed:", e);
      return null;
    }
  },
};
