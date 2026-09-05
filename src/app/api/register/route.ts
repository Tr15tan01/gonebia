import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import * as Sentry from "@sentry/nextjs";
import { createAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { sendEmail, verifyEmailEmail } from "@/lib/email";

const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72), // bcrypt silently ignores bytes past 72
});

function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function POST(req: NextRequest) {
  // registration has no session yet to key a rate limit on - use the caller's IP instead,
  // to slow down automated account-creation abuse. Same 5-per-window policy as login.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`register:${ip}`, 5, 15 * 60_000)) {
    return NextResponse.json({ error: "Too many attempts - please try again in a few minutes." }, { status: 429 });
  }

  const parsed = registerSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { name, email, password } = parsed.data;

  const admin = createAdmin();

  const { data: existing } = await admin.from("users").select("id").eq("email", email).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const { data: user, error } = await admin
    .from("users")
    .insert({ email, password_hash, full_name: name })
    .select("id")
    .single();
  if (error || !user) {
    console.error("[register] failed to create user:", error);
    Sentry.captureException(error, { extra: { stage: "create user" } });
    return NextResponse.json({ error: "Couldn't create your account - please try again." }, { status: 500 });
  }

  // replicates what the old Supabase-trigger (handle_new_user) used to do automatically
  const [{ error: profileErr }, { error: prefsErr }] = await Promise.all([
    admin.from("profiles").insert({ id: user.id, email, full_name: name }),
    admin.from("user_preferences").insert({ user_id: user.id }),
  ]);
  if (profileErr || prefsErr) {
    console.error("[register] profile/preferences setup failed:", profileErr, prefsErr);
    Sentry.captureException(profileErr ?? prefsErr, { extra: { stage: "profile/preferences", userId: user.id } });
    // the account itself was created successfully - don't block sign-in over this,
    // but make sure it's visible for follow-up
  }

  // Always attempt to send a verification email, regardless of whether
  // REQUIRE_EMAIL_VERIFICATION is on - so the infrastructure works the
  // moment Resend is configured, without a separate step later. If Resend
  // isn't configured yet (testing), sendEmail() just logs and returns
  // false - it never blocks registration either way.
  try {
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const expires_at = new Date(Date.now() + 24 * 3600_000).toISOString();
    const { error: tokenErr } = await admin.from("email_verification_tokens").insert({
      user_id: user.id, token_hash: hashToken(rawToken), expires_at,
    });
    if (!tokenErr) {
      const site = process.env.NEXT_PUBLIC_SITE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
      const verifyUrl = `${site}/verify-email?token=${rawToken}`;
      const { subject, html } = verifyEmailEmail(verifyUrl);
      await sendEmail(email, subject, html);
    }
  } catch (e) {
    console.error("[register] verification email step failed (account still created):", e);
  }

  return NextResponse.json({
    ok: true,
    requireVerification: process.env.REQUIRE_EMAIL_VERIFICATION === "1",
  });
}
