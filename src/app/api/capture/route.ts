import { NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { captureSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { MemoryExtractionService } from "@/lib/services/extraction";
import { EmbeddingService } from "@/lib/services/embedding";
import { ApplyService } from "@/lib/services/apply";
import { getPlan, getUsage, bumpUsage, LIMITS, activeReminderCount, limitResponse } from "@/lib/limits";
import type { SimilarHit } from "@/lib/types";
import { getPostHogClient } from "@/lib/posthog-server";

export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = captureSchema.parse(await req.json());
  if (!rateLimit(`capture:${user.id}`, 40, 3600_000)) {
    return NextResponse.json({ error: "Too many captures - take a breath." }, { status: 429 });
  }

  const sb = await createClient();
  const admin = createAdmin();

  // server-side plan limits (never client-enforced)
  const plan = await getPlan(sb, user.id);
  const lim = LIMITS[plan];
  const usage = await getUsage(sb, user.id);
  const isVoice = body.source === "voice";
  if (isVoice && usage.voice >= lim.voicePerMonth) {
    return limitResponse("voice", `Free plan allows ${lim.voicePerMonth} voice memories per month (used ${usage.voice}). Upgrade to Pro for ${LIMITS.pro.voicePerMonth}.`);
  }
  if (!isVoice && usage.text >= lim.textPerMonth) {
    return limitResponse("text", `Free plan allows ${lim.textPerMonth} memories per month (used ${usage.text}). Upgrade to Pro for ${LIMITS.pro.textPerMonth}.`);
  }

  // reminder cap (active pending reminders)
  const remindersAtCap = (await activeReminderCount(admin, user.id)) >= lim.activeReminders;
  const warnings: string[] = [];
  if (remindersAtCap) {
    warnings.push(`Reminder limit reached (${lim.activeReminders} on the ${plan === "free" ? "Free" : "Pro"} plan) - this memory is saved, but no reminder was scheduled.`);
  }

  // memories always start with a capital letter
  body.text = body.text.charAt(0).toUpperCase() + body.text.slice(1);

  const { data: mem, error } = await sb
    .from("memories")
    .insert({ user_id: user.id, original_text: body.text, source: body.source })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // count this capture against the plan (after the row exists)
  await bumpUsage(sb, user.id, isVoice ? "voice_month" : "text_month");

  const structured = await MemoryExtractionService.extract(
    body.text, new Date(), body.timezone, body.at ?? null
  );

  if (structured) {
    // Future Memory is Pro - keep the note, drop the scheduling, say so
    if (structured.review_at && !lim.futureMemory) {
      structured.review_at = null;
      structured.reminder_at = structured.reminder_at ?? null;
      warnings.push("Future Memory (show me this in one year) is a Pro feature - your note was saved but not scheduled.");
    }
    if (remindersAtCap) structured.reminder_at = null;

    const applied = await ApplyService.structured(
      admin, user.id, mem.id, structured, body.text, body.at ?? null, mem.created_at
    );
    if (!applied.ok) console.error("[capture] structured data could not be stored - memory saved unstructured");
  } else {
    const { error: metaError } = await admin.from("memory_metadata").insert({
      memory_id: mem.id, user_id: user.id,
      extraction_status: "failed", title: body.text.slice(0, 60),
    });
    if (metaError) console.error("[capture] fallback metadata insert failed:", metaError);
  }

  // embedding + You Said This Before (gated: free 3/month)
  let similar: SimilarHit[] = [];
  try {
    const embedding = await EmbeddingService.embed(
      EmbeddingService.textFor({ original_text: body.text, structured })
    );
    await admin.from("memory_embeddings").insert({ memory_id: mem.id, user_id: user.id, embedding });

    const { data: hits } = await sb.rpc("match_memories", {
      p_user: user.id, p_query_embedding: JSON.stringify(embedding), p_match_count: 4, p_min_similarity: 0.86,
    });
    const others = (hits ?? []).filter((h: any) => h.memory_id !== mem.id).slice(0, 3);

    let allowed = true;
    if (others.length && plan !== "pro") {
      const ystb = await getUsage(sb, user.id);
      allowed = ystb.ystb < lim.youSaidThisBeforePerMonth;
      if (allowed) await bumpUsage(sb, user.id, "ystb_month");
    }

    if (others.length && allowed) {
      await sb.from("memory_relationships").upsert(
        others.map((h: any) => ({
          user_id: user.id, from_memory_id: mem.id, to_memory_id: h.memory_id,
          kind: "similar", score: h.similarity,
        }))
      );
      const { data: rows } = await sb
        .from("memories")
        .select("id, original_text, created_at, memory_metadata(title)")
        .in("id", others.map((h: any) => h.memory_id));
      similar = (rows ?? []).map((r: any) => ({
        id: r.id,
        title: r.memory_metadata?.title || r.original_text.slice(0, 60),
        created_at: r.created_at,
        similarity: others.find((h: any) => h.memory_id === r.id)?.similarity ?? 0,
      }));
    }
  } catch (e) {
    console.error("[capture] embedding/similar failed:", e);
  }

  const ph = getPostHogClient();
  if (ph) {
    ph.capture({
      distinctId: user.id,
      event: "memory_captured_server",
      properties: {
        source: body.source,
        plan,
        memory_type: structured?.type ?? "thought",
        has_reminder: !!structured?.reminder_at,
        has_due_date: !!structured?.due_at,
        similar_count: similar.length,
        extraction_success: !!structured,
      },
    });
    await ph.flush();
  }

  return NextResponse.json({
    id: mem.id,
    interpretation: structured?.interpretation ?? "Saved to your memory.",
    structured,
    similar,
    plan,
    warnings,
  });
}
