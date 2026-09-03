import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import * as Sentry from "@sentry/nextjs";
import { createAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";

const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72), // bcrypt silently ignores bytes past 72
});

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

  return NextResponse.json({ ok: true });
}
