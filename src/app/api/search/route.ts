import { NextRequest, NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { MemoryRetrievalService } from "@/lib/services/retrieval";

// Involves an embedding call plus the hybrid_search RPC - can exceed
// Vercel's default serverless timeout even though it runs fine locally.
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`search:${user.id}`, 120, 60_000)) {
    return NextResponse.json({ error: "slow down" }, { status: 429 });
  }
  const sp = req.nextUrl.searchParams;
  const sb = await createClient();
  try {
    const results = await MemoryRetrievalService.hybrid(sb, user.id, {
      query: sp.get("q") ?? "",
      types: sp.get("types")?.split(",").filter(Boolean) ?? null,
      person: sp.get("person"),
      status: sp.get("status"),
      from: sp.get("from"), to: sp.get("to"),
      limit: Math.min(Number(sp.get("limit")) || 20, 40),
    });
    return NextResponse.json({ results });
  } catch (e: any) {
    console.error("[search]", e);
    return NextResponse.json({ error: e.message ?? "search failed" }, { status: 500 });
  }
}
