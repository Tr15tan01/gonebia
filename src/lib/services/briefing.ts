import { createAdmin } from "@/lib/supabase/admin";
import { daysAgo, relTime } from "@/lib/dates";
import { getPlan, LIMITS } from "@/lib/limits";
import { createNotification } from "@/lib/notifications";

const DAY = 86_400_000;

export const BriefingService = {
  async getForUser(userId: string) {
    const admin = createAdmin();
    const today = new Date().toISOString().slice(0, 10);

    const { data: cached } = await admin
      .from("daily_briefings")
      .select("content, created_at")
      .eq("user_id", userId).eq("briefing_date", today).single();
    if (cached?.content && Date.now() - new Date(cached.created_at).getTime() < 5 * 60 * 1000) {
      return cached.content;
    }

    const plan = await getPlan(admin, userId);
    const lim = LIMITS[plan];
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);

    const [todayRes, forgottenRes, futureRes, revisitRes, connRes] = await Promise.all([
      admin.from("memory_metadata")
        .select("memory_id, title, type, due_at, reminder_at, memories(original_text)")
        .eq("user_id", userId).eq("status", "open")
        .or(`due_at.lte.${endOfToday.toISOString()},reminder_at.lte.${endOfToday.toISOString()}`)
        .order("importance", { ascending: false }).limit(5),
      admin.from("insights")
        .select("id, title, body, data")
        .eq("user_id", userId).eq("kind", "forgotten").eq("status", "new")
        .order("created_at", { ascending: false }).limit(3),
      admin.from("memory_metadata")
        .select("memory_id, review_at, memories(original_text, created_at)")
        .eq("user_id", userId).eq("status", "open")
        .lte("review_at", new Date().toISOString()).limit(3),
      admin.from("memory_metadata")
        .select("memory_id, title, type, importance, created_at, memories(original_text)")
        .eq("user_id", userId).eq("status", "open").gte("importance", 4)
        .lt("created_at", new Date(Date.now() - 14 * DAY).toISOString())
        .order("created_at", { ascending: false }).limit(2),
      admin.from("insights")
        .select("id, title, body, data")
        .eq("user_id", userId).eq("kind", "connection").eq("status", "new")
        .order("created_at", { ascending: false }).limit(1),
    ]);

    const connection = connRes.data?.[0] ?? null;
    const content = {
      date: today,
      today: (todayRes.data ?? []).map((m: any) => ({
        id: m.memory_id, title: m.title, type: m.type,
        when: m.due_at ? `due ${relTime(m.due_at)}` : m.reminder_at ? `reminder ${relTime(m.reminder_at)}` : "",
        iso: m.due_at ?? m.reminder_at ?? null,
        text: m.memories?.original_text ?? "",
      })),
      dontForget: (forgottenRes.data ?? []).map((f: any) => ({
        id: f.id, title: f.title, body: f.body, memory_id: f.data?.memory_id,
      })),
      revisit: [
        ...(futureRes.data ?? []).map((m: any) => ({
          id: m.memory_id, kind: "future_note" as const,
          title: `A message from you ${daysAgo(m.memories?.created_at) ?? "some"} days ago`,
          text: m.memories?.original_text ?? "",
        })),
        ...(revisitRes.data ?? []).map((m: any) => ({
          id: m.memory_id, kind: "revisit" as const,
          title: m.title || m.type, text: (m.memories?.original_text ?? "").slice(0, 140),
        })),
      ],
      interesting: connection ? {
        id: connection.id, title: connection.title, body: connection.body,
        members: connection.data?.members ?? [],
      } : null,
    };

    await admin.from("daily_briefings").upsert(
      { user_id: userId, briefing_date: today, content },
      { onConflict: "user_id,briefing_date" }
    );

    // Daily briefing NOTIFICATION - Pro only, deduped per day
    if (lim.dailyBriefingNotification
        && (content.today.length > 0 || content.dontForget.length > 0)) {
      await createNotification(admin, {
        userId, kind: "daily_briefing",
        title: "Your daily briefing is ready",
        body: `${content.today.length} due today - ${content.dontForget.length} forgotten item${content.dontForget.length === 1 ? "" : "s"}`,
        url: "/dashboard", dedupeKey: `briefing:${today}`,
      });
    }

    return content;
  },
};
