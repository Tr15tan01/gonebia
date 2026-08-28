import { createAdmin } from "@/lib/supabase/admin";
import { geminiText } from "@/lib/ai/gemini";
import { clusterNamePrompt } from "@/lib/ai/prompts";
import { daysAgo } from "@/lib/dates";

const DAY = 86_400_000;

/** pgvector columns come back from PostgREST as "[0.1,0.2,...]" strings - parse before math. */
function parseVec(v: unknown): number[] {
  if (Array.isArray(v)) return v as number[];
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
  return [];
}

function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

interface ClusterItem {
  id: string; embedding: number[]; title: string; created_at: string;
  type?: string; status?: string;
}

/** Greedy single-pass clustering; adequate for personal-scale data (hundreds to low thousands). */
function cluster(items: ClusterItem[], threshold: number): ClusterItem[][] {
  const clusters: ClusterItem[][] = [];
  for (const it of items) {
    let placed = false;
    for (const c of clusters) {
      if (c.some((m) => cosine(m.embedding, it.embedding) >= threshold)) { c.push(it); placed = true; break; }
    }
    if (!placed) clusters.push([it]);
  }
  return clusters;
}

/** Insert an insight unless a live insight of the same kind already draws on largely the same memories. */
async function insertInsight(admin: any, userId: string, row: {
  kind: string; title: string; body: string; data: object; source: string[];
}): Promise<boolean> {
  const { data: existing } = await admin
    .from("insights")
    .select("id, source_memory_ids")
    .eq("user_id", userId)
    .eq("kind", row.kind)
    .in("status", ["new", "goal_created"]);
  const sourceSet = new Set(row.source);
  const dup = (existing ?? []).some((e: any) => {
    const prev: string[] = e.source_memory_ids ?? [];
    const overlap = prev.filter((id) => sourceSet.has(id)).length;
    return overlap / Math.max(1, Math.min(prev.length, row.source.length)) > 0.6;
  });
  if (dup) return false;
  await admin.from("insights").insert({
    user_id: userId, kind: row.kind, title: row.title, body: row.body,
    data: row.data, source_memory_ids: row.source,
  });
  return true;
}

/** If the user keeps dismissing a kind of insight, quiet down (learn from behaviour). */
async function kindSuppressed(admin: any, userId: string, kind: string) {
  const { count } = await admin.from("insights")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("kind", kind).in("status", ["dismissed", "not_relevant"]);
  return (count ?? 0) >= 5;
}

