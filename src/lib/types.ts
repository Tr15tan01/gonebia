export const MEMORY_TYPES = [
  "thought","idea","task","event","purchase","expense","knowledge","book","question",
  "decision","promise","commitment","goal","habit","person","place","project",
  "observation","reflection","reminder",
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export type BookStatus = "want_to_read" | "reading" | "finished" | "abandoned";

export interface BookInfo {
  title: string;
  author: string | null;
  status: BookStatus;
  rating: number | null;
  recommended_by: string | null;
}

export interface Amount { value: number; currency: string; label?: string }

export interface Structured {
  type: MemoryType;
  title: string;
  summary: string;
  people: string[];
  places: string[];
  objects: string[];
  products: string[];
  companies: string[];
  amounts: Amount[];
  category: string;
  importance: number;
  status: "open" | "done" | "archived";
  sentiment: "positive" | "neutral" | "negative" | null;
  confidence: number;
  is_decision: boolean;
  decision_reason: string | null;
  alternatives: string[];
  book: BookInfo | null;
  occurred_at: string | null;
  due_at: string | null;
  reminder_at: string | null;
  review_at: string | null;
  interpretation: string;
}

export interface MemoryRow {
  id: string;
  original_text: string;
  created_at: string;
  type: MemoryType;
  title: string;
  summary: string;
  importance: number;
  status: string;
  due_at: string | null;
  occurred_at: string | null;
  people: string[];
}

export interface SimilarHit { id: string; title: string; created_at: string; similarity: number }

export interface ChatReference { n: number; id: string; title: string; date: string; snippet: string }
