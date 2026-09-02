import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Logged-in diagnostics: tests the Gemini key/models directly and reports
 *  recent extraction health. Visit /api/debug/gemini in your browser.
 *  Rate-limited: this makes real (billed) Gemini calls on the shared server
 *  key, so without a limit any signed-up user could hammer it to run up
 *  usage/cost outside the app's own per-plan limits. */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized - log in first" }, { status: 401 });
  if (!rateLimit(`debug-gemini:${user.id}`, 5, 3600_000)) {
    return NextResponse.json({ error: "Rate limited - try again in a bit." }, { status: 429 });
  }

  const key = process.env.GEMINI_API_KEY;
  const chatModel = process.env.GEMINI_CHAT_MODEL ?? "gemini-3.6-flash";
  const embedModel = process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001";

  const result: Record<string, unknown> = {
    gemini_key_present: !!key,
    chat_model: chatModel,
    embed_model: embedModel,
  };

  if (key) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${chatModel}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with exactly: OK" }] }] }),
        }
      );
      result.chat_call = res.ok
        ? "ok"
        : `FAILED HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
    } catch (e) {
      result.chat_call = `NETWORK ERROR: ${e instanceof Error ? e.message : String(e)}`;
    }

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${embedModel}:embedContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: `models/${embedModel}`,
            content: { parts: [{ text: "hello" }] },
            taskType: "RETRIEVAL_DOCUMENT",
            outputDimensionality: 768,
          }),
        }
      );
      result.embedding_call = res.ok
        ? "ok"
        : `FAILED HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
    } catch (e) {
      result.embedding_call = `NETWORK ERROR: ${e instanceof Error ? e.message : String(e)}`;
    }
  } else {
    result.fix = "Add GEMINI_API_KEY to this environment's env vars, then REDEPLOY.";
  }

  // extraction health: how many of your recent memories failed AI extraction
  try {
    const admin = createAdmin();
    const { data } = await admin
      .from("memory_metadata")
      .select("extraction_status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    const counts: Record<string, number> = {};
    for (const r of data ?? []) {
      const s = (r as any).extraction_status ?? "none";
      counts[s] = (counts[s] ?? 0) + 1;
    }
    result.recent_extraction_status = counts;
    result.hint =
      counts.failed > 0 || (Object.keys(counts).length > 0 && (counts.complete ?? 0) === 0)
        ? "Failed extractions mean Gemini was unreachable at capture time - fix the calls above, then new captures will classify correctly."
        : "Extraction looks healthy.";
  } catch (e) {
    result.recent_extraction_status = `error: ${e instanceof Error ? e.message : String(e)}`;
  }

  return NextResponse.json(result);
}