export const InsightService = {
  async runForUser(userId: string) {
    const admin = createAdmin();
    const { data: prefs } = await admin
      .from("user_preferences").select("insight_sensitivity").eq("user_id", userId).single();
    const sens = prefs?.insight_sensitivity ?? 0.75;
    let created = 0;

    // ---- 1. WHAT AM I FORGETTING? --------------------------------------
    if (!(await kindSuppressed(admin, userId, "forgotten"))) {
      const { data: open } = await admin
        .from("memory_metadata")
        .select("memory_id, title, type, importance, due_at, created_at, memories!inner(original_text, created_at)")
        .eq("user_id", userId)
        .eq("status", "open")
        .in("type", ["task", "promise", "commitment", "question", "decision", "reminder"])
        .order("created_at", { ascending: false })
        .limit(50);
      for (const m of open ?? []) {
        const overdue = !!m.due_at && new Date(m.due_at) < new Date();
        const age = daysAgo(m.memories?.created_at ?? m.created_at) ?? 0;
        const stale = age >= 6;
        if (!overdue && !stale) continue;
        const score = (overdue ? 2 : 0) + (m.importance >= 4 ? 1 : 0) + Math.min(age / 10, 2);
        if (score < 1) continue;
        if (await insertInsight(admin, userId, {
          kind: "forgotten",
          title: m.title || "Open item",
          body: overdue
            ? `This was due ${daysAgo(m.due_at)} days ago. Still needed?`
            : `You mentioned this ${age} days ago and it's still open. Still needed?`,
          data: { memory_id: m.memory_id, days: age, overdue },
          source: [m.memory_id],
        })) created++;
      }
    }

    // ---- 2. CONNECT THE DOTS -------------------------------------------
    if (!(await kindSuppressed(admin, userId, "connection"))) {
      const { data: rows } = await admin
        .from("memory_embeddings")
        .select("memory_id, embedding, memories!inner(created_at, memory_metadata(title))")
        .eq("user_id", userId)
        .gte("created_at", new Date(Date.now() - 90 * DAY).toISOString())
        .limit(120);
      const items: ClusterItem[] = (rows ?? []).map((r: any) => ({
        id: r.memory_id,
        embedding: parseVec(r.embedding),
        title: r.memories?.memory_metadata?.title || "",
        created_at: r.memories?.created_at,
      })).filter((m) => m.embedding.length > 0);

      for (const c of cluster(items, 0.82 - (1 - sens) * 0.1)) {
        if (c.length < 3) continue;
        const spanDays = (Date.now() - Math.min(...c.map((m) => +new Date(m.created_at)))) / DAY;
        if (spanDays < 3) continue; // same-day repeats are not "connections"
        let label = "A recurring thread";
        try {
          label = (await geminiText(clusterNamePrompt(c.map((m) => m.title || "Untitled"))))
            .replace(/["'.]/g, "").slice(0, 80);
        } catch {}
        if (await insertInsight(admin, userId, {
          kind: "connection",
          title: label,
          body: `You've mentioned this ${c.length} times recently. These may all be part of one larger theme.`,
          data: { members: c.map((m) => ({ id: m.id, title: m.title, created_at: m.created_at })) },
          source: c.slice(0, 12).map((m) => m.id),
        })) created++;
      }
    }

    // ---- 3. INTENTION VS REALITY ----------------------------------------
    if (!(await kindSuppressed(admin, userId, "intention"))) {
      const { data: rows } = await admin
        .from("memory_embeddings")
        .select("memory_id, embedding, memories!inner(created_at, memory_metadata!inner(type, status, title))")
        .eq("user_id", userId)
        .limit(150);
      const items: ClusterItem[] = (rows ?? []).map((r: any) => ({
        id: r.memory_id,
        embedding: parseVec(r.embedding),
        title: r.memories?.memory_metadata?.title || "",
        created_at: r.memories?.created_at,
        type: r.memories?.memory_metadata?.type,
        status: r.memories?.memory_metadata?.status,
      })).filter((m) =>
        m.embedding.length > 0 &&
        ["goal", "habit", "task", "idea"].includes(m.type ?? "") &&
        m.status === "open"
      );

      for (const c of cluster(items, 0.88)) {
        if (c.length < 3) continue;
        const times = c.map((m) => +new Date(m.created_at));
        const span = (Math.max(...times) - Math.min(...times)) / DAY;
        if (span < 30) continue; // must be a durable intention, not a week's mood
        const first = new Date(Math.min(...times)).toISOString();
        if (await insertInsight(admin, userId, {
          kind: "intention",
          title: c[0].title || "A recurring intention",
          body: `You've expressed this intention ${c.length} times over ${Math.round(span)} days, and it's still open. No judgment - just noticing.`,
          data: {
            occurrences: c.length, span_days: Math.round(span), first_mentioned: first,
            members: c.map((m) => ({ id: m.id, title: m.title, created_at: m.created_at })),
          },
          source: c.slice(0, 12).map((m) => m.id),
        })) created++;
      }
    }

    // ---- 4. RECURRING PATTERNS ------------------------------------------
    if (!(await kindSuppressed(admin, userId, "pattern"))) {
      const { data: buys } = await admin
        .from("purchases")
        .select("memory_id, product, purchased_at")
        .eq("user_id", userId)
        .not("product", "is", null)
        .limit(200);
      const groups = new Map<string, { memory_id: string; purchased_at: string | null }[]>();
      for (const b of buys ?? []) {
        const k = (b.product as string).toLowerCase().trim();
        if (!k) continue;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(b);
      }
      for (const [product, list] of groups) {
        if (list.length < 3) continue; // sufficient evidence only
        const times = list.map((b) => +new Date(b.purchased_at ?? 0)).filter((t) => t > 0).sort((a, b) => a - b);
        if (times.length < 3) continue;
        const gaps: number[] = [];
        for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / DAY);
        const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const spread = Math.max(...gaps) - Math.min(...gaps);
        if (avg < 7 || avg > 180 || spread > avg * 0.6) continue; // too irregular to be a pattern
        if (await insertInsight(admin, userId, {
          kind: "pattern",
          title: `Recurring: ${product}`,
          body: `You usually buy this every ${Math.max(1, Math.round(avg - spread / 2))}-${Math.round(avg + spread / 2)} days. Want a reminder around day ${Math.max(1, Math.round(avg) - 3)}?`,
          data: { product, avg_interval_days: Math.round(avg), occurrences: list.length, memory_ids: list.map((b) => b.memory_id) },
          source: list.map((b) => b.memory_id),
        })) created++;
      }
    }

    return { created };
  },
};
