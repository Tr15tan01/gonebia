import { PushService } from "@/lib/services/push";

export const NOTIF_KIND: Record<string, string> = {
  reminder: "\u23f0",
  forgotten_memory: "\ud83e\udde0",
  connection: "\ud83e\udde9",
  recurring_pattern: "\ud83d\udd04",
  insight: "\ud83d\udc41\ufe0f",
  upcoming_event: "\ud83d\udcc5",
  daily_briefing: "\ud83c\udf05",
  agent_done: "\ud83e\udd16",
  price_watch: "\ud83d\uded2",
  future_note: "\ud83d\udd70\ufe0f",
};

export function isQuietNow(tz: string, qs: number, qe: number): boolean {
  try {
    const hour = parseInt(
      new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: tz }).format(new Date()),
      10
    );
    return qs > qe ? hour >= qs || hour < qe : hour >= qs && hour < qe;
  } catch { return false; }
}

/** One path for ALL notifications: dedupe -> insert -> push (quiet-hours aware). */
export async function createNotification(
  admin: any,
  p: { userId: string; kind: string; title: string; body: string; url: string;
       dedupeKey?: string; memoryId?: string | null; insightId?: string | null }
) {
  if (p.dedupeKey) {
    const { data: existing } = await admin
      .from("notifications").select("id")
      .eq("user_id", p.userId).eq("dedupe_key", p.dedupeKey).limit(1);
    if (existing?.length) return null;
  }
  const { data: row, error } = await admin.from("notifications").insert({
    user_id: p.userId, kind: p.kind, title: p.title, body: p.body,
    data: { url: p.url }, memory_id: p.memoryId ?? null,
    insight_id: p.insightId ?? null, dedupe_key: p.dedupeKey ?? null,
  }).select().single();
  if (error || !row) { console.error("[notif] insert failed:", error); return null; }

  const { data: prefs } = await admin
    .from("user_preferences").select("push_enabled,quiet_hours_start,quiet_hours_end")
    .eq("user_id", p.userId).single();
  const { data: prof } = await admin.from("profiles").select("timezone").eq("id", p.userId).single();
  const quiet = isQuietNow(prof?.timezone ?? "UTC", prefs?.quiet_hours_start ?? 22, prefs?.quiet_hours_end ?? 8);
  if (prefs?.push_enabled && !quiet) {
    await PushService.pushToUser(p.userId, {
      title: `TimelyMemo - ${p.title}`, body: p.body, url: p.url,
    });
  }
  return row;
}
