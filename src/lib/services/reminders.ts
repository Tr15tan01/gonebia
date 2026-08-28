import { createAdmin } from "@/lib/supabase/admin";
import { PushService } from "./push";

export const ReminderService = {
  async schedule(userId: string, memoryId: string, remindAt: string) {
    const admin = createAdmin();
    await admin.from("reminders").insert({ user_id: userId, memory_id: memoryId, remind_at: remindAt });
  },

  async cancelForMemory(memoryId: string) {
    const admin = createAdmin();
    await admin.from("reminders").update({ status: "cancelled" }).eq("memory_id", memoryId).eq("status", "pending");
  },

  /** Fire due reminders as notifications + web push, honoring quiet hours.
   *  During quiet hours a reminder is postponed by one hour, never dropped. */
  async processDue() {
    const admin = createAdmin();
    const { data: due } = await admin
      .from("reminders").select("id, user_id, memory_id, remind_at")
      .eq("status", "pending").lte("remind_at", new Date().toISOString()).limit(100);
    if (!due?.length) return { fired: 0 };

    let fired = 0;
    for (const r of due) {
      const { data: prefs } = await admin.from("user_preferences").select("*").eq("user_id", r.user_id).single();
      const { data: profile } = await admin.from("profiles").select("timezone").eq("id", r.user_id).single();

      const hour = parseInt(
        new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit", hourCycle: "h23",
          timeZone: profile?.timezone ?? "UTC",
        }).format(new Date()),
        10
      );
      const qs = prefs?.quiet_hours_start ?? 22;
      const qe = prefs?.quiet_hours_end ?? 8;
      const inQuiet = qs > qe ? hour >= qs || hour < qe : hour >= qs && hour < qe;

      if (inQuiet) {
        await admin.from("reminders")
          .update({ remind_at: new Date(Date.now() + 3600_000).toISOString() })
          .eq("id", r.id);
        continue;
      }

      const { data: meta } = await admin.from("memory_metadata").select("title").eq("memory_id", r.memory_id).single();
      const title = meta?.title || "Reminder";
      const { data: notif } = await admin.from("notifications").insert({
        user_id: r.user_id, memory_id: r.memory_id, kind: "reminder",
        title, body: "You asked to be reminded of this.", data: { url: "/timeline" },
      }).select().single();
      await admin.from("reminders").update({ status: "fired" }).eq("id", r.id);

      if (notif && prefs?.push_enabled) {
        await PushService.pushToUser(r.user_id, {
          title: `Gonebia - ${title}`,
          body: "You asked to be reminded of this.",
          url: "/timeline",
        });
      }
      fired++;
    }
    return { fired };
  },
};

/** Re-activate snoozed notifications whose snooze_until has passed. */
export async function resurfaceSnoozed(): Promise<number> {
  const admin = createAdmin();
  const { data: snoozed } = await admin
    .from("notifications")
    .select("id, user_id, kind, title, body, data")
    .eq("status", "snoozed")
    .limit(100);
  const now = Date.now();
  const pushCache = new Map<string, boolean>();
  let resurfaced = 0;
  for (const n of snoozed ?? []) {
    const until = n.data?.snooze_until ? Date.parse(n.data.snooze_until) : 0;
    if (!until || until > now) continue;
    const data = { ...n.data };
    delete data.snooze_until;
    await admin.from("notifications").update({ status: "unread", data }).eq("id", n.id);
    if (!pushCache.has(n.user_id)) {
      const { data: p } = await admin
        .from("user_preferences").select("push_enabled").eq("user_id", n.user_id).single();
      pushCache.set(n.user_id, !!p?.push_enabled);
    }
    if (pushCache.get(n.user_id)) {
      await PushService.pushToUser(n.user_id, {
        title: `Gonebia - ${n.title}`, body: n.body, url: n.data?.url ?? "/dashboard",
      });
    }
    resurfaced++;
  }
  return resurfaced;
}
