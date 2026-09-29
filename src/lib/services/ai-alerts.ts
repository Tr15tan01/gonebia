import { createAdmin } from "@/lib/supabase/admin";
import { OUTAGE_LABEL, type AiOutage } from "@/lib/ai/errors";

/** When the AI is down for a reason only the owner can fix (spend cap,
 *  quota, bad key), every admin gets an in-app notification - and a push,
 *  if they've enabled push - at most once per outage type per day. The
 *  admin panel shows the live state from ai_usage_log as well. */

const lastRaised = new Map<AiOutage, number>();
const IN_PROCESS_COOLDOWN_MS = 10 * 60_000;

export async function raiseAiOutageAlert(reason: AiOutage, detail: string): Promise<void> {
  const now = Date.now();
  if (now - (lastRaised.get(reason) ?? 0) < IN_PROCESS_COOLDOWN_MS) return;
  lastRaised.set(reason, now);
  try {
    const admin = createAdmin();
    const { data: admins } = await admin.from("users").select("id").eq("role", "admin").is("disabled_at", null);
    if (!admins?.length) return;
    const { createNotification } = await import("@/lib/notifications");
    const label = OUTAGE_LABEL[reason];
    const day = new Date().toISOString().slice(0, 10);
    for (const a of admins) {
      await createNotification(admin, {
        userId: a.id,
        kind: "system_alert",
        title: `⚠️ ${label.title}`,
        body: `AI features are failing for users. ${label.fix}`,
        url: "/admin",
        dedupeKey: `ai-outage:${reason}:${day}`,
      }).catch((e: unknown) => console.error("[ai-alerts] notify failed:", e));
    }
    console.error(`[ai-alerts] ${reason}: ${detail.slice(0, 300)}`);
  } catch (e) {
    console.error("[ai-alerts] could not raise alert:", e);
  }
}
