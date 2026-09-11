import { embedDocument } from "@/lib/ai/gemini";
import type { Structured } from "@/lib/types";

export const EmbeddingService = {
  textFor(m: { original_text: string; structured?: Structured | null }): string {
    const s = m.structured;
    return [m.original_text, s?.title, s?.summary, s?.people.join(" "), s?.products.join(" "), s?.companies.join(" ")]
      .filter(Boolean).join("\n");
  },
  async embed(text: string, userId: string): Promise<number[]> {
    return embedDocument(text, { userId, feature: "capture_embedding" });
  },
};
