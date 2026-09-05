import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { createAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({ token: z.string().min(20).max(200) });

function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`verify-confirm:${ip}`, 10, 15 * 60_000)) {
    return NextResponse.json({ error: "Too many attempts - please try again in a few minutes." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const admin = createAdmin();
  const token_hash = hashToken(parsed.data.token);
  const { data: record } = await admin
    .from("email_verification_tokens")
    .select("id, user_id, expires_at, used_at")
    .eq("token_hash", token_hash)
    .maybeSingle();

  if (!record || record.used_at || new Date(record.expires_at) < new Date()) {
    return NextResponse.json({ error: "This verification link is invalid or has expired. Please request a new one." }, { status: 400 });
  }

  const { error: updateErr } = await admin
    .from("users")
    .update({ email_verified_at: new Date().toISOString() })
    .eq("id", record.user_id);
  if (updateErr) {
    console.error("[verify-email] failed to mark verified:", updateErr);
    return NextResponse.json({ error: "Couldn't verify your email - please try again." }, { status: 500 });
  }

  await admin.from("email_verification_tokens").update({ used_at: new Date().toISOString() }).eq("id", record.id);

  return NextResponse.json({ ok: true });
}
