import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { buildAuthUrl, googleConfigured } from "@/lib/services/google";

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/settings?google=notconfigured", req.url));
  }
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set("g_state", state, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600,
  });
  return res;
}
