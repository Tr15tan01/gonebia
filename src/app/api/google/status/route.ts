import { NextRequest, NextResponse } from "next/server";
import { getUser, createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { googleConfigured } from "@/lib/services/google";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = await createClient();
  const { data } = await sb.from("google_integrations").select("email, scopes").eq("user_id", user.id).single();
  return NextResponse.json({
    configured: googleConfigured(),
    connected: !!data,
    email: data?.email ?? null,
    scopes: data?.scopes ?? [],
  });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdmin();
  const { data: row } = await admin.from("google_integrations").select("access_token").eq("user_id", user.id).single();
  if (row?.access_token) {
    // best-effort revoke at Google; local row is deleted regardless
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: row.access_token }),
    }).catch(() => {});
  }
  await admin.from("google_integrations").delete().eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
