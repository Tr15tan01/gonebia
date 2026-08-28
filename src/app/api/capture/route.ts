import { NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { captureSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { MemoryExtractionService } from "@/lib/services/extraction";
import { EmbeddingService } from "@/lib/services/embedding";
import { BookService } from "@/lib/services/books";
import type { Structured, SimilarHit } from "@/lib/types";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = captureSchema.parse(await req.json());
  if (!rateLimit(`capture:${user.id}`, 40, 3600_000)) {
    return NextResponse.json({ error: "Too many captures - take a breath." }, { status: 429 });
  }

  const sb = await createClient();
  const admin = createAdmin();

  // 1. Original memory - exact user text, never overwritten
  const { data: mem, error } = await sb
    .from("memories")
    .insert({ user_id: user.id, original_text: body.text, source: body.source })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 2. AI extraction - the memory is saved either way, extraction failure is not fatal
  const structured: Structured | null = await MemoryExtractionService.extract(
    body.text, new Date(), body.timezone
  );

  if (structured) {
    // `book` and `interpretation` are NOT columns of memory_metadata - keep them out of the insert
    const { interpretation, book, ...meta } = structured;
    await admin.from("memory_metadata").insert({
      memory_id: mem.id, user_id: user.id, ...meta,
      occurred_at: meta.occurred_at ?? mem.created_at,
    });

    if (book) {
      await BookService.upsertFromCapture(admin, user.id, mem.id, book);
    }
    if (["task", "promise", "commitment"].includes(meta.type)) {
      await admin.from("tasks").insert({ memory_id: mem.id, user_id: user.id, due_at: meta.due_at });
    }
    if (meta.type === "event") {
      await admin.from("events").insert({
        memory_id: mem.id, user_id: user.id, event_at: meta.occurred_at, place: meta.places[0] ?? null,
      });
    }
    if (meta.type === "purchase" || meta.type === "expense") {
      await admin.from("purchases").insert({
        memory_id: mem.id, user_id: user.id,
        product: meta.products[0] ?? meta.objects[0] ?? meta.title,
        company: meta.companies[0] ?? null,
        amount: meta.amounts[0]?.value ?? null,
        currency: meta.amounts[0]?.currency ?? "GEL",
        purchased_at: meta.occurred_at,
      });
    }
    if (meta.is_decision) {
      await admin.from("decisions").insert({
        memory_id: mem.id, user_id: user.id,
        decided_at: meta.occurred_at ?? mem.created_at,
        reason: meta.decision_reason, alternatives: meta.alternatives,
      });
    }
    for (const name of meta.people) {
      const normalized = name.toLowerCase().trim();
      const { data: person } = await admin
        .from("people")
        .upsert({ user_id: user.id, name, normalized, last_mentioned_at: new Date().toISOString() },
          { onConflict: "user_id,normalized" })
        .select().single();
      if (person) await admin.from("memory_people").upsert({ memory_id: mem.id, person_id: person.id, user_id: user.id });
    }
    if (meta.reminder_at) {
      await admin.from("reminders").insert({ user_id: user.id, memory_id: mem.id, remind_at: meta.reminder_at });
    }
    if (meta.review_at) {
      // Future memory - queue the reveal for the user's future self
      await admin.from("reminders").insert({ user_id: user.id, memory_id: mem.id, remind_at: meta.review_at });
      await admin.from("notifications").insert({
        user_id: user.id, memory_id: mem.id, kind: "future_note",
        title: "A message from your past self",
        body: `On ${new Date(mem.created_at).toLocaleDateString()} you wrote: "${body.text.slice(0, 120)}"`,
        data: { url: "/timeline" },
      });
    }
  } else {
    await admin.from("memory_metadata").insert({
      memory_id: mem.id, user_id: user.id,
      extraction_status: "failed", title: body.text.slice(0, 60),
    });
  }

  // 3. Embedding + "You said this before" - one embed; the similarity RPC runs
  //    under the user's own session so RLS scopes results to their memories only.
  let similar: SimilarHit[] = [];
  try {
    const embedding = await EmbeddingService.embed(
      EmbeddingService.textFor({ original_text: body.text, structured })
    );
    await admin.from("memory_embeddings").insert({ memory_id: mem.id, user_id: user.id, embedding });

    const { data: hits } = await sb.rpc("match_memories", {
      p_query_embedding: embedding, p_match_count: 4, p_min_similarity: 0.86,
    });
    const others = (hits ?? []).filter((h: any) => h.memory_id !== mem.id).slice(0, 3);

    if (others.length) {
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

  return NextResponse.json({
    id: mem.id,
    interpretation: structured?.interpretation ?? "Saved to your memory.",
    structured,
    similar,
  });
}
