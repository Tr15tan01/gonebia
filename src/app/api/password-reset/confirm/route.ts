import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { createAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8).max(72),
});

function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`reset-confirm:${ip}`, 5, 15 * 60_000)) {
    return NextResponse.json({ error: "Too many attempts - please try again in a few minutes." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const { token, password } = parsed.data;

  const admin = createAdmin();
  const token_hash = hashToken(token);
  const { data: record } = await admin
    .from("password_reset_tokens")
    .select("id, user_id, expires_at, used_at")
    .eq("token_hash", token_hash)
    .maybeSingle();

  if (!record || record.used_at || new Date(record.expires_at) < new Date()) {
    return NextResponse.json({ error: "This reset link is invalid or has expired. Please request a new one." }, { status: 400 });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const { error: updateErr } = await admin.from("users").update({ password_hash }).eq("id", record.user_id);
  if (updateErr) {
    console.error("[password-reset] failed to update password:", updateErr);
    return NextResponse.json({ error: "Couldn't reset your password - please try again." }, { status: 500 });
  }

  // one-time use: mark it spent immediately so the same link can't be replayed
  await admin.from("password_reset_tokens").update({ used_at: new Date().toISOString() }).eq("id", record.id);

  return NextResponse.json({ ok: true });
}
