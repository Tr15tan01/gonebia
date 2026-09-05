import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { createAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { sendEmail, verifyEmailEmail } from "@/lib/email";

const schema = z.object({ email: z.string().trim().toLowerCase().email() });

function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`verify-resend:${ip}`, 5, 15 * 60_000)) {
    return NextResponse.json({ error: "Too many attempts - please try again in a few minutes." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  const { email } = parsed.data;

  // Generic response either way - same reasoning as password reset: never
  // confirm/deny whether an email has an account here.
  const GENERIC_OK = { ok: true, message: "If that account needs verifying, a new link is on its way." };

  const admin = createAdmin();
  const { data: user } = await admin.from("users").select("id, email, email_verified_at").eq("email", email).maybeSingle();
  if (!user || user.email_verified_at) return NextResponse.json(GENERIC_OK);

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expires_at = new Date(Date.now() + 24 * 3600_000).toISOString();
  const { error } = await admin.from("email_verification_tokens").insert({
    user_id: user.id, token_hash: hashToken(rawToken), expires_at,
  });
  if (error) { console.error("[verify-email] resend token creation failed:", error); return NextResponse.json(GENERIC_OK); }

  const site = process.env.NEXT_PUBLIC_SITE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const verifyUrl = `${site}/verify-email?token=${rawToken}`;
  const { subject, html } = verifyEmailEmail(verifyUrl);
  await sendEmail(user.email, subject, html);

  return NextResponse.json(GENERIC_OK);
}
