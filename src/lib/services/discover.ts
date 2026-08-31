import { createAdmin } from "@/lib/supabase/admin";
import { geminiJSON } from "@/lib/ai/gemini";
import { getPlan } from "@/lib/limits";

const DAY = 86_400_000;

async function memoriesInWindow(admin: any, userId: string, fromISO: string, toISO: string, limit = 100) {
  const { data } = await admin
    .from("memories")
    .select("id, original_text, created_at, memory_metadata(type, title)")
    .eq("user_id", userId).is("deleted_at", null)
    .gte("created_at", fromISO).lte("created_at", toISO)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((m: any) => ({
    id: m.id,
    text: (m.original_text ?? "").slice(0, 200),
    date: (m.created_at ?? "").slice(0, 10),
    type: (Array.isArray(m.memory_metadata) ? m.memory_metadata[0]?.type : m.memory_metadata?.type) ?? "thought",
  }));
}

function contextBlock(items: { id: string; text: string; date: string }[]) {
  return items.map((m) => `[${m.id.slice(0, 8)}] (${m.date}) ${m.text}`).join("\n");
}

const RULES = `Use ONLY the provided memories. Cite memory ids exactly as given (e.g. "a1b2c3d4").
Never invent memories. If there is not enough evidence for a section, say so explicitly.
Return ONLY valid JSON in the requested shape.`;

