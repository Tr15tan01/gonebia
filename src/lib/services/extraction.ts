import { geminiJSON } from "@/lib/ai/gemini";
import { extractionPrompt } from "@/lib/ai/prompts";
import { structuredSchema } from "@/lib/validation";
import { aiOutageOf, type AiOutage } from "@/lib/ai/errors";
import type { Structured } from "@/lib/types";

export const MemoryExtractionService = {
  /** Returns validated structured data, or null on failure (the memory is still saved unstructured).
   *  pickedAt: optional user-picked date/time from the capture UI. */
  async extract(
    text: string,
    now: Date,
    timezone: string,
    userId: string,
    pickedAt?: string | null
  ): Promise<Structured | null> {
    return (await this.extractDetailed(text, now, timezone, userId, pickedAt)).structured;
  },

  /** Same, but also says whether it failed because the AI is unavailable
   *  (so capture can tell the user their note will be sorted later). */
  async extractDetailed(
    text: string,
    now: Date,
    timezone: string,
    userId: string,
    pickedAt?: string | null
  ): Promise<{ structured: Structured | null; outage: AiOutage | null }> {
    try {
      const raw = await geminiJSON<unknown>(
        extractionPrompt(text, now, timezone, pickedAt ?? null),
        "extraction",
        { userId, feature: "capture_extraction" }
      );
      return { structured: structuredSchema.parse(raw), outage: null };
    } catch (e) {
      console.error("[extraction] failed:", e);
      return { structured: null, outage: aiOutageOf(e) };
    }
  },
};
