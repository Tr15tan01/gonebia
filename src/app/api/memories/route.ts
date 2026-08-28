import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { fetchTimeline } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Number(sp.get("limit")) || 20, 50);
  const types = sp.get("types")?.split(",").filter(Boolean);
  const data = await fetchTimeline(
    {
      types,
      status: sp.get("status") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
    },
    sp.get("cursor") ?? undefined,
    limit
  );
  return NextResponse.json({
    memories: data,
    nextCursor: data.length === limit ? data[data.length - 1].created_at : null,
  });
}
