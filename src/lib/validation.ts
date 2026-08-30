import { z } from "zod";
import { MEMORY_TYPES } from "./types";

const isoOrNull = z
  .string().nullable()
  .transform((v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null));

const bookInfoSchema = z.object({
  title: z.string().min(1).max(200),
  author: z.string().max(120).nullable().catch(null),
  status: z.enum(["want_to_read", "reading", "finished", "abandoned"]).catch("finished"),
  rating: z.number().int().min(1).max(5).nullable().catch(null),
  recommended_by: z.string().max(80).nullable().catch(null),
});

export const structuredSchema = z.object({
  type: z.enum(MEMORY_TYPES),
  title: z.string().min(1).max(140),
  summary: z.string().max(500),
  people: z.array(z.string().max(80)).max(10).catch([]),
  places: z.array(z.string().max(80)).max(10).catch([]),
  objects: z.array(z.string().max(80)).max(10).catch([]),
  products: z.array(z.string().max(80)).max(10).catch([]),
  companies: z.array(z.string().max(80)).max(10).catch([]),
  amounts: z.array(z.object({
    value: z.number(), currency: z.string().max(8).default("GEL"), label: z.string().max(80).optional(),
  })).max(6).catch([]),
  category: z.string().max(60).default("general"),
  importance: z.number().int().min(1).max(5).catch(3),
  status: z.enum(["open", "done", "archived"]).catch("open"),
  sentiment: z.enum(["positive", "neutral", "negative"]).nullable().catch(null),
  confidence: z.number().min(0).max(1).catch(0.5),
  is_decision: z.boolean().catch(false),
  decision_reason: z.string().max(500).nullable().catch(null),
  alternatives: z.array(z.string().max(120)).max(5).catch([]),
  book: bookInfoSchema.nullable().catch(null),
  occurred_at: isoOrNull, due_at: isoOrNull, reminder_at: isoOrNull, review_at: isoOrNull,
  interpretation: z.string().max(240).catch("Saved to your memory."),
});

export const captureSchema = z.object({
  text: z.string().min(1).max(4000),
  source: z.enum(["typed", "voice"]).default("typed"),
  timezone: z.string().max(64).default("UTC"),
  at: z.string().nullable().optional()
    .transform((v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null)),
});

export const correctionSchema = z.object({
  original_text: z.string().min(1).max(4000).optional(),
  title: z.string().min(1).max(140).optional(),
  type: z.enum(MEMORY_TYPES).optional(),
  status: z.enum(["open", "done", "archived"]).optional(),
  occurred_at: z.string().nullable().optional(),
  due_at: z.string().nullable().optional(),
  reminder_at: z.string().nullable().optional(),
  review_at: z.string().nullable().optional(),
  importance: z.number().int().min(1).max(5).optional(),
});

export const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(2000),
  })).min(1).max(24),
  timezone: z.string().max(64).default("UTC"),
});

export const insightActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["dismiss", "done", "not_relevant", "goal_created"]),
});

export const notificationActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["done", "snooze", "dismiss", "not_relevant"]),
});

export const goalSchema = z.object({
  title: z.string().min(1).max(140),
  from_memory_id: z.string().uuid().optional(),
});

export const prefsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  quiet_hours_start: z.number().int().min(0).max(23).optional(),
  quiet_hours_end: z.number().int().min(0).max(23).optional(),
  push_enabled: z.boolean().optional(),
  insight_sensitivity: z.number().min(0.5).max(0.95).optional(),
  timezone: z.string().max(64).optional(),
});