export const DiscoverService = {
  async run(userId: string, kind: string, windowDays: number | null, plan: string) {
    const admin = createAdmin();

    if (kind === "themes") {
      const days = windowDays ?? 90;
      const items = await memoriesInWindow(admin, userId,
        new Date(Date.now() - days * DAY).toISOString(), new Date().toISOString(),
        plan === "pro" ? 150 : 80);
      if (items.length < 3) {
        return { error: items.length === 0
          ? `No memories in the last ${days} days yet - tell TimelyMemo a few things and this analysis will light up.`
          : `Only ${items.length} ${items.length === 1 ? "memory" : "memories"} in the last ${days} days so far - a couple more and this gets interesting.` };
      }
      const result = await geminiJSON(`Analyze what this person has been thinking about over the last ${days} days.

MEMORIES:
 ${contextBlock(items)}

 ${RULES}
Shape: { "themes": [ { "name": string, "percent": number, "trend": "rising"|"stable"|"fading", "note": string, "memory_ids": [up to 3 ids] } ], "summary": string, "quiet_periods": string }
4-8 themes ordered by percent descending.`);
      return { result, items };
    }

    if (kind === "missing") {
      const [openTasks, projects, decisions, patterns, intentions, events] = await Promise.all([
        admin.from("memory_metadata")
          .select("memory_id, title, due_at, created_at, memories!inner(original_text, created_at)")
          .eq("user_id", userId).eq("status", "open")
          .in("type", ["task", "promise", "commitment"])
          .order("created_at", { ascending: false }).limit(15),
        admin.from("memory_metadata")
          .select("memory_id, title, memories!inner(original_text)")
          .eq("user_id", userId).eq("status", "open").eq("type", "project").limit(8),
        admin.from("memory_metadata")
          .select("memory_id, title, memories!inner(original_text)")
          .eq("user_id", userId).eq("status", "open").eq("is_decision", true).limit(8),
        admin.from("insights").select("title, body").eq("user_id", userId).eq("kind", "pattern").eq("status", "new").limit(5),
        admin.from("insights").select("title, body").eq("user_id", userId).eq("kind", "intention").eq("status", "new").limit(5),
        admin.from("events")
          .select("memory_id, event_at, memories(original_text)")
          .eq("user_id", userId).gte("event_at", new Date().toISOString()).limit(8),
      ]);

      const parts: string[] = [];
      if (openTasks.data?.length) parts.push("OPEN TASKS/PROMISES:\n" + openTasks.data.map((t: any) =>
        `- [${t.memory_id.slice(0, 8)}] ${t.title || t.memories?.original_text} (from ${(t.created_at ?? "").slice(0, 10)}${t.due_at ? `, due ${(t.due_at ?? "").slice(0, 10)}` : ""})`).join("\n"));
      if (projects.data?.length) parts.push("UNFINISHED PROJECTS:\n" + projects.data.map((p: any) =>
        `- [${p.memory_id.slice(0, 8)}] ${p.title || p.memories?.original_text}`).join("\n"));
      if (decisions.data?.length) parts.push("OPEN DECISIONS:\n" + decisions.data.map((d: any) =>
        `- [${d.memory_id.slice(0, 8)}] ${d.title || d.memories?.original_text}`).join("\n"));
      if (events.data?.length) parts.push("UPCOMING EVENTS:\n" + events.data.map((e: any) =>
        `- [${(e.memory_id ?? "event").slice(0, 8)}] ${(e.memories?.original_text ?? "").slice(0, 80)} (${(e.event_at ?? "").slice(0, 10)})`).join("\n"));
      if (patterns.data?.length) parts.push("RECURRING PATTERNS:\n" + patterns.data.map((i: any) => `- ${i.title}: ${i.body}`).join("\n"));
      if (intentions.data?.length) parts.push("REPEATED INTENTIONS:\n" + intentions.data.map((i: any) => `- ${i.title}: ${i.body}`).join("\n"));
      if (!parts.length) return { error: "Nothing looks unresolved right now - your open loops are clean." };

      const result = await geminiJSON(`A person keeps a memory journal. Below are their unresolved items. Identify what they are most likely MISSING or neglecting, prioritized.

 ${parts.join("\n\n")}

 ${RULES}
Shape: { "items": [ { "category": "task"|"promise"|"event"|"project"|"decision"|"pattern"|"intention", "title": string, "detail": string, "urgency": "high"|"medium"|"low", "memory_ids": [ids] } ], "headline": string }
Max 8 items ordered by urgency. Concrete, never preachy.`);
      return { result };
    }

    if (kind === "past_me") {
      const months = windowDays === 30 ? 1 : windowDays === 180 ? 6 : 12;
      const past = await memoriesInWindow(admin, userId,
        new Date(Date.now() - (months * 30 + 14) * DAY).toISOString(),
        new Date(Date.now() - months * 30 * DAY).toISOString(), 60);
      const recent = await memoriesInWindow(admin, userId,
        new Date(Date.now() - 14 * DAY).toISOString(), new Date().toISOString(), 40);
      if (past.length < 3) return { error: `Only ${past.length} ${past.length === 1 ? "memory" : "memories"} from ${months} month${months > 1 ? "s" : ""} ago - come back when there is more history to compare.` };
      const result = await geminiJSON(`Compare this person's past self with their present self.

PAST (${months} month${months > 1 ? "s" : ""} ago, ${past.length} memories):
 ${contextBlock(past)}

RECENT (last 2 weeks, ${recent.length} memories):
 ${contextBlock(recent)}

 ${RULES}
Shape: { "letter": string (3-5 sentences, warm, past-you speaking to present-you), "past_themes": [string], "what_changed": [ { "change": string, "note": string } ], "what_persisted": [string], "open_loops_then": [string] }
Max 4 items per list. Honest but kind. No diagnoses.`);
      return { result, items: [...past.slice(0, 6), ...recent.slice(0, 4)] };
    }

    if (kind === "radar") {
      const [forgotten, overdue, conn, upcoming] = await Promise.all([
        admin.from("insights").select("title, body").eq("user_id", userId).eq("kind", "forgotten").eq("status", "new").limit(5),
        admin.from("memory_metadata")
          .select("memory_id, title, due_at, memories!inner(original_text)")
          .eq("user_id", userId).eq("status", "open").in("type", ["task", "promise", "commitment"])
          .lt("due_at", new Date().toISOString()).limit(5),
        admin.from("insights").select("title, body").eq("user_id", userId).eq("kind", "connection").eq("status", "new").limit(3),
        memoriesInWindow(admin, userId,
          new Date(Date.now() + 7 * DAY).toISOString(), new Date(Date.now() + 30 * DAY).toISOString(), 8),
      ]);
      const parts: string[] = [];
      if (forgotten.data?.length) parts.push("FORGOTTEN:\n" + forgotten.data.map((f: any) => `- ${f.title}: ${f.body}`).join("\n"));
      if (overdue.data?.length) parts.push("OVERDUE:\n" + overdue.data.map((t: any) =>
        `- [${t.memory_id.slice(0, 8)}] ${t.title || t.memories?.original_text} (due ${(t.due_at ?? "").slice(0, 10)})`).join("\n"));
      if (conn.data?.length) parts.push("EMERGING THEMES:\n" + conn.data.map((c: any) => `- ${c.title}: ${c.body}`).join("\n"));
      if (upcoming.length) parts.push("COMING UP:\n" + upcoming.map((e) => `- [${e.id.slice(0, 8)}] ${e.text}`).join("\n"));
      if (!parts.length) return { error: "Your radar is clear - nothing urgent, forgotten, or emerging right now." };

      const result = await geminiJSON(`Radar sweep of this person's life signals. Prioritize what needs ATTENTION this week.

 ${parts.join("\n\n")}

 ${RULES}
Shape: { "alerts": [ { "category": "forgotten"|"overdue"|"emerging"|"upcoming", "message": string, "urgency": "high"|"medium"|"low", "memory_ids": [ids] } ], "calm_note": string }
Max 6 alerts. Always include one calm_note (something going fine).`);
      return { result };
    }


    if (kind === "conflicts") {
      const all = await memoriesInWindow(admin, userId,
        new Date(Date.now() - 365 * DAY).toISOString(), new Date().toISOString(),
        plan === "pro" ? 120 : 70);
      if (all.length < 8) return { error: `You have ${all.length} memories - finding tensions needs at least 8 to be meaningful. Keep capturing.` };
      const result = await geminiJSON(`Compare what this person said across time and find real TENSIONS between their own statements - goals vs actions, commitments vs stated priorities, a decision later talked around, preferences that flipped.

MEMORIES (up to a year):
 ${contextBlock(all)}

Rules: Only report tensions where BOTH sides are clearly evidenced by the cited memories. Skip trivia. NEVER moralize - changing your mind is normal: label it "preference_change" or "decision_revisit", not a failure. This must read as a thoughtful friend, not an auditor.

Shape: { "framing": string (one sentence, warm, sets the non-judgmental tone), "conflicts": [ { "tension": string (2-4 word name, e.g. "Time vs ambition"), "kind": "goal_vs_action"|"priority_shift"|"commitment_vs_reality"|"preference_change"|"decision_revisit", "earlier": { "claim": string (paraphrase), "date": string, "memory_id": string }, "later": { "claim": string, "date": string, "memory_id": string }, "question": string (one gentle question for the person) } ] (max 4, most meaningful first) }`);
      return { result, items: all };
    }

    if (kind === "myself") {
      const all = await memoriesInWindow(admin, userId,
        new Date(Date.now() - 365 * DAY).toISOString(), new Date().toISOString(),
        plan === "pro" ? 150 : 80);
      if (all.length < 10) return { error: `You have ${all.length} memories so far - this portrait gets genuinely interesting around 10. Keep capturing.` };
      const result = await geminiJSON(`Build an honest portrait of this person from their own captured memories.

MEMORIES (up to a year):
 ${contextBlock(all)}

 ${RULES}
Shape: { "interests": [ { "topic": string, "evidence": string, "memory_ids": [ids] } ], "concerns": [ { "topic": string, "evidence": string, "memory_ids": [ids] } ], "goals": [ { "goal": string, "status_hint": string, "memory_ids": [ids] } ], "changes": [ { "from": string, "to": string } ], "one_liner": string }
3-5 interests, 2-4 concerns, 2-4 goals, max 3 changes. Grounded ONLY in the memories.`);
      return { result, items: all.slice(0, 10) };
    }

    return { error: "Unknown discover kind." };
  },
};
