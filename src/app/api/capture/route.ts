import { NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { captureSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { MemoryExtractionService } from "@/lib/services/extraction";
import { EmbeddingService } from "@/lib/services/embedding";
import { ApplyService } from "@/lib/services/apply";
import type { SimilarHit } from "@/lib/types";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = captureSchema.parse(await req.json());
  if (!rateLimit(`capture:${user.id}`, 40, 3600_000)) {
    return NextResponse.json({ error: "Too many captures - take a breath." }, { status: 429 });
  }

  // memories always start with a capital letter
  body.text = body.text.charAt(0).toUpperCase() + body.text.slice(1);

  const sb = await createClient();
  const admin = createAdmin();

  // 1. Original memory - exact user text, never overwritten
  const { data: mem, error } = await sb
    .from("memories")
    .insert({ user_id: user.id, original_text: body.text, source: body.source })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 2. AI extraction - the memory is saved either way
  const structured = await MemoryExtractionService.extract(
    body.text, new Date(), body.timezone, body.at ?? null
  );

  if (structured) {
    const applied = await ApplyService.structured(
      admin, user.id, mem.id, structured, body.text, body.at ?? null, mem.created_at
    );
    if (!applied.ok) {
      console.error("[capture] structured data could not be stored - memory saved unstructured");
    }
  } else {
    const { error: metaError } = await admin.from("memory_metadata").insert({
      memory_id: mem.id, user_id: user.id,
      extraction_status: "failed", title: body.text.slice(0, 60),
    });
    if (metaError) console.error("[capture] fallback metadata insert failed:", metaError);
  }

  // 3. Embedding + "You said this before"
  let similar: SimilarHit[] = [];
  try {
    const embedding = await EmbeddingService.embed(
      EmbeddingService.textFor({ original_text: body.text, structured })
    );
    await admin.from("memory_embeddings").insert({ memory_id: mem.id, user_id: user.id, embedding });

    const { data: hits } = await sb.rpc("match_memories", {
      p_query_embedding: JSON.stringify(embedding), p_match_count: 4, p_min_similarity: 0.86,
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
