import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { createAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { sendEmail, passwordResetEmail } from "@/lib/email";

const schema = z.object({ email: z.string().trim().toLowerCase().email() });

function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  // Same 5-per-15-min policy as login/register. Keyed by IP only (not email)
  // on purpose - the generic response below never confirms whether an email
  // exists, so rate-limiting by email would itself leak that information via
  // timing/behavior differences.
  if (!rateLimit(`reset-request:${ip}`, 5, 15 * 60_000)) {
    return NextResponse.json({ error: "Too many attempts - please try again in a few minutes." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  const { email } = parsed.data;

  // Always return the same generic success message whether or not the email
  // exists - this is deliberate: revealing "no account with that email"
  // would let anyone enumerate which emails have accounts.
  const GENERIC_OK = { ok: true, message: "If an account exists for that email, a reset link is on its way." };

  const admin = createAdmin();
  const { data: user } = await admin.from("users").select("id, email").eq("email", email).maybeSingle();
  if (!user) return NextResponse.json(GENERIC_OK);

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expires_at = new Date(Date.now() + 30 * 60_000).toISOString();
  const { error } = await admin.from("password_reset_tokens").insert({
    user_id: user.id, token_hash: hashToken(rawToken), expires_at,
  });
  if (error) {
    console.error("[password-reset] failed to create token:", error);
    return NextResponse.json(GENERIC_OK); // still generic - don't leak internal errors either
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const resetUrl = `${site}/reset-password?token=${rawToken}`;
  const { subject, html } = passwordResetEmail(resetUrl);
  const sent = await sendEmail(user.email, subject, html);
  if (!sent) console.error("[password-reset] email send failed for user", user.id);

  return NextResponse.json(GENERIC_OK);
}
